import { prisma } from "@/lib/prisma";

const INTERVIEW_STATUSES = new Set(["PHONE_SCREEN", "TECHNICAL_INTERVIEW", "FINAL_INTERVIEW"]);
const OFFER_STATUSES = new Set(["OFFER", "ACCEPTED"]);
const ACTIVE_EXCLUDED = new Set(["REJECTED", "WITHDRAWN", "ACCEPTED", "GHOSTED"]);

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(d: Date) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface DashboardStats {
  rangeMonths: number;
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

export async function getDashboardStats(userId: string, months = 12): Promise<DashboardStats> {
  const from = new Date();
  from.setMonth(from.getMonth() - months);
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

    if (INTERVIEW_STATUSES.has(app.status) || hasInterviewEmail) interviews++;
    if (app.status === "ASSESSMENT" || hasAssessmentEmail) assessments++;
    if (OFFER_STATUSES.has(app.status) || hasOfferEmail) offers++;
    if (app.status === "REJECTED") rejections++;
    if (!ACTIVE_EXCLUDED.has(app.status) && !app.isArchived) active++;

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
    rangeMonths: months,
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
