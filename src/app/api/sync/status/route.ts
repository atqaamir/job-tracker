import { NextRequest, NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Polling endpoint for a sync kicked off via POST /api/sync, which returns
 * immediately and continues the actual work in the background (see
 * `after()` in that route). Pass `?id=<syncLogId>` for a specific run, or
 * omit it to check whether the user has any sync still `running` right now
 * — used on page load / tab focus to resume showing a progress bar for a
 * sync that was started before the tab was closed or switched away from.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    const log = id
      ? await prisma.syncLog.findFirst({ where: { id, userId } })
      : await prisma.syncLog.findFirst({ where: { userId, status: "running" }, orderBy: { startedAt: "desc" } });

    if (!log) {
      return NextResponse.json({ log: null });
    }

    return NextResponse.json({
      log: {
        id: log.id,
        status: log.status,
        emailsScanned: log.emailsScanned,
        emailsProcessed: log.emailsProcessed,
        applicationsNew: log.applicationsNew,
        applicationsUpdated: log.applicationsUpdated,
        error: log.error,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to check sync status", err);
    return NextResponse.json({ error: "Failed to check sync status" }, { status: 500 });
  }
}
