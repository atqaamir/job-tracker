import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { APPLICATION_STATUS_VALUES, EMPLOYMENT_TYPE_VALUES } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface CsvRow {
  Company?: string;
  Position?: string;
  Status?: string;
  DateApplied?: string;
  RecruiterName?: string;
  RecruiterEmail?: string;
  SalaryMin?: string;
  SalaryMax?: string;
  SalaryCurrency?: string;
  Location?: string;
  EmploymentType?: string;
  Source?: string;
  Notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Missing CSV file" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of parsed.data.entries()) {
      const company = row.Company?.trim();
      const position = row.Position?.trim();
      if (!company || !position) {
        skipped++;
        errors.push(`Row ${index + 2}: missing Company or Position`);
        continue;
      }

      const statusRaw = row.Status?.trim().toUpperCase();
      const status = (APPLICATION_STATUS_VALUES as readonly string[]).includes(statusRaw ?? "")
        ? (statusRaw as (typeof APPLICATION_STATUS_VALUES)[number])
        : "APPLIED";

      const employmentTypeRaw = row.EmploymentType?.trim().toUpperCase();
      const employmentType = (EMPLOYMENT_TYPE_VALUES as readonly string[]).includes(employmentTypeRaw ?? "")
        ? (employmentTypeRaw as (typeof EMPLOYMENT_TYPE_VALUES)[number])
        : null;

      const dateApplied = row.DateApplied ? new Date(row.DateApplied) : new Date();

      await prisma.jobApplication.create({
        data: {
          userId,
          company,
          position,
          status,
          dateApplied: isNaN(dateApplied.getTime()) ? new Date() : dateApplied,
          recruiterName: row.RecruiterName?.trim() || null,
          recruiterEmail: row.RecruiterEmail?.trim() || null,
          salaryMin: row.SalaryMin ? Number(row.SalaryMin) || null : null,
          salaryMax: row.SalaryMax ? Number(row.SalaryMax) || null : null,
          salaryCurrency: row.SalaryCurrency?.trim() || null,
          location: row.Location?.trim() || null,
          employmentType,
          source: row.Source?.trim() || "CSV Import",
          notes: row.Notes?.trim() || null,
        },
      });
      imported++;
    }

    return NextResponse.json({ imported, skipped, errors });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to import applications", err);
    return NextResponse.json({ error: "Failed to import applications" }, { status: 500 });
  }
}
