"use client";

import * as React from "react";
import { ArrowUpDown, Copy, Download, Mail, MoreHorizontal, Pencil, Plus, Trash2, Upload, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog";
import { DuplicatesDialog } from "@/components/applications/duplicates-dialog";
import { STATUS_LABELS, STATUS_COLORS, formatCurrency, formatDate, relativeTime, cn } from "@/lib/utils";
import { APPLICATION_STATUS_VALUES } from "@/lib/validation";
import type { JobApplicationDTO, PaginationInfo } from "@/types/application";

const PAGE_SIZE = 20;

export function ApplicationsTable() {
  const [applications, setApplications] = React.useState<JobApplicationDTO[]>([]);
  const [pagination, setPagination] = React.useState<PaginationInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const [archived, setArchived] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [sortBy, setSortBy] = React.useState("dateApplied");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<JobApplicationDTO | null>(null);
  const [duplicatesOpen, setDuplicatesOpen] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
    if (status !== "all") params.set("status", status);

    try {
      const res = await fetch(`/api/applications?${params.toString()}`);
      const data = await res.json();
      setApplications(data.applications ?? []);
      setPagination(data.pagination ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, archived, search, status]);

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
            value={status}
            onValueChange={(v) => {
              setPage(1);
              setStatus(v);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {APPLICATION_STATUS_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
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
          <Button variant="outline" size="sm" onClick={() => setDuplicatesOpen(true)}>
            <Copy className="h-3.5 w-3.5" /> Duplicates
          </Button>
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
      <DuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} onMerged={load} />
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
