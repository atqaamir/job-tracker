import "dotenv/config";
import { PrismaClient, ApplicationStatus, EmailCategory } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { SyncSummary } from "../src/lib/sync";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_EMAIL = "demo@example.com";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

interface SeedApplication {
  company: string;
  position: string;
  status: ApplicationStatus;
  daysApplied: number;
  source?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  recruiterName?: string;
  recruiterEmail?: string;
  emailCategory: EmailCategory;
}

const APPLICATIONS: SeedApplication[] = [
  {
    company: "Stripe",
    position: "Senior Backend Engineer",
    status: ApplicationStatus.FINAL_INTERVIEW,
    daysApplied: 45,
    source: "Referral",
    location: "Remote",
    salaryMin: 180000,
    salaryMax: 220000,
    emailCategory: EmailCategory.INTERVIEW_INVITATION,
  },
  {
    company: "Notion",
    position: "Product Engineer",
    status: ApplicationStatus.TECHNICAL_INTERVIEW,
    daysApplied: 30,
    source: "LinkedIn",
    location: "San Francisco, CA",
    emailCategory: EmailCategory.INTERVIEW_INVITATION,
  },
  {
    company: "Vercel",
    position: "Frontend Engineer",
    status: ApplicationStatus.PHONE_SCREEN,
    daysApplied: 20,
    source: "Company site",
    emailCategory: EmailCategory.INTERVIEW_INVITATION,
  },
  {
    company: "Linear",
    position: "Full Stack Engineer",
    status: ApplicationStatus.ASSESSMENT,
    daysApplied: 15,
    source: "LinkedIn",
    emailCategory: EmailCategory.CODING_ASSESSMENT,
  },
  {
    company: "Figma",
    position: "Software Engineer",
    status: ApplicationStatus.RECRUITER_CONTACTED,
    daysApplied: 10,
    source: "Recruiter outreach",
    recruiterName: "Jamie Lee",
    recruiterEmail: "jamie@figma.com",
    emailCategory: EmailCategory.RECRUITER_OUTREACH,
  },
  {
    company: "Airtable",
    position: "Backend Engineer",
    status: ApplicationStatus.APPLIED,
    daysApplied: 5,
    emailCategory: EmailCategory.APPLICATION_CONFIRMATION,
  },
  {
    company: "Datadog",
    position: "Site Reliability Engineer",
    status: ApplicationStatus.VIEWED,
    daysApplied: 8,
    emailCategory: EmailCategory.APPLICATION_CONFIRMATION,
  },
  {
    company: "Anthropic",
    position: "Applied AI Engineer",
    status: ApplicationStatus.OFFER,
    daysApplied: 60,
    salaryMin: 200000,
    salaryMax: 250000,
    emailCategory: EmailCategory.OFFER,
  },
  {
    company: "Snowflake",
    position: "Data Platform Engineer",
    status: ApplicationStatus.ACCEPTED,
    daysApplied: 90,
    emailCategory: EmailCategory.OFFER,
  },
  {
    company: "Brex",
    position: "Software Engineer II",
    status: ApplicationStatus.REJECTED,
    daysApplied: 70,
    emailCategory: EmailCategory.REJECTION,
  },
  {
    company: "Ramp",
    position: "Full Stack Engineer",
    status: ApplicationStatus.REJECTED,
    daysApplied: 50,
    emailCategory: EmailCategory.REJECTION,
  },
  {
    company: "Plaid",
    position: "Backend Engineer",
    status: ApplicationStatus.GHOSTED,
    daysApplied: 100,
    emailCategory: EmailCategory.APPLICATION_CONFIRMATION,
  },
  {
    company: "Retool",
    position: "Frontend Engineer",
    status: ApplicationStatus.WITHDRAWN,
    daysApplied: 40,
    emailCategory: EmailCategory.APPLICATION_CONFIRMATION,
  },
  {
    company: "Scale AI",
    position: "ML Platform Engineer",
    status: ApplicationStatus.APPLIED,
    daysApplied: 3,
    emailCategory: EmailCategory.APPLICATION_CONFIRMATION,
  },
  {
    company: "Rippling",
    position: "Software Engineer",
    status: ApplicationStatus.DRAFT,
    daysApplied: 1,
    emailCategory: EmailCategory.OTHER,
  },
];

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: "Demo User" },
  });

  // Idempotent: clear this demo user's previous sample data before reseeding.
  await prisma.jobApplication.deleteMany({ where: { userId: user.id } });
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.syncLog.deleteMany({ where: { userId: user.id } });

  await prisma.syncSettings.upsert({
    where: { userId: user.id },
    update: { lastSyncAt: daysAgo(0) },
    create: { userId: user.id, lastSyncAt: daysAgo(0) },
  });

  for (const app of APPLICATIONS) {
    const dateApplied = daysAgo(app.daysApplied);
    const application = await prisma.jobApplication.create({
      data: {
        userId: user.id,
        company: app.company,
        position: app.position,
        status: app.status,
        dateApplied,
        dateLastEmail: dateApplied,
        source: app.source ?? "Company site",
        location: app.location ?? null,
        salaryMin: app.salaryMin ?? null,
        salaryMax: app.salaryMax ?? null,
        salaryCurrency: app.salaryMin ? "USD" : null,
        recruiterName: app.recruiterName ?? null,
        recruiterEmail: app.recruiterEmail ?? null,
        aiSummary: `Sample email from ${app.company} regarding the ${app.position} role.`,
      },
    });

    await prisma.emailRecord.create({
      data: {
        applicationId: application.id,
        gmailMessageId: `seed-${application.id}-1`,
        gmailThreadId: `seed-thread-${application.id}`,
        subject: `Your application to ${app.company}`,
        fromName: `${app.company} Careers`,
        fromEmail: `careers@${app.company.toLowerCase().replace(/\s+/g, "")}.com`,
        receivedAt: dateApplied,
        snippet: `Update regarding your application for ${app.position}.`,
        category: app.emailCategory,
        aiSummary: `Sample email from ${app.company} regarding the ${app.position} role.`,
        isProcessed: true,
      },
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        type: "interview",
        title: "Interview invitation: Stripe",
        message: "Stripe invited you to a final interview.",
        isRead: false,
      },
      {
        userId: user.id,
        type: "offer",
        title: "Offer from Anthropic!",
        message: "Anthropic sent you an offer.",
        isRead: false,
      },
    ],
  });

  const summary: SyncSummary = {
    emailsScanned: 24,
    emailsProcessed: 3,
    applicationsNew: 1,
    applicationsUpdated: 2,
    newApplications: [{ id: "seed", company: "Scale AI", position: "ML Platform Engineer" }],
    recruiterResponses: [],
    interviewInvitations: [{ id: "seed", company: "Stripe", position: "Senior Backend Engineer" }],
    codingAssessments: [],
    rejections: [],
    offers: [{ id: "seed", company: "Anthropic", position: "Applied AI Engineer" }],
    staleApplications: [],
    errors: [],
  };

  await prisma.syncLog.create({
    data: {
      userId: user.id,
      startedAt: daysAgo(0),
      completedAt: daysAgo(0),
      status: "completed",
      emailsScanned: summary.emailsScanned,
      emailsProcessed: summary.emailsProcessed,
      applicationsNew: summary.applicationsNew,
      applicationsUpdated: summary.applicationsUpdated,
      summary: JSON.parse(JSON.stringify(summary)),
    },
  });

  console.log(`Seeded demo data for ${DEMO_EMAIL} (${APPLICATIONS.length} applications).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
