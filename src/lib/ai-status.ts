import { prisma } from "@/lib/prisma";

/** Whether AI classification would actually run for this user right now — enabled in Settings AND a key configured (per-user or the server's ANTHROPIC_API_KEY). */
export async function isAiModeAvailable(userId: string): Promise<boolean> {
  const settings = await prisma.syncSettings.findUnique({
    where: { userId },
    select: { aiEnabled: true, anthropicApiKey: true },
  });
  if (!settings) return false;
  const keyConfigured = Boolean(settings.anthropicApiKey) || Boolean(process.env.ANTHROPIC_API_KEY);
  return settings.aiEnabled && keyConfigured;
}
