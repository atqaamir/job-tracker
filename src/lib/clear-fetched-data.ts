import { prisma } from "@/lib/prisma";

/** Whether this user has a sync currently in progress (see runSync's syncLog). */
export async function hasRunningSync(userId: string): Promise<boolean> {
  const running = await prisma.syncLog.findFirst({ where: { userId, status: "running" }, select: { id: true } });
  return running !== null;
}

/**
 * Deletes every fetched application (and its emails, via cascade) plus
 * notifications and sync history for a user. Does not touch the account,
 * Gmail connection, or sync preferences (daysToLookBack / gmailQuery /
 * autoSync / AI settings). Shared by the "Delete All Fetched Data" Settings
 * action and "Fetch All Again", which wipes before it re-fetches.
 *
 * Callers should check `hasRunningSync` first and refuse to run this while
 * one is in progress — a currently-running sync keeps calling
 * `syncLog.update()` on its own row throughout its execution, and deleting
 * that row out from under it crashes the sync with a Prisma P2025 ("record
 * to update not found") the next time it tries.
 */
export async function clearFetchedData(userId: string): Promise<{ deletedApplications: number }> {
  const [{ count: deletedApplications }] = await prisma.$transaction([
    prisma.jobApplication.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.syncLog.deleteMany({ where: { userId, status: { not: "running" } } }),
    prisma.syncSettings.update({ where: { userId }, data: { lastSyncAt: null } }),
  ]);
  return { deletedApplications };
}
