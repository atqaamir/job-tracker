import { NextRequest, NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Requests cancellation of a running sync. The sync loop (see runSync in
 * src/lib/sync.ts) polls `cancelRequested` between messages and stops
 * itself — this route just sets the flag, it doesn't stop anything directly.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json().catch(() => ({}));
    const syncLogId = typeof body.syncLogId === "string" ? body.syncLogId : null;
    if (!syncLogId) {
      return NextResponse.json({ error: "syncLogId is required" }, { status: 400 });
    }

    const log = await prisma.syncLog.findFirst({ where: { id: syncLogId, userId } });
    if (!log) {
      return NextResponse.json({ error: "Sync not found" }, { status: 404 });
    }
    if (log.status !== "running") {
      return NextResponse.json({ ok: true, alreadyStopped: true });
    }

    await prisma.syncLog.update({ where: { id: syncLogId }, data: { cancelRequested: true } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to cancel sync", err);
    return NextResponse.json({ error: "Failed to cancel sync" }, { status: 500 });
  }
}
