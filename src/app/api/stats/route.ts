import { NextRequest, NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { getDashboardStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const months = Math.min(60, Math.max(1, Number(searchParams.get("months") ?? "12")));

    const stats = await getDashboardStats(userId, months);
    return NextResponse.json(stats);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to compute stats", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
