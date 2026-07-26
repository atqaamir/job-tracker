import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const INTERVIEW_STATUSES = ["PHONE_SCREEN", "TECHNICAL_INTERVIEW", "FINAL_INTERVIEW"] as const;
const OFFER_STATUSES = ["OFFER", "ACCEPTED"] as const;
const ACTIVE_EXCLUDED = ["REJECTED", "WITHDRAWN", "ACCEPTED", "GHOSTED"] as const;

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(d: Date) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const DASHBOARD_FILTER_VALUES = ["all", "active", "interviews", "assessments", "offers", "rejections"] as const;
export type DashboardFilterKey = (typeof DASHBOARD_FILTER_VALUES)[number];

/**
 * Builds the same match criteria the dashboard stat cards count by, so
 * clicking a card ("19 Interviews") always lands on exactly those
 * applications — including ones whose current `status` no longer reflects
 * it (e.g. interviewed, then later rejected). Matching on email category
 * history rather than only `furthestStage` also means this works for
 * applications synced before furthestStage tracking existed.
 */
export function dashboardFilterWhere(
  userId: string,
  filter: DashboardFilterKey,
  sinceDate?: Date
): Prisma.JobApplicationWhereInput {
  const base: Prisma.JobApplicationWhereInput = {
    userId,
    isArchived: false,
    ...(sinceDate ? { dateApplied: { gte: sinceDate } } : {}),
  };

  switch (filter) {
    case "active":
      return { ...base, status: { notIn: [...ACTIVE_EXCLUDED] } };
    case "interviews":
      return {
        ...base,
        OR: [
          { status: { in: [...INTERVIEW_STATUSES] } },
          { emails: { some: { category: { in: ["INTERVIEW_INVITATION", "INTERVIEW_FOLLOWUP"] } } } },
        ],
      };
    case "assessments":
      return {
        ...base,
        OR: [{ status: "ASSESSMENT" }, { emails: { some: { category: "CODING_ASSESSMENT" } } }],
      };
    case "offers":
      return {
        ...base,
        OR: [{ status: { in: [...OFFER_STATUSES] } }, { emails: { some: { category: "OFFER" } } }],
      };
    case "rejections":
      return { ...base, status: "REJECTED" };
    case "all":
    default:
      return base;
  }
}

export interface DashboardStats {
  rangeDays: number;
  totalApplications: number;
  activeApplications: number;
  interviews: number;
  assessments: number;
  offers: number;
  rejections: number;
  responseRate: number;
  interviewRate: number;
  avgResponseTimeDays: number | null;
  weeklyApplications: { week: string; count: number }[];
  monthlyApplications: { month: string; count: number }[];
  statusDistribution: Record<string, number>;
  lastSync: Awaited<ReturnType<typeof prisma.syncLog.findFirst>>;
  unreadNotifications: number;
}

export async function getDashboardStats(userId: string, days = 365): Promise<DashboardStats> {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const applications = await prisma.jobApplication.findMany({
    where: { userId, dateApplied: { gte: from } },
    include: {
      emails: { select: { category: true, receivedAt: true } },
    },
  });

  const totalApplications = applications.length;

  let interviews = 0;
  let assessments = 0;
  let offers = 0;
  let rejections = 0;
  let active = 0;
  let responded = 0;
  const responseTimes: number[] = [];
  const statusDistribution: Record<string, number> = {};
  const weekly = new Map<string, number>();
  const monthly = new Map<string, number>();

  for (const app of applications) {
    statusDistribution[app.status] = (statusDistribution[app.status] ?? 0) + 1;

    const categories = new Set(app.emails.map((e) => e.category).filter(Boolean));
    const hasInterviewEmail = categories.has("INTERVIEW_INVITATION") || categories.has("INTERVIEW_FOLLOWUP");
    const hasAssessmentEmail = categories.has("CODING_ASSESSMENT");
    const hasOfferEmail = categories.has("OFFER");

    if (INTERVIEW_STATUSES.includes(app.status as (typeof INTERVIEW_STATUSES)[number]) || hasInterviewEmail) interviews++;
    if (app.status === "ASSESSMENT" || hasAssessmentEmail) assessments++;
    if (OFFER_STATUSES.includes(app.status as (typeof OFFER_STATUSES)[number]) || hasOfferEmail) offers++;
    if (app.status === "REJECTED") rejections++;
    if (!ACTIVE_EXCLUDED.includes(app.status as (typeof ACTIVE_EXCLUDED)[number]) && !app.isArchived) active++;

    const nonConfirmationEmails = app.emails.filter((e) => e.category && e.category !== "APPLICATION_CONFIRMATION");
    if (nonConfirmationEmails.length > 0) {
      responded++;
      if (app.dateApplied) {
        const earliest = nonConfirmationEmails.reduce(
          (min, e) => (e.receivedAt < min ? e.receivedAt : min),
          nonConfirmationEmails[0].receivedAt
        );
        const days = (earliest.getTime() - app.dateApplied.getTime()) / 86_400_000;
        if (days >= 0) responseTimes.push(days);
      }
    }

    if (app.dateApplied) {
      const wk = weekKey(app.dateApplied);
      const mo = monthKey(app.dateApplied);
      weekly.set(wk, (weekly.get(wk) ?? 0) + 1);
      monthly.set(mo, (monthly.get(mo) ?? 0) + 1);
    }
  }

  const responseRate = totalApplications > 0 ? responded / totalApplications : 0;
  const interviewRate = totalApplications > 0 ? interviews / totalApplications : 0;
  const avgResponseTimeDays =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null;

  const weeklyApplications = [...weekly.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, count]) => ({ week, count }));
  const monthlyApplications = [...monthly.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, count]) => ({ month, count }));

  const [lastSync, unreadNotifications] = await Promise.all([
    prisma.syncLog.findFirst({ where: { userId }, orderBy: { startedAt: "desc" } }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    rangeDays: days,
    totalApplications,
    activeApplications: active,
    interviews,
    assessments,
    offers,
    rejections,
    responseRate,
    interviewRate,
    avgResponseTimeDays,
    weeklyApplications,
    monthlyApplications,
    statusDistribution,
    lastSync,
    unreadNotifications,
  };
}
