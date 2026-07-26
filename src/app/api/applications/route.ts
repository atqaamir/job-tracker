import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { applicationCreateSchema } from "@/lib/validation";
import { dashboardFilterWhere, DASHBOARD_FILTER_VALUES, type DashboardFilterKey } from "@/lib/stats";

export const dynamic = "force-dynamic";

const SORTABLE_FIELDS = new Set([
  "company",
  "position",
  "dateApplied",
  "dateLastEmail",
  "status",
  "createdAt",
]);

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20")));
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");
    const furthestStage = searchParams.get("furthestStage");
    const archived = searchParams.get("archived") === "true";
    const sortBy = SORTABLE_FIELDS.has(searchParams.get("sortBy") ?? "")
      ? (searchParams.get("sortBy") as string)
      : "dateApplied";
    const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const dashboardFilterParam = searchParams.get("dashboardFilter");
    const sinceDaysParam = searchParams.get("sinceDays");

    // dashboardFilter mirrors exactly what the dashboard stat cards count
    // (see dashboardFilterWhere) — clicking "19 Interviews" always lands on
    // exactly those applications, including ones whose current status no
    // longer reflects it (e.g. interviewed, then later rejected).
    const dashboardFilter = DASHBOARD_FILTER_VALUES.includes(dashboardFilterParam as DashboardFilterKey)
      ? (dashboardFilterParam as DashboardFilterKey)
      : null;

    // Shared by the dashboard drill-down (dashboardFilter+sinceDays together)
    // and the Applications page's own standalone time-range filter (just
    // sinceDays, no dashboardFilter) — either way it means "only
    // applications applied within the last N days."
    const since =
      sinceDaysParam && Number.isFinite(Number(sinceDaysParam))
        ? new Date(Date.now() - Number(sinceDaysParam) * 86_400_000)
        : undefined;

    const where: Prisma.JobApplicationWhereInput = dashboardFilter
      ? dashboardFilterWhere(userId, dashboardFilter, since)
      : { userId, isArchived: archived, ...(since ? { dateApplied: { gte: since } } : {}) };

    if (!dashboardFilter && status) {
      where.status = status as Prisma.JobApplicationWhereInput["status"];
    }

    if (!dashboardFilter && furthestStage) {
      where.furthestStage = furthestStage as Prisma.JobApplicationWhereInput["furthestStage"];
    }

    if (search) {
      const searchOr: Prisma.JobApplicationWhereInput = {
        OR: [
          { company: { contains: search, mode: "insensitive" } },
          { position: { contains: search, mode: "insensitive" } },
          { recruiterName: { contains: search, mode: "insensitive" } },
          { location: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
        ],
      };
      // dashboardFilter may already use `where.OR` (interviews/assessments/
      // offers) — combine both via AND instead of overwriting it.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, searchOr];
        delete where.OR;
      } else {
        Object.assign(where, searchOr);
      }
    }

    const [total, applications] = await Promise.all([
      prisma.jobApplication.count({ where }),
      prisma.jobApplication.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          emails: {
            orderBy: { receivedAt: "desc" },
            take: 1,
            select: { gmailLink: true, category: true, receivedAt: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      applications,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to list applications", err);
    return NextResponse.json({ error: "Failed to list applications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const parsed = applicationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const application = await prisma.jobApplication.create({
      data: {
        userId,
        company: data.company,
        position: data.position,
        status: data.status,
        dateApplied: data.dateApplied ?? new Date(),
        recruiterName: data.recruiterName || null,
        recruiterEmail: data.recruiterEmail || null,
        salaryMin: data.salaryMin ?? null,
        salaryMax: data.salaryMax ?? null,
        salaryCurrency: data.salaryCurrency || null,
        location: data.location || null,
        employmentType: data.employmentType ?? null,
        source: data.source || null,
        notes: data.notes || null,
      },
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to create application", err);
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }
}
