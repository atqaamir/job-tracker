"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DuplicatesDialog } from "@/components/applications/duplicates-dialog";
import { AI_MODEL_VALUES } from "@/lib/validation";
import {
  AI_TIMEFRAME_OPTIONS,
  getRememberedAiDays,
  setRememberedAiDays,
  clearRememberedAiDays,
  type SyncAction,
} from "@/lib/ai-sync-prefs";

interface SyncSettingsDTO {
  daysToLookBack: number;
  gmailQuery: string;
  autoSync: boolean;
  lastSyncAt: string | null;
  aiEnabled: boolean;
  aiModel: string;
}

const LOOKBACK_PRESETS = [
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
  { label: "6 months", days: 180 },
  { label: "1 year", days: 365 },
  { label: "2 years", days: 730 },
];

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5 — fastest & cheapest ($1 / $5 per million tokens)",
  "claude-sonnet-5": "Sonnet 5 — balanced ($3 / $15 per million tokens)",
  "claude-opus-5": "Opus 5 — most accurate ($5 / $25 per million tokens)",
};

export function SettingsForm() {
  const [settings, setSettings] = React.useState<SyncSettingsDTO | null>(null);
  const [aiKeyConfigured, setAiKeyConfigured] = React.useState(false);
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = React.useState(false);
  const [aiDaysSync, setAiDaysSync] = React.useState<number | null>(null);
  const [aiDaysFetchAll, setAiDaysFetchAll] = React.useState<number | null>(null);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only localStorage on mount
    setAiDaysSync(getRememberedAiDays("sync"));
    setAiDaysFetchAll(getRememberedAiDays("fetchAll"));
  }, []);

  function handleAiTimeframeChange(action: SyncAction, value: string) {
    const setter = action === "sync" ? setAiDaysSync : setAiDaysFetchAll;
    if (value === "ask") {
      clearRememberedAiDays(action);
      setter(null);
    } else {
      const days = Number(value);
      setRememberedAiDays(action, days);
      setter(days);
    }
  }

  React.useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data.settings);
        setAiKeyConfigured(Boolean(data.aiKeyConfigured));
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings(overrides: Record<string, unknown> = {}) {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        daysToLookBack: settings.daysToLookBack,
        gmailQuery: settings.gmailQuery,
        autoSync: settings.autoSync,
        aiEnabled: settings.aiEnabled,
        aiModel: settings.aiModel,
        ...overrides,
      };
      // Only send the key if the user actually typed one — omitting it
      // leaves whatever's already stored untouched (see route.ts).
      if (apiKeyInput.trim() && !("anthropicApiKey" in overrides)) {
        body.anthropicApiKey = apiKeyInput.trim();
      }
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to save settings");
      }
      setSettings(data.settings);
      setAiKeyConfigured(Boolean(data.aiKeyConfigured));
      setApiKeyInput("");
      setMessage("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveKey() {
    await saveSettings({ anthropicApiKey: "" });
  }

  async function handleClearAll() {
    setClearing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/applications/clear-all", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to delete fetched data");
      }
      setConfirmOpen(false);
      setSettings((prev) => (prev ? { ...prev, lastSyncAt: null } : prev));
      setMessage(`Deleted ${data.deletedApplications} application(s). Your next sync starts fresh.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setClearing(false);
    }
  }

  if (loading || !settings) {
    return <p className="text-sm text-zinc-400">Loading settings…</p>;
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Gmail Sync</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="daysToLookBack">Fetch All Again window</Label>
          <p className="text-xs text-zinc-400">
            The regular <strong>Sync Now</strong> button only fetches what&apos;s new since your last successful
            sync (and pulls the full year on your very first-ever sync) — this setting doesn&apos;t affect it. It
            only controls how far back <strong>Fetch All Again</strong> (next to Sync Now) searches when you want a
            deliberate full resync — that action deletes all your existing applications first and re-fetches from
            scratch using this window.
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
          <Button onClick={() => saveSettings()} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          {message && <span className="text-sm text-emerald-600 dark:text-emerald-400">{message}</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </CardContent>
    </Card>

    <Card className="mt-6">
      <CardHeader>
        <CardTitle>AI Classification</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Use AI-powered classification</p>
            <p className="text-xs text-zinc-400">
              More accurate company/position/status extraction and real summaries, at a small per-email cost. Off by
              default — the free built-in classifier is used instead.
            </p>
          </div>
          <Switch
            checked={settings.aiEnabled}
            onCheckedChange={(checked) => setSettings({ ...settings, aiEnabled: checked })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="aiModel">Model</Label>
          <Select
            value={settings.aiModel}
            onValueChange={(v) => setSettings({ ...settings, aiModel: v })}
            disabled={!settings.aiEnabled}
          >
            <SelectTrigger id="aiModel" className="w-full sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODEL_VALUES.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODEL_LABELS[m] ?? m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="anthropicApiKey">Anthropic API key</Label>
          <p className="text-xs text-zinc-400">
            {aiKeyConfigured ? (
              <>
                <span className="text-emerald-600 dark:text-emerald-400">✓ A key is configured.</span> Enter a new
                one below to replace it, or leave blank to keep it.
              </>
            ) : (
              <>
                No key configured — AI mode won&apos;t run until you add one. Get one at{" "}
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="underline">
                  console.anthropic.com
                </a>{" "}
                (starts with <code>sk-ant-</code>).
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Input
              id="anthropicApiKey"
              type="password"
              placeholder={aiKeyConfigured ? "Leave blank to keep current key" : "sk-ant-…"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="max-w-md"
            />
            {aiKeyConfigured && (
              <Button type="button" variant="outline" size="sm" onClick={handleRemoveKey} disabled={saving}>
                Remove key
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => saveSettings()} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card className="mt-6">
      <CardHeader>
        <CardTitle>AI Timeframe Memory</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <p className="text-xs text-zinc-400">
          When Sync Now or Fetch All Again would fetch more than 2 weeks of email, a popup asks how far back AI
          classification should apply, then remembers your answer in this browser so it won&apos;t ask again.
          Change or reset that saved answer here — this only affects this browser, not your account.
        </p>
        {([
          { action: "sync" as const, label: "Sync Now", value: aiDaysSync },
          { action: "fetchAll" as const, label: "Fetch All Again", value: aiDaysFetchAll },
        ]).map(({ action, label, value }) => (
          <div key={action} className="flex flex-col gap-2">
            <Label>{label}</Label>
            <Select value={String(value ?? "ask")} onValueChange={(v) => handleAiTimeframeChange(action, v)}>
              <SelectTrigger className="w-full sm:w-96">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">Ask me each time</SelectItem>
                {AI_TIMEFRAME_OPTIONS.map((o) => (
                  <SelectItem key={o.days} value={String(o.days)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>

    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Duplicate Applications</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Find and merge duplicates</p>
            <p className="text-xs text-zinc-400">
              Groups applications that look like the same company and lets you pick which one to keep — emails from
              the others get merged into it.
            </p>
          </div>
          <Button variant="outline" onClick={() => setDuplicatesOpen(true)} className="shrink-0">
            Find Duplicates
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card className="mt-6 border-red-200 dark:border-red-900/50">
      <CardHeader>
        <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Delete all fetched data</p>
            <p className="text-xs text-zinc-400">
              Permanently deletes every application and email Job Tracker has pulled from your Gmail, plus
              notifications and sync history. Your Gmail connection and sync preferences above are kept — the next
              sync starts from a clean slate.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setConfirmOpen(true)} className="shrink-0">
            Delete All Fetched Data
          </Button>
        </div>
      </CardContent>
    </Card>

    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete all fetched data?</DialogTitle>
          <DialogDescription>
            This permanently deletes every application, email, and notification Job Tracker has stored for your
            account. This can&apos;t be undone — your next sync will re-fetch from Gmail using your current sync
            settings.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={clearing}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleClearAll} disabled={clearing}>
            {clearing ? "Deleting…" : "Yes, delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} onMerged={() => {}} />
    </>
  );
}
