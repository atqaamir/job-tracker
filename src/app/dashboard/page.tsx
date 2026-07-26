import { Briefcase, Users, CalendarCheck, Award, XCircle, TrendingUp, Clock, ListChecks } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { getDashboardStats } from "@/lib/stats";
import { StatCard } from "@/components/dashboard/stat-card";
import { MonthlyApplicationsChart } from "@/components/dashboard/monthly-applications-chart";
import { StatusDistributionChart } from "@/components/dashboard/status-distribution-chart";
import { SyncSummaryCard } from "@/components/dashboard/sync-summary-card";
import { RangeSelect } from "@/components/dashboard/range-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SyncSummary } from "@/lib/sync";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const parsedDays = Number(daysParam);
  const days = Math.min(365, Math.max(0, Number.isFinite(parsedDays) && daysParam !== undefined ? parsedDays : 365));

  // The dashboard layout already redirects unauthenticated visitors; this
  // guard just avoids rendering further while that redirect resolves.
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return null;
  }
  const stats = await getDashboardStats(session.user.id, days);

  const lastSyncSummary =
    stats.lastSync?.summary && typeof stats.lastSync.summary === "object"
      ? (stats.lastSync.summary as unknown as SyncSummary)
      : null;

  const RANGE_LABELS: Record<number, string> = {
    0: "today",
    14: "the last 2 weeks",
    90: "the last 3 months",
    180: "the last 6 months",
    365: "the last 12 months",
  };
  const rangeLabel = RANGE_LABELS[days] ?? `the last ${days} days`;

  const filterHref = (filter: string) => `/dashboard/applications?dashboardFilter=${filter}&sinceDays=${days}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Your job search at a glance — {rangeLabel}.</p>
        </div>
        <RangeSelect days={days} />
      </div>

      {stats.lastSync && lastSyncSummary && (
        <SyncSummaryCard startedAt={stats.lastSync.startedAt} summary={lastSyncSummary} />
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Applications" value={stats.totalApplications} icon={Briefcase} href={filterHref("all")} />
        <StatCard label="Active" value={stats.activeApplications} icon={ListChecks} href={filterHref("active")} />
        <StatCard label="Interviews" value={stats.interviews} icon={Users} href={filterHref("interviews")} />
        <StatCard
          label="Assessments"
          value={stats.assessments}
          icon={CalendarCheck}
          href={filterHref("assessments")}
        />
        <StatCard label="Offers" value={stats.offers} icon={Award} href={filterHref("offers")} />
        <StatCard label="Rejections" value={stats.rejections} icon={XCircle} href={filterHref("rejections")} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Response Rate"
          value={`${Math.round(stats.responseRate * 100)}%`}
          icon={TrendingUp}
          hint="Applications with any reply"
        />
        <StatCard
          label="Interview Rate"
          value={`${Math.round(stats.interviewRate * 100)}%`}
          icon={Users}
          hint="Applications that reached an interview"
        />
        <StatCard
          label="Avg. Response Time"
          value={stats.avgResponseTimeDays != null ? `${stats.avgResponseTimeDays.toFixed(1)}d` : "—"}
          icon={Clock}
          hint="From applied to first reply"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Applications Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyApplicationsChart data={stats.monthlyApplications} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusDistributionChart data={stats.statusDistribution} days={days} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
