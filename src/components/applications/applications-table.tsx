"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Download, Mail, MoreHorizontal, Pencil, Plus, Trash2, Upload, Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog";
import { STATUS_LABELS, STATUS_COLORS, formatCurrency, formatDate, relativeTime, cn } from "@/lib/utils";
import { APPLICATION_STATUS_VALUES } from "@/lib/validation";
import type { JobApplicationDTO, PaginationInfo } from "@/types/application";

const PAGE_SIZE = 20;

const DASHBOARD_FILTER_LABELS: Record<string, string> = {
  all: "All Applications",
  active: "Active",
  interviews: "Interviews",
  assessments: "Assessments",
  offers: "Offers",
  rejections: "Rejections",
};

// Same buckets as the dashboard's own range selector, plus "All time" since
// unlike the dashboard, this table defaults to showing everything.
const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "0", label: "Today" },
  { value: "14", label: "Last 2 weeks" },
  { value: "90", label: "Last 3 months" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];

export function ApplicationsTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [applications, setApplications] = React.useState<JobApplicationDTO[]>([]);
  const [pagination, setPagination] = React.useState<PaginationInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  // Either "all", a raw ApplicationStatus ("REJECTED"), or a furthest-stage
  // bucket prefixed with "stage:" ("stage:INTERVIEWED", "stage:PHONE_SCREEN")
  // — see the merged Select below. Kept as one value so the two concepts
  // (current status vs. the furthest stage ever reached) render as one
  // dropdown instead of two easily-confused side-by-side filters.
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [range, setRange] = React.useState<string>("all");
  const [archived, setArchived] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [sortBy, setSortBy] = React.useState("dateApplied");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<JobApplicationDTO | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [dashboardFilter, setDashboardFilter] = React.useState<string | null>(null);
  const [sinceDays, setSinceDays] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Read a dashboard-card drill-down filter from the URL once on mount
  // (e.g. /dashboard/applications?dashboardFilter=interviews&sinceDays=365),
  // or a direct status-bar drill-down (e.g.
  // /dashboard/applications?status=REJECTED&sinceDays=365) from the Status
  // Distribution chart — the latter maps straight onto the same Status
  // filter and standalone time-range control the page already has.
  React.useEffect(() => {
    const df = searchParams.get("dashboardFilter");
    const sd = searchParams.get("sinceDays");
    const st = searchParams.get("status");
    if (df) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the initial URL, not a render-triggered sync
      setDashboardFilter(df);
      if (sd) setSinceDays(sd);
    } else {
      if (st) setStatusFilter(st);
      if (sd) setRange(sd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on mount
  }, []);

  function clearDashboardFilter() {
    setDashboardFilter(null);
    setSinceDays(null);
    router.replace("/dashboard/applications");
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sortBy,
      sortDir,
      archived: String(archived),
    });
    if (search) params.set("search", search);
    if (dashboardFilter) {
      params.set("dashboardFilter", dashboardFilter);
      if (sinceDays) params.set("sinceDays", sinceDays);
    } else {
      if (statusFilter.startsWith("stage:")) {
        params.set("furthestStage", statusFilter.slice("stage:".length));
      } else if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (range !== "all") params.set("sinceDays", range);
    }

    try {
      const res = await fetch(`/api/applications?${params.toString()}`);
      const data = await res.json();
      setApplications(data.applications ?? []);
      setPagination(data.pagination ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, archived, search, statusFilter, range, dashboardFilter, sinceDays]);

  React.useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  async function handleDelete(app: JobApplicationDTO) {
    if (!confirm(`Delete the application to ${app.company}? This cannot be undone.`)) return;
    await fetch(`/api/applications/${app.id}`, { method: "DELETE" });
    load();
  }

  async function handleArchiveToggle(app: JobApplicationDTO) {
    await fetch(`/api/applications/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: !app.isArchived }),
    });
    load();
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/applications/import", { method: "POST", body: formData });
      const data = await res.json();
      alert(`Imported ${data.imported} applications${data.skipped ? `, skipped ${data.skipped}` : ""}.`);
      load();
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {dashboardFilter && (
        <div className="flex w-fit items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">
          <span>
            Dashboard filter: <strong>{DASHBOARD_FILTER_LABELS[dashboardFilter] ?? dashboardFilter}</strong>
          </span>
          <button
            onClick={clearDashboardFilter}
            className="rounded-full p-0.5 hover:bg-white/20 dark:hover:bg-black/10"
            aria-label="Clear dashboard filter"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search company, position, recruiter…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="w-64"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setPage(1);
              setStatusFilter(v);
            }}
            disabled={Boolean(dashboardFilter)}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="NOT_REJECTED">All but Rejected</SelectItem>
              <SelectGroup>
                <SelectLabel>Current status</SelectLabel>
                {APPLICATION_STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                {/* Furthest stage ever reached, independent of current status —
                    e.g. finds "interviewed" applications even after they were
                    later rejected, which Status alone can't show since it only
                    reflects the current/final state. */}
                <SelectLabel>Past status (ever reached, even if since rejected)</SelectLabel>
                <SelectItem value="stage:INTERVIEWED">Interviewed — any stage</SelectItem>
                <SelectItem value="stage:PHONE_SCREEN">Interviewed — Phone Screen</SelectItem>
                <SelectItem value="stage:TECHNICAL_INTERVIEW">Interviewed — Technical Interview</SelectItem>
                <SelectItem value="stage:FINAL_INTERVIEW">Interviewed — Final Interview</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={range}
            onValueChange={(v) => {
              setPage(1);
              setRange(v);
            }}
            disabled={Boolean(dashboardFilter)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={archived ? "archived" : "active"} onValueChange={(v) => setArchived(v === "archived")}>
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open("/api/applications/export", "_blank")}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Import"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
            }}
          />
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Application
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <SortableHeader label="Company" field="company" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader label="Position" field="position" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
              <SortableHeader
                label="Date Applied"
                field="dateApplied"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2 font-medium">Latest Response</th>
              <th className="px-3 py-2 font-medium">Recruiter</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Salary</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-zinc-400">
                  Loading…
                </td>
              </tr>
            ) : applications.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-zinc-400">
                  No applications found.
                </td>
              </tr>
            ) : (
              applications.map((app) => (
                <tr
                  key={app.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/50"
                >
                  <td className="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{app.company}</td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-300">{app.position}</td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">{formatDate(app.dateApplied)}</td>
                  <td className="px-3 py-2.5">
                    <Badge className={STATUS_COLORS[app.status]}>{STATUS_LABELS[app.status] ?? app.status}</Badge>
                    {["REJECTED", "WITHDRAWN", "GHOSTED"].includes(app.status) && (
                      <p className="mt-1 text-xs text-zinc-400">
                        {app.furthestStage && app.furthestStage !== "APPLIED"
                          ? `After ${STATUS_LABELS[app.furthestStage] ?? app.furthestStage}`
                          : "Direct rejection"}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">
                    {app.dateLastEmail ? relativeTime(app.dateLastEmail) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">{app.recruiterName ?? "—"}</td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">{app.location ?? "—"}</td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">
                    {formatCurrency(app.salaryMin, app.salaryCurrency) ||
                    formatCurrency(app.salaryMax, app.salaryCurrency)
                      ? `${formatCurrency(app.salaryMin, app.salaryCurrency)}${
                          app.salaryMax ? ` – ${formatCurrency(app.salaryMax, app.salaryCurrency)}` : ""
                        }`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500 dark:text-zinc-400">{app.source ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {app.emails[0]?.gmailLink && (
                        <a
                          href={app.emails[0].gmailLink}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                          title="Open in Gmail"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(app);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleArchiveToggle(app)}>
                            <Archive className="h-3.5 w-3.5" /> {app.isArchived ? "Unarchive" : "Archive"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleDelete(app)} className="text-red-600">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <ApplicationFormDialog open={formOpen} onOpenChange={setFormOpen} application={editing} onSaved={load} />
    </div>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const active = sortBy === field;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        onClick={() => onSort(field)}
        className={cn(
          "flex items-center gap-1 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100",
          active && "text-zinc-900 dark:text-zinc-100"
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && sortDir === "asc" && "rotate-180")} />
      </button>
    </th>
  );
}
