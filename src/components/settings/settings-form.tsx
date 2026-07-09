"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncSettingsDTO {
  daysToLookBack: number;
  gmailQuery: string;
  autoSync: boolean;
  lastSyncAt: string | null;
}

const LOOKBACK_PRESETS = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
  { label: "2 years", days: 730 },
];

export function SettingsForm() {
  const [settings, setSettings] = React.useState<SyncSettingsDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => setSettings(data.settings))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daysToLookBack: settings.daysToLookBack,
          gmailQuery: settings.gmailQuery,
          autoSync: settings.autoSync,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to save settings");
      }
      setSettings(data.settings);
      setMessage(
        data.willRescanOnNextSync
          ? "Saved. Your next sync will re-scan Gmail using the new window (already-tracked applications won't be duplicated)."
          : "Saved."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <p className="text-sm text-zinc-400">Loading settings…</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gmail Sync</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="daysToLookBack">How far back to look for job-related emails</Label>
          <p className="text-xs text-zinc-400">
            Applies to your very next sync. This is the maximum email age Job Tracker will ever search — after the
            first sync, it only looks for new mail since the last sync, so increasing this later re-scans further
            back to pick up older emails you haven&apos;t seen yet.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {LOOKBACK_PRESETS.map((preset) => (
              <Button
                key={preset.days}
                type="button"
                size="sm"
                variant={settings.daysToLookBack === preset.days ? "default" : "outline"}
                onClick={() => setSettings({ ...settings, daysToLookBack: preset.days })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              id="daysToLookBack"
              type="number"
              min={7}
              max={1825}
              value={settings.daysToLookBack}
              onChange={(e) => setSettings({ ...settings, daysToLookBack: Number(e.target.value) })}
              className="w-32"
            />
            <span className="text-sm text-zinc-500">days (custom)</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="gmailQuery">Gmail search query</Label>
          <p className="text-xs text-zinc-400">
            Advanced: the raw Gmail search used to find candidate emails, before AI/keyword classification narrows
            them down. Uses normal{" "}
            <a
              href="https://support.google.com/mail/answer/7190"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Gmail search syntax
            </a>
            .
          </p>
          <Textarea
            id="gmailQuery"
            rows={2}
            value={settings.gmailQuery}
            onChange={(e) => setSettings({ ...settings, gmailQuery: e.target.value })}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Automatic daily sync</p>
            <p className="text-xs text-zinc-400">Runs once a day at ~9am. Turn off to only sync manually.</p>
          </div>
          <Switch
            checked={settings.autoSync}
            onCheckedChange={(checked) => setSettings({ ...settings, autoSync: checked })}
          />
        </div>

        {settings.lastSyncAt && (
          <p className="text-xs text-zinc-400">Last synced {new Date(settings.lastSyncAt).toLocaleString()}</p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          {message && <span className="text-sm text-emerald-600 dark:text-emerald-400">{message}</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
