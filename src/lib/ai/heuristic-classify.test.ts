import { describe, expect, it } from "vitest";
import { classifyEmailHeuristically } from "@/lib/ai/heuristic-classify";
import type { ClassifyEmailInput } from "@/lib/ai/types";

function email(overrides: Partial<ClassifyEmailInput>): ClassifyEmailInput {
  return {
    subject: "",
    fromName: null,
    fromEmail: null,
    bodyText: "",
    receivedAt: new Date("2026-01-15T00:00:00Z"),
    ...overrides,
  };
}

describe("classifyEmailHeuristically", () => {
  it("detects a rejection email", () => {
    const result = classifyEmailHeuristically(
      email({
        subject: "Update on your application to Acme Corp",
        fromEmail: "careers@acme.com",
        bodyText:
          "Thank you for your interest in the Software Engineer role. Unfortunately, we have decided to move forward with other candidates at this time.",
      })
    );
    expect(result.isJobRelated).toBe(true);
    expect(result.category).toBe("REJECTION");
    expect(result.sentiment).toBe("negative");
    expect(result.suggestedStatus).toBe("REJECTED");
  });

  it("detects an interview invitation", () => {
    const result = classifyEmailHeuristically(
      email({
        subject: "Interview for Backend Engineer at Acme",
        fromEmail: "recruiting@acme.com",
        bodyText: "We would like to schedule an interview with you for the Backend Engineer position next week.",
      })
    );
    expect(result.category).toBe("INTERVIEW_INVITATION");
    expect(result.sentiment).toBe("positive");
    expect(result.suggestedStatus).toBe("PHONE_SCREEN");
  });

  it("detects a coding assessment", () => {
    const result = classifyEmailHeuristically(
      email({
        subject: "Complete your HackerRank coding challenge",
        fromEmail: "noreply@hackerrank.com",
        bodyText: "Please complete this coding challenge within 5 days.",
      })
    );
    expect(result.category).toBe("CODING_ASSESSMENT");
    expect(result.suggestedStatus).toBe("ASSESSMENT");
  });

  it("detects an application confirmation and extracts a company from the domain", () => {
    const result = classifyEmailHeuristically(
      email({
        subject: "Thanks for applying to Stripe",
        fromEmail: "careers@stripe.com",
        fromName: "Stripe Careers",
        bodyText: "Thank you for applying. We have received your application and will be in touch.",
      })
    );
    expect(result.category).toBe("APPLICATION_CONFIRMATION");
    expect(result.company).toBe("Stripe");
    expect(result.suggestedStatus).toBe("APPLIED");
  });

  it("marks an unrelated newsletter as not job related", () => {
    const result = classifyEmailHeuristically(
      email({
        subject: "Your weekly newsletter digest",
        fromEmail: "news@example.com",
        bodyText: "Here are this week's top stories from around the web.",
      })
    );
    expect(result.isJobRelated).toBe(false);
    expect(result.category).toBe("OTHER");
  });

  it("extracts a salary range from the body", () => {
    const result = classifyEmailHeuristically(
      email({
        subject: "Offer of employment",
        fromEmail: "hr@acme.com",
        bodyText: "We are pleased to offer you a salary of $120,000 - $140,000 per year.",
      })
    );
    expect(result.category).toBe("OFFER");
    expect(result.salaryMin).toBe(120000);
    expect(result.salaryMax).toBe(140000);
  });

  it("never fabricates a recruiter identity for no-reply senders", () => {
    const result = classifyEmailHeuristically(
      email({
        subject: "Your application was received",
        fromEmail: "no-reply@greenhouse.io",
        fromName: "Greenhouse",
        bodyText: "Thank you for applying. We have received your application.",
      })
    );
    expect(result.recruiterName).toBeNull();
    expect(result.recruiterEmail).toBeNull();
  });
});
