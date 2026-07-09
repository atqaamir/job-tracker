import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { SyncSummary } from "@/lib/sync";

export function SyncSummaryCard({ startedAt, summary }: { startedAt: Date; summary: SyncSummary }) {
  const hasActivity =
    summary.applicationsNew > 0 ||
    summary.applicationsUpdated > 0 ||
    summary.errors.length > 0 ||
    summary.staleApplications.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          {summary.errors.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          Last sync — {relativeTime(startedAt)}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!hasActivity ? (
          <p className="text-sm text-zinc-400">
            Scanned {summary.emailsScanned} emails, nothing new since last time.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <SummaryStat label="New applications" value={summary.applicationsNew} />
            <SummaryStat label="Interviews" value={summary.interviewInvitations.length} />
            <SummaryStat label="Assessments" value={summary.codingAssessments.length} />
            <SummaryStat label="Recruiter replies" value={summary.recruiterResponses.length} />
            <SummaryStat label="Offers" value={summary.offers.length} />
            <SummaryStat label="Rejections" value={summary.rejections.length} />
          </div>
        )}
        {summary.staleApplications.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {summary.staleApplications.length} application{summary.staleApplications.length === 1 ? "" : "s"} with no
            response for 14+ days — consider following up:{" "}
            {summary.staleApplications
              .slice(0, 3)
              .map((a) => a.company)
              .join(", ")}
            {summary.staleApplications.length > 3 && ` +${summary.staleApplications.length - 3} more`}
          </div>
        )}
        {summary.errors.length > 0 && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {summary.errors.length} error{summary.errors.length === 1 ? "" : "s"} during sync.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</span>
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}
