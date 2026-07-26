"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { STATUS_CHART_COLOR } from "@/lib/chart-colors";
import { STATUS_LABELS } from "@/lib/utils";

interface Props {
  data: Record<string, number>;
  // A plain value, not a function — this is a Client Component rendered
  // from a Server Component page, and functions can't be passed across
  // that boundary. The href is built here instead, from `days`.
  days?: number;
}

export function StatusDistributionChart({ data, days }: Props) {
  const router = useRouter();
  const getHref = days !== undefined ? (status: string) => `/dashboard/applications?status=${status}&sinceDays=${days}` : undefined;
  const entries = Object.entries(data)
    .map(([status, count]) => ({ status, label: STATUS_LABELS[status] ?? status, count }))
    .sort((a, b) => b.count - a.count);

  if (entries.length === 0) {
    return <div className="flex h-60 items-center justify-center text-sm text-zinc-400">No data yet</div>;
  }

  const height = Math.max(180, entries.length * 34);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={entries} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }} barCategoryGap="24%">
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--foreground)", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--chart-grid)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--background)",
            border: "1px solid var(--chart-grid)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar
          dataKey="count"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          label={{ position: "right", fill: "var(--chart-muted)", fontSize: 12 }}
          onClick={
            getHref
              ? (entry: { payload?: { status: string } }) => {
                  if (entry.payload) router.push(getHref(entry.payload.status));
                }
              : undefined
          }
          cursor={getHref ? "pointer" : undefined}
        >
          {entries.map((entry) => (
            <Cell key={entry.status} fill={STATUS_CHART_COLOR[entry.status] ?? "var(--chart-blue)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
