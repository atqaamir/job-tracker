export const EMAIL_CATEGORIES = [
  "APPLICATION_CONFIRMATION",
  "RECRUITER_OUTREACH",
  "INTERVIEW_INVITATION",
  "INTERVIEW_FOLLOWUP",
  "CODING_ASSESSMENT",
  "OFFER",
  "REJECTION",
  "REQUEST_FOR_INFO",
  "OTHER",
] as const;

export const APPLICATION_STATUSES = [
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
] as const;

export const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "FREELANCE",
  "REMOTE",
] as const;

export interface EmailClassification {
  isJobRelated: boolean;
  category: (typeof EMAIL_CATEGORIES)[number];
  company: string | null;
  position: string | null;
  suggestedStatus: (typeof APPLICATION_STATUSES)[number] | null;
  recruiterName: string | null;
  recruiterEmail: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  location: string | null;
  employmentType: (typeof EMPLOYMENT_TYPES)[number] | null;
  source: string | null;
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  deadline: string | null;
  suggestedNextAction: string | null;
}

export interface ClassifyEmailInput {
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  bodyText: string;
  receivedAt: Date;
}
