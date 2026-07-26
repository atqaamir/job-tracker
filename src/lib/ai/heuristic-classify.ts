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

// The ATS platform's own name leaking through as "the company" (e.g. a
// SuccessFactors-hosted customer's system account is literally named
// "SuccessFactors") — reject it from every extraction path, not just the
// domain check.
const ATS_PLATFORM_NAMES = new Set(ATS_DOMAINS.map((d) => d.split(".")[0].toLowerCase()));

// A small set of two-part TLDs where the registrable domain is the label
// *before* these two segments, not immediately before the last one — e.g.
// "acme.co.uk" is Acme, not "co". Not exhaustive; covers the common cases.
const TWO_PART_TLDS = new Set(["co.uk", "com.au", "co.in", "com.br", "co.nz", "co.jp", "com.sg"]);

// Common two/three-letter regional or functional subdomains that show up in
// front of a company's real domain (e.g. "eu.acme.com", "jobs.acme.com").
// The original prefix-strip only covered a handful of these; anything
// unrecognized fell through and got extracted as if it were the company.
const KNOWN_SUBDOMAIN_PREFIXES =
  /^(mail\d?|careers?|jobs?|no-?reply|notifications?|hr|talent|recruiting|apply|applications?|e|eu|us|na|uk|apac|emea|amer)$/i;

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

// Marks that a two-word from-name is a company ("Acme Careers", "Acme
// Recruiting"), not a person — used to keep the personal-name filter below
// from rejecting these.
const COMPANY_MARKER =
  /\b(inc|incorporated|llc|ltd|corp|corporation|co|company|group|team|talent|careers?|recruiting|recruitment|hr|technologies|tech|labs|systems|solutions|partners|holdings|ventures|studio|studios)\b/i;

/** True for from-names shaped like "Jane Doe" — a person, not a company. */
function looksLikePersonalName(name: string): boolean {
  if (COMPANY_MARKER.test(name)) return false;
  const words = name.trim().split(/\s+/);
  return words.length === 2 && words.every((w) => /^[A-Z][a-z'.-]+$/.test(w));
}

/**
 * Final gate every extracted company candidate goes through, regardless of
 * which method produced it (domain label, subject/body regex, from-name
 * fallback). Regex character classes like `[A-Z]` stop enforcing case once
 * the pattern carries an `/i` flag (JS applies `i` to the whole pattern,
 * including character classes) — so "capitalized" candidates from those
 * patterns weren't actually guaranteed to be. Checking real capitalization
 * here, in code, is what actually rejects lowercase phrase fragments like
 * "the team" or "joining our team".
 */
// Generic system-account words that show up glued onto an ATS/platform name
// in auto-generated sender display names ("Recruitee-email", "Greenhouse
// Notifications") — checked as a substring since these compound directly
// with a platform or generic word rather than appearing as their own token.
const SYSTEM_ACCOUNT_WORD = /(email|notification|system|noreply|donotreply|mailer|no-reply)/i;

function isPlausibleCompanyName(candidate: string): boolean {
  const trimmed = candidate.trim();
  const lower = trimmed.toLowerCase();
  if (trimmed.length <= 3) return false;
  if (!/^[A-Z]/.test(trimmed)) return false;
  if (SYSTEM_ACCOUNT_WORD.test(lower)) return false;
  // Substring, not just exact match — catches "Recruitee-email" or
  // "Greenhouse Careers" compounding the platform name with something else,
  // not just the bare platform name on its own.
  if ([...ATS_PLATFORM_NAMES].some((platform) => lower.includes(platform))) return false;
  if (looksLikePersonalName(trimmed)) return false;
  return true;
}

const COMPANY_PATTERNS = [
  /application (?:to|at|with)\s+([A-Z][\w&.\-\s]{1,40}?)(?:[!.,]|\s*[-–]|\s*$)/i,
  /applying to\s+([A-Z][\w&.\-\s]{1,40}?)(?:[!.,]|\s*[-–]|\s*$)/i,
  /interest in\s+([A-Z][\w&.\-\s]{1,40}?)(?:[!.,]|\s*[-–]|\s*$)/i,
  /update from\s+([A-Z][\w&.\-\s]{1,40}?)(?:[!.,]|\s*[-–]|\s*$)/i,
  /^([A-Z][\w&.\-\s]{1,40}?)\s+(?:careers|recruiting|talent acquisition|talent team|hiring team)\b/im,
  /(?:at|from|with)\s+([A-Z][\w&.\-\s]{1,40}?)(?:[!.,]|\s*[-–]|\s*$)/,
];

/**
 * The registrable-domain label to use as a company name — the segment right
 * before the TLD, not necessarily the first label. "eu.acme.com" is Acme,
 * not "eu"; "acme.co.uk" is Acme, not "co". Falls back to the first label
 * when there's nothing better to go on (a bare two-part domain).
 */
function domainCompanyLabel(domain: string): string | null {
  const parts = domain.split(".");
  if (parts.length < 2) return null;

  const lastTwo = parts.slice(-2).join(".");
  const labelIndex = TWO_PART_TLDS.has(lastTwo) ? parts.length - 3 : parts.length - 2;
  if (labelIndex < 0) return null;

  // Walk backward past any recognized subdomain prefixes (mail, careers,
  // jobs, regional codes, ...) in case the registrable-domain guess above
  // still landed on one, e.g. "notifications.mail.acme.com".
  let idx = labelIndex;
  while (idx > 0 && KNOWN_SUBDOMAIN_PREFIXES.test(parts[idx])) idx--;

  const label = parts[idx];
  return label && label.length > 1 ? label : null;
}

function extractCompany(fromName: string | null, fromEmail: string | null, subject: string, body: string): string | null {
  const domain = fromEmail?.split("@")[1]?.toLowerCase() ?? null;

  if (domain && !ATS_DOMAINS.some((ats) => domain.endsWith(ats)) && !GENERIC_EMAIL_DOMAINS.includes(domain)) {
    const label = domainCompanyLabel(domain);
    if (label) {
      const candidate = label.charAt(0).toUpperCase() + label.slice(1);
      if (isPlausibleCompanyName(candidate)) return candidate;
    }
  }

  // Subject first, then the opening of the body — ATS emails routinely name
  // the company in the first line even when the subject doesn't
  // ("Thank you for your interest in Acme!").
  for (const text of [subject, body.slice(0, 1000)]) {
    for (const pattern of COMPANY_PATTERNS) {
      const match = text.match(pattern);
      if (match && isPlausibleCompanyName(match[1])) return match[1].trim();
    }
  }

  // Last resort: the sender's display name. isPlausibleCompanyName rejects
  // anything too short to be meaningful (likely initials, e.g. "JD"),
  // shaped like a person's name ("Jane Doe"), or the ATS platform's own
  // name leaking through ("SuccessFactors") — a wrong company name is worse
  // than none, since it blocks matching this email to the right application.
  if (fromName && !/no-?reply|do-?not-?reply|notifications?|recruiting team|talent acquisition/i.test(fromName)) {
    const trimmed = fromName.trim();
    if (isPlausibleCompanyName(trimmed)) return trimmed;
  }

  return null;
}

const POSITION_PATTERNS = [
  /for the (?:role|position) of ([^,.\n]{2,80})/i,
  /application for (?:the )?([^,.\n]{2,80}?)(?: at | position| role|$)/i,
  // Reply-subject style ("Re: Backend Engineer position") — anchored to the
  // start and requires the colon, so it can't match "re" inside an
  // unrelated word like "review" or "requirements" mid-text.
  /^re:\s*([^,\-\n]{3,60}?)\s*(?:position|role|opening)/i,
  /for the ([A-Z][\w\s/,-]{2,60}?) (?:role|position)\b/,
];

function extractPosition(subject: string, body: string): string | null {
  // Subject first, then the opening of the body — many application
  // confirmations don't name the role in the subject line at all.
  for (const text of [subject, body.slice(0, 1000)]) {
    for (const pattern of POSITION_PATTERNS) {
      const match = text.match(pattern);
      if (match) return match[1].trim();
    }
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
  const looksLikeNoReply = /no-?reply|do-?not-?reply|notifications?@|donotreply/i.test(input.fromEmail ?? "");
  const isAts = ATS_DOMAINS.some((ats) => domain.endsWith(ats));

  const salary = extractSalary(input.bodyText);

  return {
    isJobRelated,
    category,
    company: isJobRelated ? extractCompany(input.fromName, input.fromEmail, input.subject, input.bodyText) : null,
    position: isJobRelated ? extractPosition(input.subject, input.bodyText) : null,
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
