import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { EMAIL_CATEGORIES, APPLICATION_STATUSES, EMPLOYMENT_TYPES } from "@/lib/ai/types";
import type { ClassifyEmailInput, EmailClassification } from "@/lib/ai/types";
import { classifyEmailHeuristically } from "@/lib/ai/heuristic-classify";

export { EMAIL_CATEGORIES, APPLICATION_STATUSES, EMPLOYMENT_TYPES };
export type { EmailClassification };

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const ClassificationSchema = z.object({
  isJobRelated: z
    .boolean()
    .describe(
      "Whether this email relates to a job application the recipient submitted or a recruiter reaching out about a job opportunity for them."
    ),
  category: z.enum(EMAIL_CATEGORIES),
  company: z.string().nullable(),
  position: z.string().nullable(),
  suggestedStatus: z
    .enum(APPLICATION_STATUSES)
    .nullable()
    .describe("Best-guess application pipeline status implied by this email."),
  recruiterName: z.string().nullable(),
  recruiterEmail: z.string().nullable(),
  salaryMin: z.number().int().nullable(),
  salaryMax: z.number().int().nullable(),
  salaryCurrency: z.string().nullable().describe("ISO currency code, e.g. USD"),
  location: z.string().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable(),
  source: z
    .string()
    .nullable()
    .describe("Where the application originated, e.g. LinkedIn, company site, referral, Indeed."),
  summary: z
    .string()
    .describe("One to two sentence plain-English summary of the email, especially useful for long recruiter emails."),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  deadline: z
    .string()
    .nullable()
    .describe(
      "ISO 8601 date if the email mentions a deadline (assessment due date, response-by date, offer expiration)."
    ),
  suggestedNextAction: z.string().nullable().describe("A short suggested follow-up action for the recipient, if any."),
});

const SYSTEM_PROMPT = `You classify and extract structured data from a single email that matched a job-search related Gmail search. The recipient is a job seeker tracking their applications.

Determine whether the email is genuinely related to a job the recipient applied to or a recruiter contacting them about an opportunity. Marketing newsletters, unrelated personal email, or emails that only mention the word "position"/"opportunity" in an unrelated sense should have isJobRelated=false and category=OTHER.

Extract company and position names as they would naturally appear on a resume (e.g. "Google", "Senior Software Engineer"), not verbatim email subject lines. Only fill fields you are reasonably confident about; use null otherwise. Never fabricate a recruiter name/email that isn't in the email.`;

async function classifyEmailWithClaude(input: ClassifyEmailInput): Promise<EmailClassification> {
  const anthropic = getClient();

  const userContent = `From: ${input.fromName ?? ""} <${input.fromEmail ?? "unknown"}>
Date: ${input.receivedAt.toISOString()}
Subject: ${input.subject}

Body:
${input.bodyText.slice(0, 12_000)}`;

  const response = await anthropic.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: zodOutputFormat(ClassificationSchema),
    },
    messages: [{ role: "user", content: userContent }],
  });

  if (!response.parsed_output) {
    throw new Error("Email classification failed to parse");
  }

  return response.parsed_output;
}

/**
 * Classifies an email into a job-search category and extracts structured
 * fields. Uses Claude when ANTHROPIC_API_KEY is configured (more accurate:
 * true summarization, better company/position/status inference); otherwise
 * falls back to a free, offline, keyword-based classifier so the app works
 * at zero cost. See src/lib/ai/heuristic-classify.ts.
 */
export async function classifyEmail(input: ClassifyEmailInput): Promise<EmailClassification> {
  if (process.env.ANTHROPIC_API_KEY) {
    return classifyEmailWithClaude(input);
  }
  return classifyEmailHeuristically(input);
}
