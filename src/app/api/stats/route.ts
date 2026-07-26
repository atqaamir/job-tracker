import { NextRequest, NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { getDashboardStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const days = Math.min(730, Math.max(0, Number(searchParams.get("days") ?? "365")));

    const stats = await getDashboardStats(userId, days);
    return NextResponse.json(stats);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to compute stats", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
