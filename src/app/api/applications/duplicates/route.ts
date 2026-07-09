import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const applications = await prisma.jobApplication.findMany({
      where: { userId, isArchived: false },
      orderBy: { dateApplied: "desc" },
    });

    const groups = new Map<string, typeof applications>();
    for (const app of applications) {
      const key = `${app.company.trim().toLowerCase()}::${app.position.trim().toLowerCase()}`;
      const existing = groups.get(key);
      if (existing) {
        existing.push(app);
      } else {
        groups.set(key, [app]);
      }
    }

    const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);

    return NextResponse.json({ duplicateGroups });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to find duplicates", err);
    return NextResponse.json({ error: "Failed to find duplicates" }, { status: 500 });
  }
}
