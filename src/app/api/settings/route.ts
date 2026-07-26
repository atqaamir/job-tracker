import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/session";
import { syncSettingsUpdateSchema } from "@/lib/validation";
import { encrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const DEFAULT_GMAIL_QUERY =
  "job OR application OR interview OR offer OR rejection OR recruiter OR position OR opportunity";

function omitApiKey<T extends { anthropicApiKey: string | null }>(settings: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring the key out is the point, not using it
  const { anthropicApiKey: _omit, ...rest } = settings;
  return rest;
}

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await prisma.syncSettings.upsert({
      where: { userId },
      update: {},
      create: { userId, gmailQuery: DEFAULT_GMAIL_QUERY },
    });
    const keyConfigured = Boolean(settings.anthropicApiKey) || Boolean(process.env.ANTHROPIC_API_KEY);
    return NextResponse.json({
      settings: omitApiKey(settings),
      aiKeyConfigured: keyConfigured,
      aiModeAvailable: settings.aiEnabled && keyConfigured,
    });
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

    // anthropicApiKey is tri-state: omitted (leave stored key as-is), ""
    // (clear it), or a real value (encrypt and replace it). Never echoed
    // back to the client either way.
    const { anthropicApiKey, ...rest } = parsed.data;
    const keyUpdate: { anthropicApiKey?: string | null } = {};
    if (anthropicApiKey !== undefined) {
      keyUpdate.anthropicApiKey = anthropicApiKey === "" ? null : encrypt(anthropicApiKey);
    }

    const settings = await prisma.syncSettings.upsert({
      where: { userId },
      update: { ...rest, ...keyUpdate },
      create: { userId, ...rest, ...keyUpdate },
    });

    const keyConfigured = Boolean(settings.anthropicApiKey) || Boolean(process.env.ANTHROPIC_API_KEY);
    return NextResponse.json({
      settings: omitApiKey(settings),
      aiKeyConfigured: keyConfigured,
      aiModeAvailable: settings.aiEnabled && keyConfigured,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to update sync settings", err);
    return NextResponse.json({ error: "Failed to update sync settings" }, { status: 500 });
  }
}
