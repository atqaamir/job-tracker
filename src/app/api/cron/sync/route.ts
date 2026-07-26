import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron has no timezone support and fires once daily at a fixed UTC
// time (see vercel.json). 07:00 UTC = 9:00 AM in Europe/Berlin during CEST
// (late Mar-late Oct); during CET (winter) it fires at 8:00 AM local instead
// of 9:00 AM. See the deployment guide for how to adjust this if needed.

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settingsList = await prisma.syncSettings.findMany({
    where: { autoSync: true },
    select: { userId: true },
  });

  const results: { userId: string; ok: boolean; error?: string }[] = [];

  for (const { userId } of settingsList) {
    try {
      await runSync(userId, { createNotifications: true });
      results.push({ userId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Cron sync failed for user ${userId}:`, message);
      results.push({ userId, ok: false, error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    usersProcessed: results.length,
    results,
  });
}
