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
