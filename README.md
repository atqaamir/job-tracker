# Job Tracker

A personal CRM for your job search. Job Tracker connects to your Gmail account,
automatically detects application confirmations, recruiter replies, interview
invitations, assessments, offers, and rejections, and turns them into a single
dashboard — no manual data entry.

**This app is free to run.** Gmail sync, email classification, the dashboard,
and the daily digest all work with zero API cost using a built-in offline
classifier. Turning on AI classification (per-user, from Settings) upgrades
accuracy (real summarization, better extraction) for a small usage-based fee,
and by default only applies to the most recent 2 weeks of any given sync to
keep cost predictable. See [Free vs. AI-powered classification](#free-vs-ai-powered-classification).

## Features

- **Gmail integration** — read-only OAuth access, scans for job-related email (Primary category only — Promotions/Social/Updates/Forums are excluded), syncs every 9:00 AM automatically (and on demand).
- **Free by default, AI-upgradable classification** — a built-in rule-based classifier (no API key, no cost) detects category, company, position, salary, location, and more. Enable AI and set a Claude API key per-user from **Settings** for higher accuracy and real summarization — no code changes or redeploy needed. AI is capped to the most recent 2 weeks of any sync by default; syncing further back than that prompts you to choose how far AI should reach (remembered per browser afterward).
- **Background, cancellable sync** — sync runs as a server-side job that keeps going even if you close the tab or navigate away; a live progress bar tracks emails scanned vs. processed, and a **Cancel** button stops it mid-run without losing your last-sync cursor.
- **Two sync modes** — **Sync Now** fetches only what's new since your last successful sync; **Fetch All Again** wipes all fetched data and re-fetches the full window configured in Settings (default: 1 year).
- **Automatic application tracking** — emails are merged into application records by Gmail thread and by company/position, so a single application accumulates its full email history rather than creating duplicate rows per email.
- **Furthest-stage tracking** — each application tracks both its current status and the furthest pipeline stage it ever reached, so a rejection after an interview stays distinguishable from a rejection with no interview.
- **Dashboard** — applications, interviews, assessments, offers, rejections, response rate, interview rate, average response time, and applications-over-time — filterable by today/2 weeks/3/6/12 months. Every stat card is clickable and deep-links to the Applications table pre-filtered to match.
- **Applications table** — search, filter by status/furthest stage, sort, paginate, inline edit, archive, delete, CSV export/import.
- **Notifications** — in-app alerts for interview invitations, recruiter replies, offers, and rejections, created only by the automatic daily sync (manual syncs don't spam notifications for data you're already looking at).
- **Daily digest** — the 9:00 AM sync produces a summary (new applications, replies, stale follow-ups, errors) shown on the dashboard.
- **AI Mode indicator** — a badge in the app header shows at a glance whether AI classification is currently on or off, linking to Settings.
- **Configurable sync window** — set how many days back "Fetch All Again" searches (Settings page), edit the raw Gmail search query, or turn off the daily auto-sync.
- **Duplicate detection/merge** and **delete all fetched data**, both from the Settings page.
- **Encrypted storage** — Gmail OAuth tokens and per-user Anthropic API keys are encrypted (AES-256-GCM) before being written to the database.
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
src/lib/sync.ts                     Core sync engine: Gmail -> classify -> merge into applications, cancellable
src/lib/clear-fetched-data.ts        Wipes a user's applications/emails/sync history (Fetch All Again, delete-all)
src/lib/stats.ts                      Dashboard aggregate stats + shared dashboard-filter predicate
src/lib/ai-status.ts                   Whether AI classification is currently usable for a user
src/lib/ai-sync-prefs.ts                Per-browser localStorage prefs for the AI-timeframe confirmation
src/lib/crypto.ts                        AES-256-GCM helpers for encrypting OAuth tokens and API keys
src/lib/prisma.ts                         Prisma client + the token-encryption extension
src/app/api/sync/                          Sync (POST), status polling (GET), and cancel (POST) routes
src/app/api/                                Route handlers (applications, settings, stats, notifications, cron)
src/app/dashboard/                           Dashboard, applications table, and settings pages
src/components/                               UI components
```

## How the Gmail Sync Works

1. `POST /api/sync` creates a `SyncLog` row and immediately returns its ID; the actual work continues server-side via `after()`, detached from the request — closing the tab or navigating away doesn't stop it. The client polls `GET /api/sync/status` to show a live progress bar and can call `POST /api/sync/cancel` to request an early stop.
2. `runSync(userId, options)` (`src/lib/sync.ts`) reads the user's `SyncSettings` (search query, lookback window, last sync time, AI settings) and computes the search window: **Sync Now** uses `lastSyncAt` as the cursor (true incremental); **Fetch All Again** wipes existing data first and uses the configured "Fetch All Again window" (default 1 year); a brand-new account with no cursor and no prior data pulls a full year.
3. It lists Gmail message IDs matching the query (restricted to the Primary category) since that cursor, skipping any message already stored as an `EmailRecord`.
4. Each new message is fetched, parsed, and classified (category, company, position, status, recruiter, salary, location, deadline, summary, sentiment). Classification uses Claude only for the most recent slice of the fetch (2 weeks by default, or whatever the user confirmed in the AI-timeframe prompt) when AI is enabled and a key is configured (per-user, or falling back to the server's `ANTHROPIC_API_KEY`); everything older in the same fetch — and everything whenever AI is off — uses the free built-in classifier. See below. Between messages, the loop checks whether cancellation was requested and stops early if so, leaving `lastSyncAt` untouched so the next sync still covers the unprocessed remainder.
5. Non-job-related emails are discarded. Job-related emails are matched to an existing `JobApplication` by Gmail thread first, then by normalized company + position, or a new application is created — so multiple emails about the same job (confirmation, recruiter reply, interview, rejection) collapse into one row. Each application also tracks the furthest pipeline stage it ever reached, independent of its current status.
6. Notifications are created for interview invitations, assessments, offers, rejections, and recruiter replies — but only when triggered by the automatic daily cron, not by a manual sync.
7. A `SyncLog` row records the run (counts, errors, status — `completed`/`completed_with_errors`/`failed`/`cancelled` — and the full summary as JSON), which the dashboard displays as the "last sync" card.

This same function powers the **Sync Now** and **Fetch All Again** buttons
(`POST /api/sync`) and the daily cron (`GET /api/cron/sync`), so it's safe to
trigger manually at any time — it only processes emails it hasn't seen before.

Want more control over the lookback window, the Gmail search query, or AI
classification? Go to **Settings** in the app — see
[API.md](./API.md#settings) for the underlying endpoint if you're scripting
it.

See **[API.md](./API.md)** for the full endpoint reference.

## Free vs. AI-powered classification

Job Tracker works in two modes, controlled per-user from **Settings** (AI
enabled/disabled, model choice, and API key) — no redeploy needed to switch:

| | Free mode (default) | AI mode (enabled in Settings + key configured) |
|---|---|---|
| Cost | $0 | Usage-based, typically cents-to-a-few-dollars/month for personal volume |
| How it works | Keyword/regex rules in `src/lib/ai/heuristic-classify.ts` — no network call | Claude reads the full email and reasons about it |
| Category detection | Good — pattern-matches common phrasing (rejection, interview invite, assessment, offer, etc.) | Better — understands phrasing the rules don't cover |
| Company / position | Guessed from sender domain, subject line, and body patterns | Extracted from the email's actual content |
| Summary | First ~200 characters of the email body | A real one-to-two sentence summary |
| Salary / deadline extraction | Basic regex (`$120,000 - $140,000` style ranges, `by <date>` phrasing) | More robust, understands more phrasings |

Even with AI mode on, cost stays capped: only the most recent 2 weeks of any
given sync use Claude by default (older emails in the same fetch always use
the free classifier), and syncing further back than that — a stale "Sync
Now" gap, or a "Fetch All Again" backfill — pops up a one-time-per-button
confirmation letting you pick how far back AI should apply (2 weeks, 1/3/6/12
months, or the entire range). The daily automatic cron sync always uses AI
(if enabled) with no prompt, since its window is naturally small. Your choice
is remembered per browser and can be reviewed or reset from Settings.

The API key can be your own per-user key (entered in Settings, encrypted at
rest) or the server's `ANTHROPIC_API_KEY` env var as a fallback for
single-deployer setups. Both modes write to the exact same database fields,
so switching doesn't touch existing data — future syncs just start using the
new mode.

If you want the free mode, just leave AI disabled in Settings (the default)
and don't set `ANTHROPIC_API_KEY` (see `.env.example`); skip step 4 in
[DEPLOYMENT.md](./DEPLOYMENT.md).

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
