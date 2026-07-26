import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { isAiModeAvailable } from "@/lib/ai-status";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SyncButton } from "@/components/layout/sync-button";
import { AiModeBadge } from "@/components/layout/ai-mode-badge";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/");
  }

  const aiEnabled = await isAiModeAvailable(session.user.id);

  return (
    <div className="flex min-h-screen flex-1">
      <SidebarNav />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div />
          <div className="flex items-center gap-2">
            <AiModeBadge enabled={aiEnabled} />
            <SyncButton />
            <NotificationBell />
            <ThemeToggle />
            <UserMenu name={session.user.name} email={session.user.email} image={session.user.image} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
