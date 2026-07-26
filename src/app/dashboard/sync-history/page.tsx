import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, relativeTime } from "@/lib/utils";
import type { SyncSummary } from "@/lib/sync";

export const dynamic = "force-dynamic";

const STATUS_BADGE_COLORS: Record<string, string> = {
  running: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  completed_with_errors: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function SyncHistoryPage() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return null;
  }

  const logs = await prisma.syncLog.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Sync History</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Every sync run, including the actual error text for anything that failed — the fastest way to tell whether
          AI classification is really succeeding (a bad key or rate limit shows up here as a per-message error).
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-zinc-400">No syncs yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log) => {
            const summary =
              log.summary && typeof log.summary === "object" ? (log.summary as unknown as SyncSummary) : null;
            const perMessageErrors = summary?.errors ?? [];

            return (
              <Card key={log.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {formatDate(log.startedAt)} · {relativeTime(log.startedAt)}
                  </CardTitle>
                  <Badge className={STATUS_BADGE_COLORS[log.status] ?? "bg-zinc-100 text-zinc-600"}>
                    {log.status}
                  </Badge>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Stat label="Scanned" value={log.emailsScanned} />
                    <Stat label="Processed" value={log.emailsProcessed} />
                    <Stat label="New applications" value={log.applicationsNew} />
                    <Stat label="Updated" value={log.applicationsUpdated} />
                  </div>

                  {log.error && (
                    <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {log.error}
                    </p>
                  )}

                  {perMessageErrors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {perMessageErrors.length} error{perMessageErrors.length === 1 ? "" : "s"} during this sync:
                      </p>
                      <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-red-700 dark:text-red-300">
                        {perMessageErrors.map((message, i) => (
                          <li key={i} className="break-all">
                            {message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</span>
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}
