# Job Tracker

A personal CRM for your job search. Job Tracker connects to your Gmail account,
automatically detects application confirmations, recruiter replies, interview
invitations, assessments, offers, and rejections, and turns them into a single
dashboard — no manual data entry.

**This app is free to run.** Gmail sync, email classification, the dashboard,
and the daily digest all work with zero API cost using a built-in offline
classifier. Adding an Anthropic API key is optional and upgrades
classification accuracy (real summarization, better extraction) for a small
usage-based fee. See [Free vs. AI-powered classification](#free-vs-ai-powered-classification).

## Features

- **Gmail integration** — read-only OAuth access, scans for job-related email, syncs every 9:00 AM automatically (and on demand).
- **Free by default, AI-upgradable classification** — a built-in rule-based classifier (no API key, no cost) detects category, company, position, salary, location, and more. Set `ANTHROPIC_API_KEY` to switch to Claude for higher accuracy and real summarization — no code changes needed.
- **Automatic application tracking** — emails are merged into application records by Gmail thread and by company/position, so a single application accumulates its full email history.
- **Dashboard** — applications, interviews, assessments, offers, rejections, response rate, interview rate, average response time, and applications-over-time — filterable by the last 3/6/12/24 months.
- **Applications table** — search, filter by status, sort, paginate, inline edit, archive, delete, duplicate detection/merge, CSV export/import.
- **Notifications** — in-app alerts for interview invitations, recruiter replies, offers, and rejections.
- **Daily digest** — the 9:00 AM sync produces a summary (new applications, replies, stale follow-ups, errors) shown on the dashboard.
- **Configurable sync window** — set how many days back to search (Settings page), edit the raw Gmail search query, or turn off the daily auto-sync.
- **Encrypted token storage** — Gmail OAuth tokens are encrypted (AES-256-GCM) before being written to the database.
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
| AI | Anthropic Claude (`@anthropic-ai/sdk`) — optional; free rule-based fallback included |
| Charts | Recharts |
| Validation | Zod |
| Forms | react-hook-form |
| Scheduling | Vercel Cron |

## Local Development

### Prerequisites

- Node.js 20.9+ and npm
- A Supabase project (free tier is fine) — see [DEPLOYMENT.md](./DEPLOYMENT.md) if you don't have one yet
- A Google Cloud OAuth client with the Gmail API enabled
- *(Optional)* An Anthropic API key, if you want Claude-powered classification instead of the free built-in classifier

### Setup

```bash
npm install
cp .env.example .env
# fill in .env with real values, including a generated TOKEN_ENCRYPTION_KEY
# (see DEPLOYMENT.md for exactly where to get each value)

npx prisma generate
npx prisma migrate deploy   # applies the migrations already in prisma/migrations/

npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, and
click **Sync Now** to pull in your first batch of job-related emails. Want to
try the UI with fake data first instead? Run `npm run db:seed`.

For a step-by-step walkthrough of testing this against your **real Gmail
account locally**, before deploying anywhere, see
[Testing locally against your real Gmail](#testing-locally-against-your-real-gmail) below.

### Scripts

```bash
npm run dev          # start the dev server (Turbopack)
npm run build         # production build
npm run start          # run the production build
npm run lint            # ESLint
npm run test              # run the test suite once
npm run test:watch         # run tests in watch mode
npm run db:seed             # load sample applications for a demo user
npx prisma studio            # browse the database
npx prisma migrate dev        # create a new migration after changing schema.prisma
```

## Project Structure

```
prisma/schema.prisma          Database schema (Prisma 7, driver adapters)
prisma/migrations/             Versioned SQL migrations
prisma/seed.ts                  Sample-data seed script (npm run db:seed)
src/lib/gmail.ts                 Gmail API client (list/fetch/parse messages, token refresh)
src/lib/ai/classify.ts            Dispatches to Claude (if configured) or the free classifier
src/lib/ai/heuristic-classify.ts   Free, offline, rule-based email classifier (no API key needed)
src/lib/sync.ts                     Core sync engine: Gmail -> classify -> merge into applications
src/lib/stats.ts                     Dashboard aggregate stats
src/lib/crypto.ts                     AES-256-GCM helpers for encrypting stored OAuth tokens
src/lib/prisma.ts                      Prisma client + the token-encryption extension
src/app/api/                            Route handlers (applications, settings, stats, notifications, sync, cron)
src/app/dashboard/                       Dashboard, applications table, and settings pages
src/components/                           UI components
```

## How the Gmail Sync Works

1. `runSync(userId)` (`src/lib/sync.ts`) reads the user's `SyncSettings` (search query, lookback window, last sync time).
2. It lists Gmail message IDs matching the query since the last sync, skipping any message already stored as an `EmailRecord`.
3. Each new message is fetched, parsed, and classified (category, company, position, status, recruiter, salary, location, deadline, summary, sentiment) — by Claude if `ANTHROPIC_API_KEY` is set, otherwise by the free built-in classifier. See below.
4. Non-job-related emails are discarded. Job-related emails are matched to an existing `JobApplication` by Gmail thread first, then by normalized company + position, or a new application is created.
5. Notifications are created for interview invitations, assessments, offers, rejections, and recruiter replies.
6. A `SyncLog` row records the run (counts, errors, and the full summary as JSON), which the dashboard displays as the "last sync" card.

This same function powers both the **Sync Now** button (`POST /api/sync`) and
the daily cron (`GET /api/cron/sync`), so it's safe to trigger manually at any
time — it only processes emails it hasn't seen before.

Want more control over the lookback window or the Gmail search query? Go to
**Settings** in the app — see [API.md](./API.md#settings) for the underlying
endpoint if you're scripting it.

See **[API.md](./API.md)** for the full endpoint reference.

## Free vs. AI-powered classification

Job Tracker works in two modes, chosen automatically based on whether
`ANTHROPIC_API_KEY` is set — no config flag, no code change:

| | Free mode (default) | AI mode (`ANTHROPIC_API_KEY` set) |
|---|---|---|
| Cost | $0 | Usage-based, typically cents-to-a-few-dollars/month for personal volume |
| How it works | Keyword/regex rules in `src/lib/ai/heuristic-classify.ts` — no network call | Claude reads the full email and reasons about it |
| Category detection | Good — pattern-matches common phrasing (rejection, interview invite, assessment, offer, etc.) | Better — understands phrasing the rules don't cover |
| Company / position | Guessed from sender domain and subject line patterns | Extracted from the email's actual content |
| Summary | First ~200 characters of the email body | A real one-to-two sentence summary |
| Salary / deadline extraction | Basic regex (`$120,000 - $140,000` style ranges, `by <date>` phrasing) | More robust, understands more phrasings |

Both modes write to the exact same database fields, so you can switch at any
time by adding or removing `ANTHROPIC_API_KEY` and redeploying — nothing
about existing data changes, and future syncs just start using the new mode.

If you want the free mode, just don't set `ANTHROPIC_API_KEY` at all (see
`.env.example`) and skip step 4 in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Testing locally against your real Gmail

You can fully exercise the app — real sign-in, real Gmail scanning, real
application detection — on `localhost` before deploying anywhere. You still
need a real Postgres database and real Google OAuth credentials (Google
doesn't allow testing OAuth against a fake project), but everything else can
run on your machine.

1. **Database**: do steps 2.1-2.5 in [DEPLOYMENT.md](./DEPLOYMENT.md) to
   create a free Supabase project and grab its connection string — you'll
   point your local `.env` at the same database you'd use in production (or
   spin up a second free Supabase project just for testing, if you'd rather
   keep test data separate).
2. **Google OAuth**: do step 3 in DEPLOYMENT.md. You only need the
   `http://localhost:3000/api/auth/callback/google` redirect URI for this —
   skip adding a production one until you actually deploy. Make sure to add
   your own Google account under **Test users** on the OAuth consent screen.
3. **Anthropic (optional)**: skip it entirely for your first local test —
   the free classifier is enough to confirm the whole pipeline works.
4. Fill in `.env`:
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL` (from step 1), `NEXTAUTH_URL="http://localhost:3000"`,
   `NEXTAUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` (each `openssl rand -base64
   32`), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (from step 2). Leave
   `ANTHROPIC_API_KEY` unset and `CRON_SECRET` can be any placeholder for
   local testing (the cron route isn't reachable from `localhost` anyway —
   Vercel is what calls it in production).
5. Push the schema and start the app:
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   npm run dev
   ```
6. Open `http://localhost:3000`, click **Sign in with Google**, and
   authorize with the same account you added as a test user in step 2. You
   should land on `/dashboard`.
7. Before your first real sync, consider narrowing the window in
   **Settings** (e.g. 30 days instead of the 365-day default) so your first
   test run is fast and only pulls in recent mail — you can widen it later
   and the next sync will pick up the older range too.
8. Click **Sync Now**. Watch the terminal running `npm run dev` for any
   errors. When it finishes, check the **Applications** tab — you should see
   real entries pulled from your inbox. Open one and confirm the "Latest
   Response" / Gmail link / recruiter fields look right for a couple of
   emails you know the content of.
9. If something looks off (wrong company name, miscategorized email), that's
   most useful to know about *before* turning on the daily cron — free-mode
   classification is heuristic and won't be perfect on every email. Compare
   against the [Free vs. AI-powered classification](#free-vs-ai-powered-classification)
   table to decide if you want to add an Anthropic key.

Once you're happy with the results, follow [DEPLOYMENT.md](./DEPLOYMENT.md)
to put it on Vercel — you'll reuse the same Google OAuth client (just adding
the production redirect URI) and the same Supabase database if you want your
local testing data to carry over.

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for a complete, beginner-friendly,
click-by-click guide to deploying on Vercel + Supabase, including Google OAuth
and Gmail API setup.

See **[PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)** before going live.
