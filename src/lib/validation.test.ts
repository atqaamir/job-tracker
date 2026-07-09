import { describe, expect, it } from "vitest";
import { applicationCreateSchema, applicationUpdateSchema } from "@/lib/validation";

describe("applicationCreateSchema", () => {
  it("accepts a minimal valid application", () => {
    const result = applicationCreateSchema.safeParse({
      company: "Acme Corp",
      position: "Software Engineer",
      status: "APPLIED",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing company", () => {
    const result = applicationCreateSchema.safeParse({
      position: "Software Engineer",
      status: "APPLIED",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const result = applicationCreateSchema.safeParse({
      company: "Acme Corp",
      position: "Software Engineer",
      status: "NOT_A_REAL_STATUS",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed recruiter email", () => {
    const result = applicationCreateSchema.safeParse({
      company: "Acme Corp",
      position: "Software Engineer",
      status: "APPLIED",
      recruiterEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("coerces a date string into a Date", () => {
    const result = applicationCreateSchema.safeParse({
      company: "Acme Corp",
      position: "Software Engineer",
      status: "APPLIED",
      dateApplied: "2026-01-15",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateApplied).toBeInstanceOf(Date);
    }
  });

  it("coerces numeric salary strings", () => {
    const result = applicationCreateSchema.safeParse({
      company: "Acme Corp",
      position: "Software Engineer",
      status: "APPLIED",
      salaryMin: "120000",
      salaryMax: "150000",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.salaryMin).toBe(120000);
      expect(result.data.salaryMax).toBe(150000);
    }
  });

  it("rejects a negative salary", () => {
    const result = applicationCreateSchema.safeParse({
      company: "Acme Corp",
      position: "Software Engineer",
      status: "APPLIED",
      salaryMin: -5000,
    });
    expect(result.success).toBe(false);
  });
});

describe("applicationUpdateSchema", () => {
  it("allows a partial update with just isArchived", () => {
    const result = applicationUpdateSchema.safeParse({ isArchived: true });
    expect(result.success).toBe(true);
  });

  it("allows an empty patch", () => {
    const result = applicationUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
