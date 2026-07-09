import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";

export const dynamic = "force-dynamic";

const mergeSchema = z.object({
  primaryId: z.string().min(1),
  duplicateIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const parsed = mergeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { primaryId, duplicateIds } = parsed.data;

    const ids = [primaryId, ...duplicateIds];
    const applications = await prisma.jobApplication.findMany({
      where: { id: { in: ids }, userId },
    });
    if (applications.length !== ids.length) {
      return NextResponse.json({ error: "One or more applications not found" }, { status: 404 });
    }

    const primary = applications.find((a) => a.id === primaryId)!;
    const duplicates = applications.filter((a) => a.id !== primaryId);

    const fillFields: (keyof typeof primary)[] = [
      "recruiterName",
      "recruiterEmail",
      "salaryMin",
      "salaryMax",
      "salaryCurrency",
      "location",
      "employmentType",
      "source",
      "notes",
    ];
    const patch: Record<string, unknown> = {};
    for (const field of fillFields) {
      if (!primary[field]) {
        const donor = duplicates.find((d) => d[field]);
        if (donor) patch[field] = donor[field];
      }
    }

    const mostRecentEmail = duplicates.reduce<Date | null>((latest, d) => {
      if (d.dateLastEmail && (!latest || d.dateLastEmail > latest)) return d.dateLastEmail;
      return latest;
    }, primary.dateLastEmail);
    if (mostRecentEmail) patch.dateLastEmail = mostRecentEmail;

    const earliestApplied = duplicates.reduce<Date | null>((earliest, d) => {
      if (d.dateApplied && (!earliest || d.dateApplied < earliest)) return d.dateApplied;
      return earliest;
    }, primary.dateApplied);
    if (earliestApplied) patch.dateApplied = earliestApplied;

    await prisma.$transaction([
      prisma.emailRecord.updateMany({
        where: { applicationId: { in: duplicates.map((d) => d.id) } },
        data: { applicationId: primaryId },
      }),
      prisma.jobApplication.update({ where: { id: primaryId }, data: patch }),
      prisma.jobApplication.deleteMany({ where: { id: { in: duplicates.map((d) => d.id) } } }),
    ]);

    const merged = await prisma.jobApplication.findUnique({
      where: { id: primaryId },
      include: { emails: { orderBy: { receivedAt: "desc" } } },
    });

    return NextResponse.json({ application: merged });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to merge applications", err);
    return NextResponse.json({ error: "Failed to merge applications" }, { status: 500 });
  }
}
