import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  accent?: string;
  /** When set, the whole card links here (e.g. to the Applications page pre-filtered to match this count). */
  href?: string;
}) {
  const content = (
    <>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle>{label}</CardTitle>
        {Icon && <Icon className={cn("h-4 w-4 text-zinc-400", accent)} />}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</div>
        {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
      </CardContent>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900">{content}</Card>
      </Link>
    );
  }

  return <Card>{content}</Card>;
}
