"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncButton() {
  const router = useRouter();
  const [syncing, setSyncing] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Sync failed");
      } else {
        const s = data.summary;
        setMessage(
          `Scanned ${s.emailsScanned}, ${s.applicationsNew} new, ${s.applicationsUpdated} updated`
        );
        router.refresh();
      }
    } catch {
      setMessage("Sync failed — check your connection");
    } finally {
      setSyncing(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && <span className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:inline">{message}</span>}
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
        {syncing ? "Syncing…" : "Sync Now"}
      </Button>
    </div>
  );
}
