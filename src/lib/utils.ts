import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount.toLocaleString()}`;
  }
}

export function formatDate(date: string | Date | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function relativeTime(date: string | Date | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPLIED: "Applied",
  VIEWED: "Viewed",
  RECRUITER_CONTACTED: "Recruiter Contacted",
  ASSESSMENT: "Assessment",
  PHONE_SCREEN: "Phone Screen",
  TECHNICAL_INTERVIEW: "Technical Interview",
  FINAL_INTERVIEW: "Final Interview",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  GHOSTED: "Ghosted",
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  APPLIED: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  VIEWED: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  RECRUITER_CONTACTED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  ASSESSMENT: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  PHONE_SCREEN: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  TECHNICAL_INTERVIEW: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  FINAL_INTERVIEW: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  OFFER: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ACCEPTED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  WITHDRAWN: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  GHOSTED: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};
