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

  // Regression tests for garbage company/position values observed in real
  // synced data — each one traces to a specific extraction bug rather than
  // being a random guess.
  describe("company/position extraction regressions", () => {
    it("does not match 'Re' inside 'Requirements' as a reply prefix (position)", () => {
      // /re:?\s*.../i with no word boundary before "re" matched the "Re" in
      // "Requirements", capturing "quirements of the" up to "position".
      const result = classifyEmailHeuristically(
        email({
          subject: "Your application to Acme",
          fromEmail: "careers@acme.com",
          bodyText:
            "Thank you for applying. Please review the requirements of the position before your interview.",
        })
      );
      expect(result.position ?? "").not.toMatch(/quirements/i);
    });

    it("does not use a regional/generic subdomain label as the company", () => {
      // domain.split(".")[0] on "eu.realcompany.com" grabbed the region
      // prefix "eu" instead of the actual company — the strip-prefix list
      // only covers a handful of known subdomains (mail/careers/jobs/...).
      const result = classifyEmailHeuristically(
        email({
          subject: "Thanks for applying",
          fromEmail: "careers@eu.realcompany.com",
          fromName: "RealCompany Careers",
          bodyText: "Thank you for applying. We have received your application.",
        })
      );
      expect(result.company).not.toBe("Eu");
      expect(result.company?.toLowerCase()).toContain("realcompany");
    });

    it("does not use the ATS platform's own name as the company", () => {
      // A SuccessFactors/SmartRecruiters/Greenhouse-hosted customer domain is
      // correctly skipped for domain-based extraction, but when the sender's
      // display name is literally the platform's own name ("SuccessFactors"),
      // nothing filtered it out before falling back to fromName.
      const result = classifyEmailHeuristically(
        email({
          subject: "Application received",
          fromEmail: "noreply@company.successfactors.com",
          fromName: "SuccessFactors",
          bodyText: "Thank you for your application. We have received it and will follow up soon.",
        })
      );
      expect(result.company?.toLowerCase()).not.toBe("successfactors");
    });

    it("does not use a lowercase system-generated phrase as the company", () => {
      // fromName was a full lowercase sentence fragment rather than a
      // person or company name — real display names are capitalized. Uses
      // an ATS domain so domain-based extraction is skipped and this
      // actually exercises the from-name fallback.
      const result = classifyEmailHeuristically(
        email({
          subject: "Update from the team",
          fromEmail: "notifications@greenhouse.io",
          fromName: "joining our team",
          bodyText: "We wanted to follow up on your application.",
        })
      );
      expect(result.company).not.toBe("joining our team");
    });

    it("does not use a short system-account-shaped from-name as the company", () => {
      // Uses an ATS domain so domain-based extraction is skipped and this
      // actually exercises the from-name fallback.
      const result = classifyEmailHeuristically(
        email({
          subject: "Application confirmation",
          fromEmail: "no-reply@recruitee.com",
          fromName: "Recruitee-email",
          bodyText: "Thank you for applying. We have received your application.",
        })
      );
      expect(result.company).not.toBe("Recruitee-email");
    });
  });
});
