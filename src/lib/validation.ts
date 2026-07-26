import { z } from "zod";

export const APPLICATION_STATUS_VALUES = [
  "DRAFT",
  "APPLIED",
  "VIEWED",
  "RECRUITER_CONTACTED",
  "ASSESSMENT",
  "PHONE_SCREEN",
  "TECHNICAL_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "GHOSTED",
] as const;

// Non-terminal stages — the possible values of `furthestStage`. Excludes
// DRAFT (never a meaningful "furthest" point) and the terminal outcomes
// (REJECTED/WITHDRAWN/GHOSTED), which represent how an application ended,
// not progress reached.
export const PROGRESS_STAGE_VALUES = [
  "APPLIED",
  "VIEWED",
  "RECRUITER_CONTACTED",
  "ASSESSMENT",
  "PHONE_SCREEN",
  "TECHNICAL_INTERVIEW",
  "FINAL_INTERVIEW",
  "OFFER",
  "ACCEPTED",
] as const;

// Kept intentionally small — these are the models classify.ts knows how to
// call correctly (each needs different request params; see classify.ts).
export const AI_MODEL_VALUES = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"] as const;

export const EMPLOYMENT_TYPE_VALUES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "FREELANCE",
  "REMOTE",
] as const;

export const applicationCreateSchema = z.object({
  company: z.string().min(1).max(200),
  position: z.string().min(1).max(200),
  status: z.enum(APPLICATION_STATUS_VALUES),
  dateApplied: z.coerce.date().optional().nullable(),
  recruiterName: z.string().max(200).optional().nullable(),
  recruiterEmail: z.string().email().optional().nullable().or(z.literal("")),
  salaryMin: z.coerce.number().int().nonnegative().optional().nullable(),
  salaryMax: z.coerce.number().int().nonnegative().optional().nullable(),
  salaryCurrency: z.string().max(10).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPE_VALUES).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  notes: z.string().max(10_000).optional().nullable(),
});

export const applicationUpdateSchema = applicationCreateSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;
export type ApplicationCreateFormInput = z.input<typeof applicationCreateSchema>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;

export const syncSettingsUpdateSchema = z.object({
  daysToLookBack: z.coerce
    .number()
    .int()
    .min(7, "Must be at least 7 days")
    .max(1825, "Must be 5 years (1825 days) or fewer"),
  gmailQuery: z.string().min(1).max(500),
  autoSync: z.boolean(),
  aiEnabled: z.boolean().optional(),
  aiModel: z.enum(AI_MODEL_VALUES).optional(),
  // Omitted entirely = leave the stored key unchanged. Empty string = clear
  // it. A non-empty string = replace it. Never returned back to the client.
  anthropicApiKey: z.string().max(500).optional(),
});

export type SyncSettingsUpdateInput = z.infer<typeof syncSettingsUpdateSchema>;
