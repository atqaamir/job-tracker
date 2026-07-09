import { NextResponse } from "next/server";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { runSync } from "@/lib/sync";
import { GmailAuthError } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const userId = await requireUserId();
    const summary = await runSync(userId);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof GmailAuthError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Sync failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
