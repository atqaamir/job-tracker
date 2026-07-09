import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES, EMAIL_CATEGORIES, EMPLOYMENT_TYPES } from "@/lib/ai/classify";
import { APPLICATION_STATUS_VALUES, EMPLOYMENT_TYPE_VALUES } from "@/lib/validation";
import { EmailCategory, ApplicationStatus, EmploymentType } from "@/generated/prisma/client";

describe("AI classification enums stay in sync with the Prisma schema", () => {
  it("every EMAIL_CATEGORIES value is a valid Prisma EmailCategory", () => {
    for (const category of EMAIL_CATEGORIES) {
      expect(Object.values(EmailCategory)).toContain(category);
    }
  });

  it("every APPLICATION_STATUSES value is a valid Prisma ApplicationStatus", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(Object.values(ApplicationStatus)).toContain(status);
    }
  });

  it("every APPLICATION_STATUSES value is also accepted by the form validation schema", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(APPLICATION_STATUS_VALUES).toContain(status);
    }
  });

  it("every EMPLOYMENT_TYPES value is a valid Prisma EmploymentType", () => {
    for (const type of EMPLOYMENT_TYPES) {
      expect(Object.values(EmploymentType)).toContain(type);
    }
  });

  it("every EMPLOYMENT_TYPES value is also accepted by the form validation schema", () => {
    for (const type of EMPLOYMENT_TYPES) {
      expect(EMPLOYMENT_TYPE_VALUES).toContain(type);
    }
  });
});
