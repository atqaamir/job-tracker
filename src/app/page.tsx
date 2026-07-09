import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Briefcase, Mail, BarChart3, Bell } from "lucide-react";

export default async function Home() {
  const session = await getCurrentSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="grid w-full max-w-4xl gap-12 md:grid-cols-2 md:items-center">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Briefcase className="h-6 w-6" />
            <span className="text-lg font-semibold">Job Tracker</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Your job search, tracked automatically.
          </h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400">
            Connect Gmail and Job Tracker detects every application confirmation, recruiter reply, interview
            invitation, and rejection — no manual entry.
          </p>
          <ul className="flex flex-col gap-3 text-sm text-zinc-600 dark:text-zinc-300">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-zinc-400" /> Scans Gmail securely, read-only access
            </li>
            <li className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 shrink-0 text-zinc-400" /> Applied / interviewed / rejected, over the
              last year
            </li>
            <li className="flex items-center gap-2">
              <Bell className="h-4 w-4 shrink-0 text-zinc-400" /> Notifies you on interviews, offers, and replies
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Get started</h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            Sign in with the Google account you use for job applications.
          </p>
          <SignInButton />
          <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
            We only ever read your Gmail — we never send, modify, or delete anything, and your password is never
            shared with us.
          </p>
        </div>
      </div>
    </div>
  );
}
