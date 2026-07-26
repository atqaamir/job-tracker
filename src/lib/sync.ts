import { prisma } from "@/lib/prisma";
import { listMessageIds, getMessage, GmailAuthError } from "@/lib/gmail";
import { classifyEmail, type AIConfig } from "@/lib/ai/classify";
import { decrypt } from "@/lib/crypto";
import { normalizeCompanyKey } from "@/lib/company-normalize";
import type { ApplicationStatus, EmailCategory, EmploymentType } from "@/generated/prisma/client";

const DEFAULT_QUERY =
  "job OR application OR interview OR offer OR rejection OR recruiter OR position OR opportunity";
const STALE_DAYS = 14;

// Ranks the non-terminal stages of an application so furthestStage can track
// the high-water mark reached, even after `status` later moves to a terminal
// outcome (REJECTED/WITHDRAWN/GHOSTED aren't ranked — they don't represent
// progress, so they never become furthestStage).
const STAGE_RANK: Partial<Record<ApplicationStatus, number>> = {
  DRAFT: 0,
  APPLIED: 1,
  VIEWED: 2,
  RECRUITER_CONTACTED: 3,
  ASSESSMENT: 4,
  PHONE_SCREEN: 5,
  TECHNICAL_INTERVIEW: 6,
  FINAL_INTERVIEW: 7,
  OFFER: 8,
  ACCEPTED: 9,
};

function isProgressStage(status: ApplicationStatus | null | undefined): status is ApplicationStatus {
  return !!status && status in STAGE_RANK;
}

/** The more advanced of the two stages, or whichever one is set if only one is. */
function furthestOf(
  a: ApplicationStatus | null | undefined,
  b: ApplicationStatus | null | undefined
): ApplicationStatus | null {
  if (!isProgressStage(a)) return isProgressStage(b) ? b : null;
  if (!isProgressStage(b)) return a;
  return STAGE_RANK[b]! > STAGE_RANK[a]! ? b : a;
}

export interface SyncSummary {
  emailsScanned: number;
  emailsProcessed: number;
  applicationsNew: number;
  applicationsUpdated: number;
  newApplications: { id: string; company: string; position: string }[];
  recruiterResponses: { id: string; company: string; position: string }[];
  interviewInvitations: { id: string; company: string; position: string }[];
  codingAssessments: { id: string; company: string; position: string }[];
  rejections: { id: string; company: string; position: string }[];
  offers: { id: string; company: string; position: string }[];
  staleApplications: { id: string; company: string; position: string; daysSinceLastEmail: number }[];
  errors: string[];
}

function emptySummary(): SyncSummary {
  return {
    emailsScanned: 0,
    emailsProcessed: 0,
    applicationsNew: 0,
    applicationsUpdated: 0,
    newApplications: [],
    recruiterResponses: [],
    interviewInvitations: [],
    codingAssessments: [],
    rejections: [],
    offers: [],
    staleApplications: [],
    errors: [],
  };
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const REGULAR_SYNC_FALLBACK_DAYS = 14;
const FIRST_TIME_LOOKBACK_DAYS = 365;

export interface RunSyncOptions {
  /**
   * How many most-recent days of the fetched range may use AI classification
   * (still requires an Anthropic API key configured and AI enabled in
   * Settings either way) — messages older than this within the fetch always
   * use the free classifier. Defaults to 14 (2 weeks), which is safe
   * regardless of how wide the fetch window ends up being: a stale
   * since-last-sync gap or a first-time year-long backfill both just get AI
   * on their most recent slice, so this needs no confirmation by default.
   * Whenever the fetch range itself exceeds 2 weeks, the caller should
   * confirm with the user before passing anything larger than 14 here (see
   * sync-button.tsx) — that's the only way this can spend real money on a
   * large backfill. Pass 0 to disable AI entirely for this run.
   */
  aiRecentDays?: number;
  /**
   * Search back settings.daysToLookBack instead of the regular
   * since-last-sync cursor — the "Fetch All Again" action. The caller is
   * responsible for wiping existing data first (see clearFetchedData) —
   * runSync doesn't do it, since the API route needs the wipe to happen
   * before it creates the SyncLog row it hands back to the client.
   */
  fullBackfill?: boolean;
  /**
   * Whether to create in-app Notification rows for interview invitations,
   * assessments, offers, rejections, and recruiter replies. Only the
   * automatic daily cron sync sets this — manual syncs (Sync Now, Fetch All
   * Again) skip notifications since the user is already actively looking at
   * the app when they trigger those. Defaults to false.
   */
  createNotifications?: boolean;
  /**
   * Reuse an already-created SyncLog row instead of creating a new one.
   * Used by the API route, which creates the row and returns its ID to the
   * client immediately (via `after()`) so the client can poll it for live
   * progress while the actual sync keeps running server-side, detached from
   * the request/response and from whether the browser tab stays open.
   */
  syncLogId?: string;
}

export async function runSync(userId: string, options: RunSyncOptions = {}): Promise<SyncSummary> {
  const aiRecentDays = options.aiRecentDays ?? 14;
  const notify = options.createNotifications ?? false;
  const summary = emptySummary();

  const syncLog = options.syncLogId
    ? await prisma.syncLog.update({ where: { id: options.syncLogId }, data: { status: "running" } })
    : await prisma.syncLog.create({ data: { userId, status: "running" } });

  try {
    let settings = await prisma.syncSettings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await prisma.syncSettings.create({
        data: { userId, gmailQuery: DEFAULT_QUERY },
      });
    }

    // Sync Now is a true incremental sync: only what's new since the last
    // successful sync (settings.lastSyncAt). Fetch All Again always uses the
    // full configured window, ignoring any cursor — the caller wipes
    // existing data first (see clearFetchedData) before calling runSync. A
    // genuinely first-ever sync (no lastSyncAt and no email ever recorded —
    // a brand new account, or right after Fetch All Again's wipe) instead
    // pulls a full year. Already-seen messages are skipped below via their
    // stored Gmail message ID either way, so none of this ever creates
    // duplicates.
    let since: Date;
    if (options.fullBackfill) {
      since = new Date(Date.now() - settings.daysToLookBack * 86_400_000);
    } else if (settings.lastSyncAt) {
      since = settings.lastSyncAt;
    } else {
      const hasExistingEmails = await prisma.emailRecord.findFirst({
        where: { application: { userId } },
        select: { id: true },
      });
      since = hasExistingEmails
        ? // Defensive fallback: data exists but no cursor for some other
          // reason. Shouldn't normally happen — lastSyncAt is set at the
          // end of every successful run.
          new Date(Date.now() - REGULAR_SYNC_FALLBACK_DAYS * 86_400_000)
        : new Date(Date.now() - FIRST_TIME_LOOKBACK_DAYS * 86_400_000);
    }

    const afterEpoch = Math.floor(since.getTime() / 1000);
    // category:primary excludes Gmail's Promotions/Social/Updates/Forums
    // tabs — job-application emails always land in Primary, and this cuts
    // out a lot of noise regardless of what the user's custom query says.
    const query = `${settings.gmailQuery} after:${afterEpoch} category:primary`;

    // A per-user key (encrypted at rest) takes precedence over the
    // server's ANTHROPIC_API_KEY, so each account can bring its own key.
    const apiKey = settings.anthropicApiKey ? decrypt(settings.anthropicApiKey) : (process.env.ANTHROPIC_API_KEY ?? null);
    const baseAiConfig: AIConfig | null = settings.aiEnabled && apiKey ? { apiKey, model: settings.aiModel } : null;
    const recentCutoff = new Date(Date.now() - aiRecentDays * 86_400_000);

    const messageIds = await listMessageIds(userId, query);
    summary.emailsScanned = messageIds.length;
    // Report the total right away so a polling client (see /api/sync/status)
    // can show a progress bar denominator before any message is processed.
    await prisma.syncLog.update({ where: { id: syncLog.id }, data: { emailsScanned: summary.emailsScanned } });

    const existing = await prisma.emailRecord.findMany({
      where: { gmailMessageId: { in: messageIds.map((m) => m.id) } },
      select: { gmailMessageId: true },
    });
    const existingIds = new Set(existing.map((e) => e.gmailMessageId));
    const toProcess = messageIds.filter((m) => !existingIds.has(m.id));

    let cancelled = false;
    for (const { id: messageId, threadId } of toProcess) {
      // Cheap poll relative to the Gmail fetch + classification call this
      // iteration is about to make. Checked once per message so a cancel
      // request (POST /api/sync/cancel) takes effect within one message.
      const current = await prisma.syncLog.findUnique({
        where: { id: syncLog.id },
        select: { cancelRequested: true },
      });
      if (current?.cancelRequested) {
        cancelled = true;
        break;
      }
      try {
        const message = await getMessage(userId, messageId);
        // Only messages within the last aiRecentDays get AI — everything
        // older in the fetched range always uses the free classifier.
        const aiConfig = message.receivedAt < recentCutoff ? null : baseAiConfig;
        const classification = await classifyEmail(
          {
            subject: message.subject,
            fromName: message.fromName,
            fromEmail: message.fromEmail,
            bodyText: message.bodyText,
            receivedAt: message.receivedAt,
          },
          aiConfig
        );

        summary.emailsProcessed++;
        // Live progress for a polling client — cheap relative to the Gmail
        // fetch + classification call this loop iteration already made.
        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: { emailsProcessed: summary.emailsProcessed },
        });

        if (!classification.isJobRelated) {
          continue;
        }

        let application = await findMatchingApplication(userId, threadId, classification);
        const isNew = !application;

        if (!application) {
          const initialStatus = (classification.suggestedStatus as ApplicationStatus) ?? "APPLIED";
          application = await prisma.jobApplication.create({
            data: {
              userId,
              company: classification.company ?? "Unknown Company",
              position: classification.position ?? "Unknown Position",
              status: initialStatus,
              furthestStage: isProgressStage(initialStatus) ? initialStatus : null,
              dateApplied: message.receivedAt,
              dateLastEmail: message.receivedAt,
              recruiterName: classification.recruiterName,
              recruiterEmail: classification.recruiterEmail,
              salaryMin: classification.salaryMin,
              salaryMax: classification.salaryMax,
              salaryCurrency: classification.salaryCurrency,
              location: classification.location,
              employmentType: classification.employmentType as EmploymentType | null,
              source: classification.source,
              aiSummary: classification.summary,
              aiSentiment: classification.sentiment,
              aiNextAction: classification.suggestedNextAction,
              aiDeadline: classification.deadline ? new Date(classification.deadline) : null,
            },
          });
          summary.applicationsNew++;
          summary.newApplications.push({
            id: application.id,
            company: application.company,
            position: application.position,
          });
        } else {
          // Gmail returns messages newest-first, so emails for an existing
          // thread/company don't arrive in chronological order. Extend
          // dateApplied backward and dateLastEmail forward regardless of
          // processing order, and only let "current state" fields (status,
          // summary, sentiment, next action, deadline) be overwritten by an
          // email that's actually newer than the latest one seen so far —
          // otherwise an older email processed later would stomp the
          // up-to-date status with stale information.
          const isNewestSoFar = !application.dateLastEmail || message.receivedAt >= application.dateLastEmail;
          const isOldestSoFar = !application.dateApplied || message.receivedAt < application.dateApplied;

          const data: Record<string, unknown> = {};
          if (!application.dateLastEmail || message.receivedAt > application.dateLastEmail) {
            data.dateLastEmail = message.receivedAt;
          }
          if (isOldestSoFar) {
            data.dateApplied = message.receivedAt;
          }
          if (isNewestSoFar) {
            data.aiSummary = classification.summary;
            data.aiSentiment = classification.sentiment;
            if (classification.suggestedStatus) data.status = classification.suggestedStatus;
            if (classification.suggestedNextAction) data.aiNextAction = classification.suggestedNextAction;
            if (classification.deadline) data.aiDeadline = new Date(classification.deadline);
          }
          // Independent of email recency: this email might reveal the
          // furthest stage was reached even if it's not the newest email
          // overall (e.g. an older "interview scheduled" email processed
          // after a newer rejection already updated status).
          const newFurthest = furthestOf(
            application.furthestStage as ApplicationStatus | null,
            classification.suggestedStatus as ApplicationStatus | null
          );
          if (newFurthest && newFurthest !== application.furthestStage) {
            data.furthestStage = newFurthest;
          }
          if (classification.recruiterName) data.recruiterName = classification.recruiterName;
          if (classification.recruiterEmail) data.recruiterEmail = classification.recruiterEmail;
          if (classification.salaryMin) data.salaryMin = classification.salaryMin;
          if (classification.salaryMax) data.salaryMax = classification.salaryMax;
          if (classification.salaryCurrency) data.salaryCurrency = classification.salaryCurrency;
          if (classification.location) data.location = classification.location;
          if (classification.employmentType) data.employmentType = classification.employmentType;
          if (classification.source) data.source = classification.source;

          application = await prisma.jobApplication.update({
            where: { id: application.id },
            data,
          });
          summary.applicationsUpdated++;
        }

        await prisma.emailRecord.create({
          data: {
            applicationId: application.id,
            gmailMessageId: message.id,
            gmailThreadId: message.threadId,
            subject: message.subject,
            fromName: message.fromName,
            fromEmail: message.fromEmail,
            toEmail: message.toEmail,
            receivedAt: message.receivedAt,
            snippet: message.snippet,
            bodyText: message.bodyText,
            bodyHtml: message.bodyHtml,
            gmailLink: message.gmailLink,
            category: classification.category as EmailCategory,
            aiSummary: classification.summary,
            aiConfidence: 1,
            isProcessed: true,
          },
        });

        const ref = { id: application.id, company: application.company, position: application.position };
        switch (classification.category) {
          case "INTERVIEW_INVITATION":
            summary.interviewInvitations.push(ref);
            if (notify) await createNotification(userId, "interview", `Interview invitation: ${ref.company}`, application.id);
            break;
          case "CODING_ASSESSMENT":
            summary.codingAssessments.push(ref);
            if (notify) await createNotification(userId, "assessment", `Coding assessment: ${ref.company}`, application.id);
            break;
          case "REJECTION":
            summary.rejections.push(ref);
            if (notify) await createNotification(userId, "rejection", `Rejection from ${ref.company}`, application.id);
            break;
          case "OFFER":
            summary.offers.push(ref);
            if (notify) await createNotification(userId, "offer", `Offer from ${ref.company}!`, application.id);
            break;
          case "RECRUITER_OUTREACH":
          case "INTERVIEW_FOLLOWUP":
          case "REQUEST_FOR_INFO":
            summary.recruiterResponses.push(ref);
            if (notify && !isNew) {
              await createNotification(userId, "recruiter_reply", `Recruiter reply: ${ref.company}`, application.id);
            }
            break;
        }
      } catch (err) {
        summary.errors.push(`Message ${messageId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // A cancelled run stops here: lastSyncAt is deliberately left untouched
    // (or, for fullBackfill, left null from clearFetchedData's wipe) so the
    // next sync's `since` cursor still covers whatever this run didn't get
    // to — otherwise the unprocessed remainder of the window would be
    // silently skipped forever.
    if (cancelled) {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          completedAt: new Date(),
          status: "cancelled",
          emailsScanned: summary.emailsScanned,
          emailsProcessed: summary.emailsProcessed,
          applicationsNew: summary.applicationsNew,
          applicationsUpdated: summary.applicationsUpdated,
          summary: JSON.parse(JSON.stringify(summary)),
        },
      });
      return summary;
    }

    const staleThreshold = new Date(Date.now() - STALE_DAYS * 86_400_000);
    const staleApps = await prisma.jobApplication.findMany({
      where: {
        userId,
        isArchived: false,
        status: { notIn: ["REJECTED", "WITHDRAWN", "ACCEPTED", "GHOSTED"] },
        dateLastEmail: { lt: staleThreshold },
      },
      select: { id: true, company: true, position: true, dateLastEmail: true },
    });
    summary.staleApplications = staleApps.map((a) => ({
      id: a.id,
      company: a.company,
      position: a.position,
      daysSinceLastEmail: a.dateLastEmail
        ? Math.floor((Date.now() - a.dateLastEmail.getTime()) / 86_400_000)
        : STALE_DAYS,
    }));

    await prisma.syncSettings.update({
      where: { userId },
      data: { lastSyncAt: new Date() },
    });

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        completedAt: new Date(),
        status: summary.errors.length > 0 ? "completed_with_errors" : "completed",
        emailsScanned: summary.emailsScanned,
        emailsProcessed: summary.emailsProcessed,
        applicationsNew: summary.applicationsNew,
        applicationsUpdated: summary.applicationsUpdated,
        summary: JSON.parse(JSON.stringify(summary)),
      },
    });

    return summary;
  } catch (err) {
    const message =
      err instanceof GmailAuthError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown sync error";
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { completedAt: new Date(), status: "failed", error: message },
    });
    throw err;
  }
}

async function findMatchingApplication(
  userId: string,
  threadId: string,
  classification: { company: string | null; position: string | null }
) {
  const byThread = await prisma.emailRecord.findFirst({
    where: { gmailThreadId: threadId, application: { userId } },
    include: { application: true },
    orderBy: { createdAt: "desc" },
  });
  if (byThread) return byThread.application;

  if (!classification.company) return null;

  const candidates = await prisma.jobApplication.findMany({
    where: { userId, isArchived: false },
  });
  // normalizeCompanyKey strips legal suffixes and HR/ATS boilerplate
  // ("Careers", "Recruiting", "Inc", etc.) so the same real company matches
  // across emails that named it inconsistently (application-confirmation
  // vs. a recruiter's personal reply vs. an ATS no-reply address).
  const normCompany = normalizeCompanyKey(classification.company);
  const normPosition = classification.position ? normalize(classification.position) : null;

  const exact = candidates.find(
    (c) => normalizeCompanyKey(c.company) === normCompany && (!normPosition || normalize(c.position) === normPosition)
  );
  if (exact) return exact;

  return candidates.find((c) => normalizeCompanyKey(c.company) === normCompany) ?? null;
}

async function createNotification(userId: string, type: string, title: string, applicationId: string) {
  await prisma.notification.create({
    data: { userId, type, title, message: title, applicationId },
  });
}
