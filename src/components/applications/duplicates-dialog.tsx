"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate, STATUS_LABELS } from "@/lib/utils";
import type { JobApplicationDTO } from "@/types/application";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
}

export function DuplicatesDialog({ open, onOpenChange, onMerged }: Props) {
  const [groups, setGroups] = React.useState<JobApplicationDTO[][]>([]);
  const [loading, setLoading] = React.useState(false);
  const [merging, setMerging] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off the fetch triggered by opening the dialog
    setLoading(true);
    fetch("/api/applications/duplicates")
      .then((res) => res.json())
      .then((data) => setGroups(data.duplicateGroups ?? []))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleMerge(primaryId: string, duplicateIds: string[]) {
    setMerging(primaryId);
    try {
      await fetch("/api/applications/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId, duplicateIds }),
      });
      setGroups((prev) => prev.filter((g) => !g.some((a) => a.id === primaryId)));
      onMerged();
    } finally {
      setMerging(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Duplicate Applications</DialogTitle>
          <DialogDescription>
            Applications with the same company and position. Choose which one to keep as the primary record —
            emails from the others will be merged into it.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-400">Checking for duplicates…</p>
        ) : groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">No duplicates found.</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.map((a) => a.id).join("-")} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {group[0].company} — {group[0].position}
                </p>
                <div className="flex flex-col gap-2">
                  {group.map((app) => (
                    <div key={app.id} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
                      <div>
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {STATUS_LABELS[app.status] ?? app.status} · applied {formatDate(app.dateApplied)}
                        </span>
                        <span className="ml-2 text-xs text-zinc-400">{app.emails.length} email(s)</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={merging !== null}
                        onClick={() =>
                          handleMerge(
                            app.id,
                            group.filter((g) => g.id !== app.id).map((g) => g.id)
                          )
                        }
                      >
                        {merging === app.id ? "Merging…" : "Keep this one"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
