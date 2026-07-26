import { prisma } from "@/lib/prisma";

/**
 * Deletes every fetched application (and its emails, via cascade) plus
 * notifications and sync history for a user. Does not touch the account,
 * Gmail connection, or sync preferences (daysToLookBack / gmailQuery /
 * autoSync / AI settings). Shared by the "Delete All Fetched Data" Settings
 * action and "Fetch All Again", which wipes before it re-fetches.
 */
export async function clearFetchedData(userId: string): Promise<{ deletedApplications: number }> {
  const [{ count: deletedApplications }] = await prisma.$transaction([
    prisma.jobApplication.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.syncLog.deleteMany({ where: { userId } }),
    prisma.syncSettings.update({ where: { userId }, data: { lastSyncAt: null } }),
  ]);
  return { deletedApplications };
}
