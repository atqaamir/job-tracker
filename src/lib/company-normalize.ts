/**
 * Normalizes a company name for equality comparisons only (matching
 * applications across emails / detecting duplicates) — not for display.
 * Strips legal suffixes and generic HR/ATS boilerplate that otherwise makes
 * the same real company look different across emails (e.g. "Acme Inc" vs
 * "Acme Careers Team" vs "acme.").
 */
const CORPORATE_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc|llp|sa|ag|group|holdings)\b\.?/gi;

const HR_BOILERPLATE =
  /\b(careers?|recruiting|recruitment|talent(\s?acquisition)?|hiring(\s?team)?|human resources|\bhr\b|jobs?|no-?reply|do-?not-?reply|notifications?)\b/gi;

export function normalizeCompanyKey(company: string): string {
  return company
    .toLowerCase()
    .replace(HR_BOILERPLATE, " ")
    .replace(CORPORATE_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
