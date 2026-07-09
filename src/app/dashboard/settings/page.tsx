import { SettingsForm } from "@/components/settings/settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Control how Job Tracker syncs your Gmail.</p>
      </div>
      <SettingsForm />
    </div>
  );
}
