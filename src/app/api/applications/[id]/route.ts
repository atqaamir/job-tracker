import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { applicationUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const application = await prisma.jobApplication.findFirst({
      where: { id, userId },
      include: { emails: { orderBy: { receivedAt: "desc" } } },
    });

    if (!application) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ application });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch application", err);
    return NextResponse.json({ error: "Failed to fetch application" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await prisma.jobApplication.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = applicationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const application = await prisma.jobApplication.update({
      where: { id },
      data: {
        ...(data.company !== undefined && { company: data.company }),
        ...(data.position !== undefined && { position: data.position }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.dateApplied !== undefined && { dateApplied: data.dateApplied }),
        ...(data.recruiterName !== undefined && { recruiterName: data.recruiterName || null }),
        ...(data.recruiterEmail !== undefined && { recruiterEmail: data.recruiterEmail || null }),
        ...(data.salaryMin !== undefined && { salaryMin: data.salaryMin }),
        ...(data.salaryMax !== undefined && { salaryMax: data.salaryMax }),
        ...(data.salaryCurrency !== undefined && { salaryCurrency: data.salaryCurrency || null }),
        ...(data.location !== undefined && { location: data.location || null }),
        ...(data.employmentType !== undefined && { employmentType: data.employmentType }),
        ...(data.source !== undefined && { source: data.source || null }),
        ...(data.notes !== undefined && { notes: data.notes || null }),
        ...(data.isArchived !== undefined && { isArchived: data.isArchived }),
      },
    });

    return NextResponse.json({ application });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to update application", err);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const existing = await prisma.jobApplication.findFirst({ where: { id, userId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.jobApplication.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to delete application", err);
    return NextResponse.json({ error: "Failed to delete application" }, { status: 500 });
  }
}
