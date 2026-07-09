import { NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const applications = await prisma.jobApplication.findMany({
      where: { userId },
      orderBy: { dateApplied: "desc" },
      include: { emails: { orderBy: { receivedAt: "desc" }, take: 1 } },
    });

    const rows = applications.map((a) => ({
      Company: a.company,
      Position: a.position,
      Status: a.status,
      DateApplied: a.dateApplied?.toISOString().slice(0, 10) ?? "",
      DateLastEmail: a.dateLastEmail?.toISOString().slice(0, 10) ?? "",
      RecruiterName: a.recruiterName ?? "",
      RecruiterEmail: a.recruiterEmail ?? "",
      SalaryMin: a.salaryMin ?? "",
      SalaryMax: a.salaryMax ?? "",
      SalaryCurrency: a.salaryCurrency ?? "",
      Location: a.location ?? "",
      EmploymentType: a.employmentType ?? "",
      Source: a.source ?? "",
      Notes: a.notes ?? "",
      GmailLink: a.emails[0]?.gmailLink ?? "",
      Archived: a.isArchived ? "yes" : "no",
    }));

    const csv = Papa.unparse(rows);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="job-applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to export applications", err);
    return NextResponse.json({ error: "Failed to export applications" }, { status: 500 });
  }
}
