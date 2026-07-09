import { ApplicationsTable } from "@/components/applications/applications-table";

export const dynamic = "force-dynamic";

export default function ApplicationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Applications</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Search, filter, and manage every application.</p>
      </div>
      <ApplicationsTable />
    </div>
  );
}
