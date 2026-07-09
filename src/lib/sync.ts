import { prisma } from "@/lib/prisma";
import { listMessageIds, getMessage, GmailAuthError } from "@/lib/gmail";
import { classifyEmail } from "@/lib/ai/classify";
import type { ApplicationStatus, EmailCategory, EmploymentType } from "@/generated/prisma/client";

const DEFAULT_QUERY =
  "job OR application OR interview OR offer OR rejection OR recruiter OR position OR opportunity";
const STALE_DAYS = 14;

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

export async function runSync(userId: string): Promise<SyncSummary> {
  const summary = emptySummary();

  const syncLog = await prisma.syncLog.create({
    data: { userId, status: "running" },
  });

  try {
    let settings = await prisma.syncSettings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await prisma.syncSettings.create({
        data: { userId, gmailQuery: DEFAULT_QUERY },
      });
    }

    const since = settings.lastSyncAt ?? new Date(Date.now() - settings.daysToLookBack * 86_400_000);
    const afterEpoch = Math.floor(since.getTime() / 1000);
    const query = `${settings.gmailQuery} after:${afterEpoch}`;

    const messageIds = await listMessageIds(userId, query);
    summary.emailsScanned = messageIds.length;

    const existing = await prisma.emailRecord.findMany({
      where: { gmailMessageId: { in: messageIds.map((m) => m.id) } },
      select: { gmailMessageId: true },
    });
    const existingIds = new Set(existing.map((e) => e.gmailMessageId));
    const toProcess = messageIds.filter((m) => !existingIds.has(m.id));

    for (const { id: messageId, threadId } of toProcess) {
      try {
        const message = await getMessage(userId, messageId);
        const classification = await classifyEmail({
          subject: message.subject,
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          bodyText: message.bodyText,
          receivedAt: message.receivedAt,
        });

        summary.emailsProcessed++;

        if (!classification.isJobRelated) {
          continue;
        }

        let application = await findMatchingApplication(userId, threadId, classification);
        const isNew = !application;

        if (!application) {
          application = await prisma.jobApplication.create({
            data: {
              userId,
              company: classification.company ?? "Unknown Company",
              position: classification.position ?? "Unknown Position",
              status: (classification.suggestedStatus as ApplicationStatus) ?? "APPLIED",
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
          const data: Record<string, unknown> = {
            dateLastEmail: message.receivedAt,
            aiSummary: classification.summary,
            aiSentiment: classification.sentiment,
          };
          if (classification.suggestedStatus) data.status = classification.suggestedStatus;
          if (classification.recruiterName) data.recruiterName = classification.recruiterName;
          if (classification.recruiterEmail) data.recruiterEmail = classification.recruiterEmail;
          if (classification.salaryMin) data.salaryMin = classification.salaryMin;
          if (classification.salaryMax) data.salaryMax = classification.salaryMax;
          if (classification.salaryCurrency) data.salaryCurrency = classification.salaryCurrency;
          if (classification.location) data.location = classification.location;
          if (classification.employmentType) data.employmentType = classification.employmentType;
          if (classification.source) data.source = classification.source;
          if (classification.suggestedNextAction) data.aiNextAction = classification.suggestedNextAction;
          if (classification.deadline) data.aiDeadline = new Date(classification.deadline);

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
            await createNotification(userId, "interview", `Interview invitation: ${ref.company}`, application.id);
            break;
          case "CODING_ASSESSMENT":
            summary.codingAssessments.push(ref);
            await createNotification(userId, "assessment", `Coding assessment: ${ref.company}`, application.id);
            break;
          case "REJECTION":
            summary.rejections.push(ref);
            await createNotification(userId, "rejection", `Rejection from ${ref.company}`, application.id);
            break;
          case "OFFER":
            summary.offers.push(ref);
            await createNotification(userId, "offer", `Offer from ${ref.company}!`, application.id);
            break;
          case "RECRUITER_OUTREACH":
          case "INTERVIEW_FOLLOWUP":
          case "REQUEST_FOR_INFO":
            summary.recruiterResponses.push(ref);
            if (!isNew) {
              await createNotification(userId, "recruiter_reply", `Recruiter reply: ${ref.company}`, application.id);
            }
            break;
        }
      } catch (err) {
        summary.errors.push(`Message ${messageId}: ${err instanceof Error ? err.message : String(err)}`);
      }
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
  const normCompany = normalize(classification.company);
  const normPosition = classification.position ? normalize(classification.position) : null;

  const exact = candidates.find(
    (c) => normalize(c.company) === normCompany && (!normPosition || normalize(c.position) === normPosition)
  );
  if (exact) return exact;

  return candidates.find((c) => normalize(c.company) === normCompany) ?? null;
}

async function createNotification(userId: string, type: string, title: string, applicationId: string) {
  await prisma.notification.create({
    data: { userId, type, title, message: title, applicationId },
  });
}
