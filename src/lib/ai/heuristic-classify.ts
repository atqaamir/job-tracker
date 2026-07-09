import type { ClassifyEmailInput, EmailClassification } from "@/lib/ai/types";
import { EMAIL_CATEGORIES } from "@/lib/ai/types";

/**
 * Free, offline fallback for email classification — no API key, no network
 * call, no cost. Used automatically when ANTHROPIC_API_KEY is not set. Less
 * accurate than the Claude-based classifier (no true summarization, coarser
 * status/company/position guesses), but keeps the whole app usable for $0.
 */

type Category = (typeof EMAIL_CATEGORIES)[number];

const CATEGORY_PATTERNS: { category: Category; pattern: RegExp }[] = [
  {
    category: "OFFER",
    pattern:
      /\b(pleased to offer|job offer|offer of employment|extend(?:ing)? (?:you |an )?offer|offer letter|excited to offer)\b/i,
  },
  {
    category: "REJECTION",
    pattern:
      /\b(unfortunately|not moving forward|other candidates|decided not to (?:proceed|move forward)|will not be moving forward|not (?:been )?selected|regret to inform|not be pursuing|position has been filled|pursuing other candidates|chosen to move forward with other)\b/i,
  },
  {
    category: "CODING_ASSESSMENT",
    pattern:
      /\b(coding (?:challenge|test|assessment)|technical assessment|take[- ]home (?:test|assignment|challenge)|hackerrank|codesignal|leetcode|online assessment|\bOA\b)\b/i,
  },
  {
    category: "INTERVIEW_INVITATION",
    pattern:
      /\b(schedule (?:an |your )?interview|invite you to interview|phone screen|would like to (?:schedule|set up|arrange)|interview (?:with|for)|hop on a call|book a (?:time|call))\b/i,
  },
  {
    category: "INTERVIEW_FOLLOWUP",
    pattern:
      /\b(thank you for (?:interviewing|taking the time|meeting)|great (?:speaking|meeting) with you|following up (?:on|after) (?:our|your) interview|next steps)\b/i,
  },
  {
    category: "APPLICATION_CONFIRMATION",
    pattern:
      /\b(thank you for applying|application (?:has been )?received|we(?:'| ha)ve received your application|received your resume|application confirmation)\b/i,
  },
  {
    category: "REQUEST_FOR_INFO",
    pattern:
      /\b(please (?:provide|send|complete)|could you (?:send|provide|share)|additional information (?:is )?(?:needed|required)|complete (?:the|your) (?:application|profile))\b/i,
  },
  {
    category: "RECRUITER_OUTREACH",
    pattern:
      /\b(exciting opportunity|open (?:role|position)|reaching out|came across your profile|would love to (?:chat|connect)|hiring for|recruiting for|great fit for)\b/i,
  },
];

const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "myworkday.com",
  "icims.com",
  "taleo.net",
  "smartrecruiters.com",
  "ashbyhq.com",
  "breezy.hr",
  "workable.com",
  "jobvite.com",
  "bamboohr.com",
  "recruitee.com",
  "successfactors.com",
];

const GENERIC_EMAIL_DOMAINS = ["gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com", "aol.com"];

const NEXT_ACTION_BY_CATEGORY: Partial<Record<Category, string>> = {
  INTERVIEW_INVITATION: "Respond to schedule your interview",
  CODING_ASSESSMENT: "Complete the assessment before the deadline",
  REQUEST_FOR_INFO: "Reply with the requested information",
  RECRUITER_OUTREACH: "Reply if you're interested in this opportunity",
  OFFER: "Review the offer and respond",
};

const STATUS_BY_CATEGORY: Partial<Record<Category, EmailClassification["suggestedStatus"]>> = {
  APPLICATION_CONFIRMATION: "APPLIED",
  RECRUITER_OUTREACH: "RECRUITER_CONTACTED",
  INTERVIEW_INVITATION: "PHONE_SCREEN",
  CODING_ASSESSMENT: "ASSESSMENT",
  OFFER: "OFFER",
  REJECTION: "REJECTED",
};

function detectCategory(text: string): Category {
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return "OTHER";
}

function extractCompany(fromName: string | null, fromEmail: string | null, subject: string): string | null {
  const domain = fromEmail?.split("@")[1]?.toLowerCase() ?? null;

  if (domain && !ATS_DOMAINS.some((ats) => domain.endsWith(ats)) && !GENERIC_EMAIL_DOMAINS.includes(domain)) {
    const label = domain
      .replace(/^(mail|careers|jobs|no-?reply|notifications?|hr|talent)\./, "")
      .split(".")[0];
    if (label && label.length > 1) {
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  const subjectMatch = subject.match(/(?:at|from|with)\s+([A-Z][\w&.\-\s]{1,40}?)(?:[!.,]|\s*[-–]|\s*$)/);
  if (subjectMatch) return subjectMatch[1].trim();

  if (fromName && !/no-?reply|notifications?|recruiting team|talent acquisition/i.test(fromName)) {
    return fromName.trim();
  }

  return null;
}

function extractPosition(subject: string): string | null {
  const patterns = [
    /for the (?:role|position) of ([^,.\n]{2,80})/i,
    /application for (?:the )?([^,.\n]{2,80}?)(?: at | position| role|$)/i,
    /re:?\s*([^,\-\n]{3,60})\s*(?:position|role|opening)/i,
  ];
  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractSalary(body: string): { min: number | null; max: number | null; currency: string | null } {
  const match = body.match(/\$\s?(\d{2,3}(?:,\d{3})*|\d{2,3}k)\s*(?:-|to|–)\s*\$?\s?(\d{2,3}(?:,\d{3})*|\d{2,3}k)?/i);
  if (!match) return { min: null, max: null, currency: null };

  const parse = (raw: string | undefined): number | null => {
    if (!raw) return null;
    if (/k$/i.test(raw)) return Math.round(parseFloat(raw) * 1000);
    return parseInt(raw.replace(/,/g, ""), 10);
  };

  return { min: parse(match[1]), max: parse(match[2]), currency: "USD" };
}

function extractLocation(body: string): string | null {
  if (/\bremote\b/i.test(body)) return "Remote";
  const cityState = body.match(/\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?,\s*[A-Z]{2})\b/);
  return cityState ? cityState[1] : null;
}

function extractEmploymentType(body: string): EmailClassification["employmentType"] {
  if (/\bfull[- ]time\b/i.test(body)) return "FULL_TIME";
  if (/\bpart[- ]time\b/i.test(body)) return "PART_TIME";
  if (/\bcontract\b/i.test(body)) return "CONTRACT";
  if (/\bintern(?:ship)?\b/i.test(body)) return "INTERNSHIP";
  if (/\bfreelance\b/i.test(body)) return "FREELANCE";
  return null;
}

function extractSource(text: string): string | null {
  if (/linkedin/i.test(text)) return "LinkedIn";
  if (/\bindeed\b/i.test(text)) return "Indeed";
  if (/referral|referred by/i.test(text)) return "Referral";
  if (/glassdoor/i.test(text)) return "Glassdoor";
  return null;
}

function extractDeadline(body: string): string | null {
  const match = body.match(
    /\b(?:by|before|no later than)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i
  );
  if (!match) return null;
  const parsed = new Date(match[1]);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function summarize(body: string): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 220) return cleaned;
  const truncated = cleaned.slice(0, 220);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 100 ? lastSpace : 220)}…`;
}

export function classifyEmailHeuristically(input: ClassifyEmailInput): EmailClassification {
  const combined = `${input.subject}\n${input.bodyText}`.slice(0, 5000);
  const category = detectCategory(combined);
  const isJobRelated = category !== "OTHER";

  const domain = input.fromEmail?.split("@")[1]?.toLowerCase() ?? "";
  const looksLikeNoReply = /no-?reply|notifications?@|donotreply/i.test(input.fromEmail ?? "");
  const isAts = ATS_DOMAINS.some((ats) => domain.endsWith(ats));

  const salary = extractSalary(input.bodyText);

  return {
    isJobRelated,
    category,
    company: isJobRelated ? extractCompany(input.fromName, input.fromEmail, input.subject) : null,
    position: isJobRelated ? extractPosition(input.subject) : null,
    suggestedStatus: STATUS_BY_CATEGORY[category] ?? null,
    recruiterName: isJobRelated && !looksLikeNoReply && !isAts ? input.fromName : null,
    recruiterEmail: isJobRelated && !looksLikeNoReply ? input.fromEmail : null,
    salaryMin: salary.min,
    salaryMax: salary.max,
    salaryCurrency: salary.currency,
    location: isJobRelated ? extractLocation(input.bodyText) : null,
    employmentType: isJobRelated ? extractEmploymentType(input.bodyText) : null,
    source: isJobRelated ? extractSource(combined) : null,
    summary: summarize(input.bodyText || input.subject),
    sentiment:
      category === "REJECTION"
        ? "negative"
        : category === "OFFER" || category === "INTERVIEW_INVITATION" || category === "INTERVIEW_FOLLOWUP"
          ? "positive"
          : "neutral",
    deadline: isJobRelated ? extractDeadline(input.bodyText) : null,
    suggestedNextAction: NEXT_ACTION_BY_CATEGORY[category] ?? null,
  };
}
