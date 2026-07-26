import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AiModeBadge({ enabled }: { enabled: boolean }) {
  return (
    <Link
      href="/dashboard/settings"
      title={enabled ? "AI classification is on — go to Settings to change it" : "Using the free classifier — go to Settings to enable AI"}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        enabled
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
          : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
      AI Mode: {enabled ? "On" : "Off"}
    </Link>
  );
}
