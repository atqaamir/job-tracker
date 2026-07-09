import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { syncSettingsUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const DEFAULT_GMAIL_QUERY =
  "job OR application OR interview OR offer OR rejection OR recruiter OR position OR opportunity";

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await prisma.syncSettings.upsert({
      where: { userId },
      update: {},
      create: { userId, gmailQuery: DEFAULT_GMAIL_QUERY },
    });
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to load sync settings", err);
    return NextResponse.json({ error: "Failed to load sync settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const parsed = syncSettingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const existing = await prisma.syncSettings.findUnique({ where: { userId } });

    // Changing the lookback window or search query only matters if the next
    // sync actually re-scans that range — otherwise it would silently
    // continue from the last sync's cursor and the new setting would have
    // no visible effect. Resetting lastSyncAt makes the next sync treat this
    // like a fresh backfill using the new window (already-processed emails
    // are still skipped via their stored Gmail message ID, so this is safe,
    // just does a wider Gmail search).
    const windowChanged =
      existing &&
      (existing.daysToLookBack !== parsed.data.daysToLookBack || existing.gmailQuery !== parsed.data.gmailQuery);

    const settings = await prisma.syncSettings.upsert({
      where: { userId },
      update: { ...parsed.data, ...(windowChanged ? { lastSyncAt: null } : {}) },
      create: { userId, ...parsed.data },
    });

    return NextResponse.json({ settings, willRescanOnNextSync: Boolean(windowChanged) });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to update sync settings", err);
    return NextResponse.json({ error: "Failed to update sync settings" }, { status: 500 });
  }
}
