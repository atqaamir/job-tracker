import { NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { clearFetchedData } from "@/lib/clear-fetched-data";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const userId = await requireUserId();
    const { deletedApplications } = await clearFetchedData(userId);
    return NextResponse.json({ ok: true, deletedApplications });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to clear fetched data", err);
    return NextResponse.json({ error: "Failed to clear fetched data" }, { status: 500 });
  }
}
