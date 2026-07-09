// Fixed, non-cycling assignment of categorical chart colors to application
// statuses. Order matches the validated categorical palette (blue, aqua,
// yellow, green, violet, red, magenta, orange) grouped by pipeline stage.
export const STATUS_CHART_COLOR: Record<string, string> = {
  DRAFT: "var(--chart-muted)",
  APPLIED: "var(--chart-blue)",
  VIEWED: "var(--chart-aqua)",
  RECRUITER_CONTACTED: "var(--chart-yellow)",
  ASSESSMENT: "var(--chart-violet)",
  PHONE_SCREEN: "var(--chart-violet)",
  TECHNICAL_INTERVIEW: "var(--chart-violet)",
  FINAL_INTERVIEW: "var(--chart-violet)",
  OFFER: "var(--chart-green)",
  ACCEPTED: "var(--chart-green)",
  REJECTED: "var(--chart-red)",
  WITHDRAWN: "var(--chart-orange)",
  GHOSTED: "var(--chart-magenta)",
};

export const SEQUENTIAL_CHART_COLOR = "var(--chart-blue)";
