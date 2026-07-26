// Client-only. When Sync Now or Fetch All Again would fetch more than 2
// weeks, a popup asks how far back AI classification should apply, then
// remembers the answer per action in this browser's localStorage so it only
// asks once. Shared between the popup (sync-button.tsx) and the Settings
// page, which lets the user view/change/reset that remembered answer.

export type SyncAction = "sync" | "fetchAll";

// Matches the server-side clamp in /api/sync — effectively "the entire
// range" for any realistic sync window.
export const ENTIRE_RANGE_DAYS = 18_250;

export const AI_TIMEFRAME_OPTIONS = [
  { days: 14, label: "2 weeks (default)" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: ENTIRE_RANGE_DAYS, label: "Entire fetched range" },
];

const STORAGE_KEY = (action: SyncAction) => `job-tracker:ai-recent-days:${action}`;

export function getRememberedAiDays(action: SyncAction): number | null {
  if (typeof window === "undefined") return null;
  const v = Number(window.localStorage.getItem(STORAGE_KEY(action)));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function setRememberedAiDays(action: SyncAction, days: number) {
  window.localStorage.setItem(STORAGE_KEY(action), String(days));
}

export function clearRememberedAiDays(action: SyncAction) {
  window.localStorage.removeItem(STORAGE_KEY(action));
}
