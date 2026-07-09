# Deployment Guide

This walks you from zero to a live, auto-syncing Job Tracker at
`https://your-app.vercel.app`. No Docker, no server management. Every step
says exactly what to click.

Total time: ~30-40 minutes, most of it waiting on things to provision.

Want to try it against your real Gmail on your own machine first, before
deploying anything? See the README's
[Testing locally against your real Gmail](./README.md#testing-locally-against-your-real-gmail)
section — you can reuse the Supabase and Google Cloud setup from steps 2-3
below for that.

**This entire guide can be completed for $0.** Every account below has a
free tier that comfortably covers personal use, including the Anthropic step
— which you can skip entirely. Skipping it means Job Tracker classifies your
email with a free, offline, rule-based classifier instead of Claude (see the
README's "Free vs. AI-powered classification" section for the tradeoff). You
can add a Claude key later at any time without losing data.

---

## 0. What you'll need accounts for

- **GitHub** — hosts your code, connects to Vercel — free
- **Supabase** — free PostgreSQL database — free
- **Vercel** — free hosting + cron scheduler — free
- **Google Cloud** — OAuth sign-in + Gmail API access — free
- **Anthropic** *(optional)* — Claude API key for higher-accuracy email classification — paid, skip for $0 mode

---

## 1. Push the code to GitHub

If you already have a GitHub account and a repo for this project, skip to
step 1.4.

1.1. Go to [github.com](https://github.com) and sign in (or create a free
account if you don't have one — **Sign up**, follow the prompts, verify your
email).

1.2. Click the **+** icon top-right → **New repository**. Name it
`job-tracker`. **Public or Private both work fine** — your actual secrets
(`DATABASE_URL`, API keys, etc.) never enter git; they live only in your
local `.env` file (gitignored) and in Vercel's Environment Variables. Pick
whichever visibility you prefer, and click **Create repository**. Don't
initialize with a README (you already have one).

1.3. On your own machine, in the project folder, run:

```bash
git init                      # only if this folder isn't already a git repo
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/job-tracker.git
git push -u origin main
```

1.4. Confirm the push worked by refreshing the GitHub repo page — you should
see all your files.

---

## 2. Create the Supabase database

2.1. Go to [supabase.com](https://supabase.com) → **Start your project** →
sign in with GitHub.

2.2. Click **New project**. Pick an organization (or create one), name the
project `job-tracker`, generate/set a strong database password (**save it
somewhere** — you'll need it in a minute), pick the region closest to you,
and click **Create new project**. Wait ~2 minutes for it to provision.

2.3. Once it's ready, go to **Project Settings** (gear icon, bottom left) →
**Database**.

2.4. Under **Connection string**, select the **URI** tab and choose
**Transaction pooler** (port `6543`) — this is the connection mode that works
with serverless platforms like Vercel. Copy the string. It looks like:

```
postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
```

2.5. Replace `[YOUR-PASSWORD]` with the database password from step 2.2. This
full string is your `DATABASE_URL`. Keep this tab open — you'll paste it into
Vercel shortly.

---

## 3. Set up Google OAuth + Gmail API access

3.1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
sign in with the Google account you want to track applications for (or any
account — the OAuth consent screen will let any Google user sign in to your
app once configured).

3.2. Click the project dropdown (top left, next to "Google Cloud") → **New
Project**. Name it `Job Tracker`, click **Create**. Wait for it to finish,
then select it from the project dropdown.

3.3. In the left sidebar, go to **APIs & Services** → **Library**. Search for
**Gmail API**, click it, click **Enable**.

3.4. Go to **APIs & Services** → **OAuth consent screen**.
   - User Type: **External** → **Create**.
   - App name: `Job Tracker`. User support email: your email. Developer
     contact email: your email. Click **Save and Continue**.
   - **Scopes**: click **Add or Remove Scopes**, search for and check
     `.../auth/gmail.readonly`, click **Update**, then **Save and Continue**.
   - **Test users**: click **Add Users**, add your own Google email address
     (required while the app is in "Testing" publishing status — this lets
     you sign in without a Google verification review). Click **Save and
     Continue**, then **Back to Dashboard**.

3.5. Go to **APIs & Services** → **Credentials** → **Create Credentials** →
**OAuth client ID**.
   - Application type: **Web application**. Name: `Job Tracker Web`.
   - **Authorized redirect URIs** → **Add URI**, add:
     `http://localhost:3000/api/auth/callback/google` (for local dev).
   - Click **Create**. A dialog shows your **Client ID** and **Client
     Secret** — copy both somewhere safe. These are `GOOGLE_CLIENT_ID` and
     `GOOGLE_CLIENT_SECRET`.

   You'll come back here after deploying to add your production redirect URI
   (step 6).

---

## 4. Get an Anthropic API key (optional — skip for $0 mode)

**Skip this whole section if you want to run Job Tracker for free.** Without
`ANTHROPIC_API_KEY` set, the app automatically uses a free, built-in,
offline classifier instead — see the README's "Free vs. AI-powered
classification" section for what you gain by adding this. You can come back
and add it later at any time; nothing else needs to change.

If you do want Claude-powered classification:

4.1. Go to [console.anthropic.com](https://console.anthropic.com) and sign
in / create an account.

4.2. Go to **API Keys** → **Create Key**. Name it `job-tracker`, copy the
key (starts with `sk-ant-`) — this is `ANTHROPIC_API_KEY`. You won't be able
to see it again, so save it now.

4.3. Add a small amount of credit under **Billing** if your account doesn't
already have any — classification calls are inexpensive (roughly a fraction
of a cent per email) but require a positive balance.

---

## 5. Deploy to Vercel

5.1. Go to [vercel.com](https://vercel.com) → **Sign Up** → **Continue with
GitHub** (authorize Vercel to access your repos).

5.2. On the Vercel dashboard, click **Add New...** → **Project**.

5.3. Find your `job-tracker` repo in the list and click **Import**.

5.4. Vercel auto-detects Next.js — leave the build settings as-is.

5.5. Expand **Environment Variables** and add each of these (values from the
steps above):

| Name | Value |
|---|---|
| `DATABASE_URL` | the Supabase connection string from step 2.5 |
| `NEXTAUTH_URL` | leave blank for now — you'll set this after the first deploy gives you a URL |
| `NEXTAUTH_SECRET` | run `openssl rand -base64 32` locally (or use any random 32+ character string) |
| `GOOGLE_CLIENT_ID` | from step 3.5 |
| `GOOGLE_CLIENT_SECRET` | from step 3.5 |
| `ANTHROPIC_API_KEY` | *(optional — omit entirely for $0 mode)* from step 4.2 |
| `CRON_SECRET` | run `openssl rand -hex 32` (or any random string) |
| `TOKEN_ENCRYPTION_KEY` | run `openssl rand -base64 32` — encrypts your stored Gmail tokens |

5.6. Click **Deploy**. Wait ~1-2 minutes for the build to finish.

5.7. Once deployed, Vercel shows your live URL, e.g.
`https://job-tracker-yourname.vercel.app`. Copy it.

5.8. Go to **Project Settings** → **Environment Variables**, edit
`NEXTAUTH_URL`, and set it to your live URL (no trailing slash), e.g.
`https://job-tracker-yourname.vercel.app`. Save.

5.9. Go to **Deployments**, click the **⋯** menu on the latest deployment →
**Redeploy** (env var changes require a redeploy to take effect).

---

## 6. Connect Google OAuth to your live URL

6.1. Back in [Google Cloud Console](https://console.cloud.google.com) →
**APIs & Services** → **Credentials** → click your `Job Tracker Web` OAuth
client.

6.2. Under **Authorized redirect URIs**, click **Add URI** and add:

```
https://your-app.vercel.app/api/auth/callback/google
```

(replace with your actual Vercel URL from step 5.7). Click **Save**.

---

## 7. Set up the database schema

The repo already includes the initial migration
(`prisma/migrations/20260709201022_init`). Run this from your local machine
(it connects to your live Supabase database using the `DATABASE_URL` you
already have in your local `.env`):

```bash
# make sure your local .env has the same DATABASE_URL as Vercel
npx prisma migrate deploy
```

This creates every table, enum, and foreign key in one shot. (If you ever
change `prisma/schema.prisma` yourself, generate a new migration with
`npx prisma migrate dev --name <what-changed>` before deploying again.)

### Optional: load sample data

To try the dashboard and table with realistic-looking sample applications
before connecting a real Gmail account:

```bash
npx prisma db seed
```

This creates a demo user (`demo@example.com`) with a year's worth of sample
applications across every status. Safe to run against any environment — it
only inserts, and re-running it is idempotent (it upserts the demo user and
clears only that user's previous sample applications first).

---

## 8. Try it

8.1. Visit your live URL. Click **Sign in with Google**.

8.2. You'll see a Google consent screen listing "View your email messages
and settings" (the read-only Gmail scope) — this is expected. Since the app
is in "Testing" mode, only the test users you added in step 3.4 can sign in;
if you see an "app not verified" warning, click **Advanced** → **Go to Job
Tracker (unsafe)** — this is normal for apps that haven't gone through
Google's verification review, which isn't required for personal use.

8.3. Once signed in, you'll land on the dashboard. Click **Sync Now**.

8.4. After the sync completes, check the **Applications** tab — you should
see any job-related emails from your inbox turned into tracked applications.

---

## 9. Confirm the daily auto-sync

The cron job (`vercel.json`) is already configured to hit `/api/cron/sync`
once a day. Vercel enables Cron Jobs automatically on deploy — no extra
setup needed. You can confirm it's registered under your Vercel project →
**Settings** → **Cron Jobs**.

**About the 9:00 AM Europe/Berlin schedule:** Vercel Cron doesn't support
timezones — it only takes a fixed UTC time. `vercel.json` is set to `0 7 * *
*` (7:00 AM UTC), which is 9:00 AM in Berlin during daylight saving time
(late March–late October) and 8:00 AM during standard time (late
October–late March). If you want it exactly on the hour year-round, or if
you're in a different timezone, edit the `schedule` field in `vercel.json`:

- Compute your target UTC hour: `target_local_hour - UTC_offset`
- Update the cron string to `"0 <UTC_hour> * * *"`
- Commit and push — Vercel picks up the new schedule on the next deploy

You can always trigger a sync manually any time via the **Sync Now** button,
regardless of the cron schedule.

---

## Redeploying after changes

Any `git push` to `main` automatically triggers a new Vercel deployment — no
manual redeploy needed going forward (the manual redeploy in step 5.9 was
only necessary because you changed an environment variable after the first
deploy).
