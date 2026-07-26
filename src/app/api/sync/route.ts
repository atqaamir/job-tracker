import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { runSync } from "@/lib/sync";
import { prisma } from "@/lib/prisma";
import { clearFetchedData } from "@/lib/clear-fetched-data";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json().catch(() => ({}));
    // Clamp to a sane range: 0 (never) through ~50 years (effectively "the
    // entire range" for any realistic sync window) so a bad client value
    // can't accidentally request AI for an absurd span.
    const aiRecentDays =
      typeof body.aiRecentDays === "number" && Number.isFinite(body.aiRecentDays)
        ? Math.min(18_250, Math.max(0, Math.floor(body.aiRecentDays)))
        : 14;
    const fullBackfill = typeof body.fullBackfill === "boolean" ? body.fullBackfill : false;

    if (fullBackfill) {
      await clearFetchedData(userId);
    }

    const syncLog = await prisma.syncLog.create({ data: { userId, status: "running" } });

    // Scheduled to run after this response is sent — detached from this
    // request/response and from whether the browser tab stays open, so
    // closing or switching tabs never interrupts an in-progress sync. The
    // client polls GET /api/sync/status?id=... for live progress.
    // runSync already records failures onto the SyncLog row itself (status
    // "failed" + error message) before re-throwing, so this catch only
    // needs to stop that rethrow from becoming an unhandled rejection.
    after(async () => {
      try {
        await runSync(userId, { aiRecentDays, fullBackfill, syncLogId: syncLog.id });
      } catch (err) {
        console.error("Background sync failed", err);
      }
    });

    return NextResponse.json({ ok: true, syncLogId: syncLog.id });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to start sync", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start sync" },
      { status: 500 }
    );
  }
}
