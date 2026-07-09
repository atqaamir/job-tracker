import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, relativeTime, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { APPLICATION_STATUS_VALUES } from "@/lib/validation";

describe("formatCurrency", () => {
  it("formats a whole-dollar amount with no decimals", () => {
    expect(formatCurrency(120000, "USD")).toBe("$120,000");
  });

  it("returns an empty string for null amounts", () => {
    expect(formatCurrency(null, "USD")).toBe("");
  });

  it("falls back to USD when no currency is given", () => {
    expect(formatCurrency(50000, null)).toBe("$50,000");
  });

  it("falls back gracefully for an invalid currency code", () => {
    expect(formatCurrency(1000, "NOT_A_CURRENCY")).toContain("1,000");
  });
});

describe("formatDate", () => {
  it("returns an empty string for null", () => {
    expect(formatDate(null)).toBe("");
  });

  it("formats an ISO date string", () => {
    expect(formatDate("2026-01-15")).toMatch(/Jan 1[45], 2026/);
  });
});

describe("relativeTime", () => {
  it("returns an empty string for null", () => {
    expect(relativeTime(null)).toBe("");
  });

  it("returns 'today' for the current moment", () => {
    expect(relativeTime(new Date())).toBe("today");
  });

  it("returns 'yesterday' for one day ago", () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(relativeTime(yesterday)).toBe("yesterday");
  });

  it("returns a day count for under a month", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
    expect(relativeTime(fiveDaysAgo)).toBe("5d ago");
  });
});

describe("status label/color coverage", () => {
  it("has a label for every application status", () => {
    for (const status of APPLICATION_STATUS_VALUES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("has a chart color class for every application status", () => {
    for (const status of APPLICATION_STATUS_VALUES) {
      expect(STATUS_COLORS[status]).toBeTruthy();
    }
  });
});
