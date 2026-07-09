# Job Tracker

A personal CRM for your job search. Job Tracker connects to your Gmail account,
automatically detects application confirmations, recruiter replies, interview
invitations, assessments, offers, and rejections, and turns them into a single
dashboard — no manual data entry.

## Features

- **Gmail integration** — read-only OAuth access, scans for job-related email, syncs every 9:00 AM automatically (and on demand).
- **AI classification** — Claude reads each matched email, classifies it, extracts company/position/recruiter/salary/location/deadline, and writes a plain-English summary.
- **Automatic application tracking** — emails are merged into application records by Gmail thread and by company/position, so a single application accumulates its full email history.
- **Dashboard** — applications, interviews, assessments, offers, rejections, response rate, interview rate, average response time, and applications-over-time — filterable by the last 3/6/12/24 months.
- **Applications table** — search, filter by status, sort, paginate, inline edit, archive, delete, duplicate detection/merge, CSV export/import.
- **Notifications** — in-app alerts for interview invitations, recruiter replies, offers, and rejections.
- **Daily digest** — the 9:00 AM sync produces a summary (new applications, replies, stale follow-ups, errors) shown on the dashboard.
- **Dark mode / light mode**, responsive layout.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase PostgreSQL |
| ORM | Prisma 7 (with `@prisma/adapter-pg`) |
| Auth | NextAuth.js (Google OAuth) |
| Email | Gmail API (`googleapis`, read-only scope) |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) |
| Charts | Recharts |
| Validation | Zod |
| Forms | react-hook-form |
| Scheduling | Vercel Cron |

## Local Development

### Prerequisites

- Node.js 20.9+ and npm
- A Supabase project (free tier is fine) — see [DEPLOYMENT.md](./DEPLOYMENT.md) if you don't have one yet
- A Google Cloud OAuth client with the Gmail API enabled
- An Anthropic API key

### Setup

```bash
npm install
cp .env.example .env
# fill in .env with real values (see DEPLOYMENT.md for where to get each one)

npx prisma generate
npx prisma migrate deploy   # or `npx prisma db push` for a quick first setup

npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and
click **Sync Now** to pull in your first batch of job-related emails.

### Scripts

```bash
npm run dev          # start the dev server (Turbopack)
npm run build         # production build
npm run start          # run the production build
npm run lint            # ESLint
npm run test              # run the test suite once
npm run test:watch         # run tests in watch mode
npx prisma studio            # browse the database
npx prisma migrate dev        # create a new migration
```

## Project Structure

```
prisma/schema.prisma          Database schema (Prisma 7, driver adapters)
src/lib/gmail.ts               Gmail API client (list/fetch/parse messages, token refresh)
src/lib/ai/classify.ts          Claude-based email classification & extraction
src/lib/sync.ts                  Core sync engine: Gmail -> classify -> merge into applications
src/lib/stats.ts                   Dashboard aggregate stats
src/app/api/                        Route handlers (applications, stats, notifications, sync, cron)
src/app/dashboard/                    Dashboard + applications table pages
src/components/                        UI components
```

## How the Gmail Sync Works

1. `runSync(userId)` (`src/lib/sync.ts`) reads the user's `SyncSettings` (search query, lookback window, last sync time).
2. It lists Gmail message IDs matching the query since the last sync, skipping any message already stored as an `EmailRecord`.
3. Each new message is fetched, parsed, and sent to Claude for classification (category, company, position, status, recruiter, salary, location, deadline, summary, sentiment).
4. Non-job-related emails are discarded. Job-related emails are matched to an existing `JobApplication` by Gmail thread first, then by normalized company + position, or a new application is created.
5. Notifications are created for interview invitations, assessments, offers, rejections, and recruiter replies.
6. A `SyncLog` row records the run (counts, errors, and the full summary as JSON), which the dashboard displays as the "last sync" card.

This same function powers both the **Sync Now** button (`POST /api/sync`) and
the daily cron (`GET /api/cron/sync`), so it's safe to trigger manually at any
time — it only processes emails it hasn't seen before.

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for a complete, beginner-friendly,
click-by-click guide to deploying on Vercel + Supabase, including Google OAuth
and Gmail API setup.

See **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** before going live.
