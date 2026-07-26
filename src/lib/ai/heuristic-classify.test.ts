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

    it("does not classify a plain application confirmation as an interview follow-up", () => {
      // Real observed bug: INTERVIEW_FOLLOWUP's pattern matched a bare "next
      // steps", which shows up in almost every application-confirmation
      // email ("we'll let you know about next steps") — and since
      // INTERVIEW_FOLLOWUP is checked before APPLICATION_CONFIRMATION, it
      // won the match even though nothing about this email is interview
      // related yet.
      const result = classifyEmailHeuristically(
        email({
          subject: "Thank you for your application at Rewire",
          fromEmail: "e+11kdl67t6t51ope5.rewire@recruitee-email.com",
          fromName: "Rewire/Data Scientist (m/w/d)",
          bodyText:
            "Thank you for applying for the Data Scientist (m/w/d) position at Rewire. We've received your application and will review it carefully. We'll be in touch soon to let you know about the next steps in the process.",
        })
      );
      expect(result.category).toBe("APPLICATION_CONFIRMATION");
    });

    it("does not classify a LinkedIn 'application sent' notification as an interview follow-up", () => {
      // Same root cause as the Rewire case above: LinkedIn's own "your
      // application was sent" email says "take these next steps for more
      // success" (a call to browse similar job listings), which also hit
      // the old bare "next steps" match.
      const result = classifyEmailHeuristically(
        email({
          subject: "Atqa, your application was sent to Oliver Bernard",
          fromEmail: "jobs-noreply@linkedin.com",
          fromName: "LinkedIn",
          bodyText:
            "Your application was sent to Oliver Bernard. Data Scientist, Oliver Bernard, Berlin, Germany (Hybrid). Applied on July 10, 2026. Now, take these next steps for more success. View similar jobs you may be interested in.",
        })
      );
      expect(result.category).not.toBe("INTERVIEW_FOLLOWUP");
    });

    it("does not classify a product-update newsletter's incidental 'job offer' phrasing as an offer", () => {
      // Real observed bug: a bare "job offer" match fired on generic
      // marketing copy ("getting you to a job offer faster") in a bulk
      // product-changelog email, not an actual offer to the user.
      const result = classifyEmailHeuristically(
        email({
          subject: "Here's what's new since June",
          fromEmail: "hello@mail.aiapply.co",
          fromName: "Product @ AIApply",
          bodyText:
            "Big month of June at AIApply, with over 2,300 users landing a job! We want to update you regularly on what the team has been building, because every single thing below exists for one reason: getting you to a job offer faster. " +
            "You are receiving this email because you opted in to receive updates from AiApply. Unsubscribe",
        })
      );
      expect(result.category).toBe("OTHER");
      expect(result.isJobRelated).toBe(false);
    });

    it("does not treat a job-recommendation digest as job-application-related", () => {
      // Job-alert/recommendation emails ("5 new jobs matching your search")
      // describe listings the user hasn't applied to yet — they're
      // discovery content from a job board, not an update on an actual
      // application, and shouldn't create or touch any application record.
      const result = classifyEmailHeuristically(
        email({
          subject: "5 new jobs matching your search: Data Scientist",
          fromEmail: "jobalerts-noreply@linkedin.com",
          fromName: "LinkedIn Job Alerts",
          bodyText:
            "New jobs matching your search are here. Check out these jobs you may be interested in based on your profile and search history.",
        })
      );
      expect(result.category).toBe("OTHER");
      expect(result.isJobRelated).toBe(false);
    });

    it("does not classify an interview-process overview as an actual interview invitation", () => {
      // Real observed bug: a post-application "here's what our process
      // looks like" email names future, hypothetical stages generically
      // ("Interview with Talent Acquisition") — the bare phrase "Interview
      // with" trips INTERVIEW_INVITATION's pattern even though nothing has
      // actually been scheduled yet.
      const result = classifyEmailHeuristically(
        email({
          subject: "Your application for Senior Software Engineer / AI Enabler (m/f/d) at AutoScout24",
          fromEmail: "no-reply@us.greenhouse-mail.io",
          fromName: "AutoScout24",
          bodyText:
            "Thank you for your interest in AutoScout24! We appreciate the time you took to apply to this role, and look forward to reviewing your application. " +
            "Below you may find all stages of your interviewing process after we review your application and what to expect in which one: " +
            "30-minute Initial Interview with Talent Acquisition. This session will be a brief review of your background. " +
            "45-minute Values Discussion. Tech Deep Dive Interviews.",
        })
      );
      expect(result.category).not.toBe("INTERVIEW_INVITATION");
    });

    it("extracts the position from 'interest in the X position' phrasing", () => {
      // None of the other POSITION_PATTERNS covered this common ATS
      // confirmation phrasing — they all require "application for X" or
      // "position of X", not "interest in X position".
      const result = classifyEmailHeuristically(
        email({
          subject: "Your application to Acme",
          fromEmail: "careers@acme.com",
          bodyText: "Thank you so much for your interest in the Data Engineer (m/f/d) position. We have received your application.",
        })
      );
      expect(result.position).toBe("Data Engineer (m/f/d)");
    });

    it("classifies a confirmation with the job title between 'application' and 'received' correctly", () => {
      // Real observed bug: "application (?:has been )?received" requires the
      // two words adjacent, but NVIDIA's confirmation puts the role name in
      // between — the match failed entirely, and the email fell through to
      // RECRUITER_OUTREACH because it also mentions "open position" later.
      const result = classifyEmailHeuristically(
        email({
          subject: "Application Received",
          fromEmail: "no-reply@nvidia.com",
          fromName: "NVIDIA Recruiting",
          bodyText:
            "We want to confirm that your application for the JR2019145 Senior Software Engineer, Applied AI role has been received. " +
            "We will review your application against the open position, and contact you to arrange an interview if the role is a good match for your qualifications. " +
            "Thanks again for your interest in NVIDIA.",
        })
      );
      expect(result.category).toBe("APPLICATION_CONFIRMATION");
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
