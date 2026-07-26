"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AI_TIMEFRAME_OPTIONS,
  getRememberedAiDays,
  setRememberedAiDays,
  type SyncAction as Action,
} from "@/lib/ai-sync-prefs";

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 1200;

interface SyncLogStatus {
  id: string;
  status: string;
  startedAt: string;
  emailsScanned: number;
  emailsProcessed: number;
  applicationsNew: number;
  applicationsUpdated: number;
  error: string | null;
}

function formatEta(seconds: number): string {
  if (seconds < 45) return "less than a minute left";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `~${hours}h ${remMinutes}m left`;
}

/**
 * Rough time remaining based on the average pace since the sync started
 * (elapsed time / messages processed so far, projected across whatever's
 * left). Deliberately simple — no rolling window — so it's naturally
 * conservative early on (the scanning phase's time counts against the
 * average before any message has been processed) and settles down as more
 * messages go through. No estimate during scanning, since nothing's been
 * processed yet to derive a rate from.
 */
function estimateRemaining(log: SyncLogStatus): string | null {
  if (log.emailsProcessed === 0 || log.emailsProcessed >= log.emailsScanned) return null;
  const elapsedMs = Date.now() - new Date(log.startedAt).getTime();
  const rate = log.emailsProcessed / elapsedMs;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const remainingMs = (log.emailsScanned - log.emailsProcessed) / rate;
  return formatEta(remainingMs / 1000);
}

export function SyncButton() {
  const router = useRouter();
  // Set only when this tab initiated the running sync — used purely to pick
  // which button's icon spins. A sync resumed on mount (started earlier,
  // possibly from a since-closed tab) has no pendingAction, so neither
  // button's icon spins for it, but the shared progress bar still shows.
  const [pendingAction, setPendingAction] = React.useState<Action | null>(null);
  const [activeLog, setActiveLog] = React.useState<SyncLogStatus | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmFor, setConfirmFor] = React.useState<Action | null>(null);
  const [selectedDays, setSelectedDays] = React.useState(14);
  const [checking, setChecking] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOnce = React.useCallback(
    async (id: string) => {
      const res = await fetch(`/api/sync/status?id=${id}`);
      const data = await res.json();
      const log: SyncLogStatus | null = data.log;
      if (!log || log.status !== "running") {
        stopPolling();
        setActiveLog(null);
        setPendingAction(null);
        setCancelling(false);
        if (log) {
          setMessage(
            log.status === "failed"
              ? (log.error ?? "Sync failed")
              : log.status === "cancelled"
                ? `Cancelled — ${log.applicationsNew} new, ${log.applicationsUpdated} updated so far`
                : `Scanned ${log.emailsScanned}, ${log.applicationsNew} new, ${log.applicationsUpdated} updated`
          );
          router.refresh();
          setTimeout(() => setMessage(null), 6000);
        }
        return;
      }
      setActiveLog(log);
    },
    [router, stopPolling]
  );

  const startPolling = React.useCallback(
    (id: string) => {
      stopPolling();
      pollOnce(id);
      pollRef.current = setInterval(() => pollOnce(id), POLL_INTERVAL_MS);
    },
    [pollOnce, stopPolling]
  );

  // Resume showing progress for a sync that's still running server-side —
  // e.g. it was started before this tab was reloaded, or from another tab.
  // The actual work runs detached from any request/response (see
  // /api/sync's use of `after()`), so it was never at risk of being
  // stopped; this just re-attaches the UI to it.
  React.useEffect(() => {
    fetch("/api/sync/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.log) startPolling(data.log.id);
      });
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on mount
  }, []);

  async function kickOffSync(aiRecentDays: number, action: Action) {
    setPendingAction(action);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiRecentDays, fullBackfill: action === "fetchAll" }),
      });
      const data = await res.json();
      if (!res.ok || !data.syncLogId) {
        setMessage(data.error ?? "Sync failed to start");
        setPendingAction(null);
        setTimeout(() => setMessage(null), 6000);
        return;
      }
      startPolling(data.syncLogId);
    } catch {
      setMessage("Sync failed to start — check your connection");
      setPendingAction(null);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  // Both actions default to AI only for the most recent 2 weeks of whatever
  // range gets fetched, free classifier for anything older, so cost is
  // always capped. Whenever the range about to be fetched is itself bigger
  // than 2 weeks (a stale Sync Now gap, or Fetch All Again's configured
  // window, which defaults to a year) AND AI is enabled/configured, ask how
  // far back AI should apply. Only asks the first time per action/browser
  // (see getRememberedAiDays) — after that it reuses the chosen timeframe.
  async function checkAndRun(action: Action) {
    setChecking(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      const gapMs =
        action === "sync"
          ? data.settings?.lastSyncAt
            ? Date.now() - new Date(data.settings.lastSyncAt).getTime()
            : Infinity
          : (data.settings?.daysToLookBack ?? 365) * 24 * 60 * 60 * 1000;
      if (gapMs > TWO_WEEKS_MS && data.aiModeAvailable) {
        const remembered = getRememberedAiDays(action);
        if (remembered) {
          await kickOffSync(remembered, action);
        } else {
          setSelectedDays(14);
          setConfirmFor(action);
        }
      } else {
        await kickOffSync(14, action);
      }
    } finally {
      setChecking(false);
    }
  }

  function handleConfirm() {
    const action = confirmFor!;
    setConfirmFor(null);
    setRememberedAiDays(action, selectedDays);
    kickOffSync(selectedDays, action);
  }

  async function handleCancel() {
    if (!activeLog) return;
    setCancelling(true);
    try {
      await fetch("/api/sync/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncLogId: activeLog.id }),
      });
      // The next poll tick (already running) will pick up the "cancelled"
      // status once the loop notices the flag, no extra polling needed here.
    } catch {
      setCancelling(false);
    }
  }

  const isRunning = activeLog?.status === "running";
  const percent =
    isRunning && activeLog.emailsScanned > 0
      ? Math.min(100, Math.round((activeLog.emailsProcessed / activeLog.emailsScanned) * 100))
      : null;
  const eta = isRunning ? estimateRemaining(activeLog) : null;

  return (
    <div className="flex items-center gap-3">
      {isRunning && (
        <div className="hidden items-center gap-2 sm:flex">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-zinc-900 transition-all dark:bg-zinc-100"
              style={{ width: `${percent ?? 5}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {activeLog.emailsScanned === 0
              ? "starting…"
              : activeLog.emailsProcessed === 0
                ? `scanning… ${activeLog.emailsScanned} found`
                : `${activeLog.emailsProcessed}/${activeLog.emailsScanned}${eta ? ` · ${eta}` : ""}`}
          </span>
        </div>
      )}
      {message && <span className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:inline">{message}</span>}

      {isRunning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={cancelling}>
              <X className="h-3.5 w-3.5" />
              {cancelling ? "Cancelling…" : "Cancel"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stops the sync after the message it&apos;s currently processing.</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={() => checkAndRun("sync")} disabled={isRunning || checking}>
            <RefreshCw className={cn("h-3.5 w-3.5", pendingAction === "sync" && isRunning && "animate-spin")} />
            {pendingAction === "sync" && isRunning ? "Syncing…" : "Sync Now"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fetches only what&apos;s new since your last successful sync.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => checkAndRun("fetchAll")}
            disabled={isRunning || checking}
          >
            <History className={cn("h-3.5 w-3.5", pendingAction === "fetchAll" && isRunning && "animate-spin")} />
            {pendingAction === "fetchAll" && isRunning ? "Fetching…" : "Fetch All Again"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Deletes all your fetched applications and re-fetches from scratch, using the window set in Settings →
          &quot;Fetch All Again window&quot; (default: last 12 months).
        </TooltipContent>
      </Tooltip>

      <Dialog open={confirmFor !== null} onOpenChange={(open) => !open && setConfirmFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How far back should AI classification apply?</DialogTitle>
            <DialogDescription>
              {confirmFor === "fetchAll"
                ? "Fetch All Again deletes all your existing applications and re-fetches your full configured window (Settings → \"Fetch All Again window\")."
                : "It's been more than 2 weeks since your last sync."}{" "}
              AI-powered classification (Claude) is more accurate but costs money per email — the free built-in
              classifier costs nothing. Pick how far back AI should be used; anything older in this fetch uses the
              free classifier.
            </DialogDescription>
          </DialogHeader>
          <Select value={String(selectedDays)} onValueChange={(v) => setSelectedDays(Number(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_TIMEFRAME_OPTIONS.map((o) => (
                <SelectItem key={o.days} value={String(o.days)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button onClick={handleConfirm}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
