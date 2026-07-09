# Production Checklist

## Before your first deploy

- [ ] `DATABASE_URL` points at Supabase's **Transaction pooler** (port 6543), not the direct connection — the direct connection will exhaust under serverless concurrency.
- [ ] `NEXTAUTH_SECRET` is a real random 32+ byte value (`openssl rand -base64 32`), not the placeholder.
- [ ] `CRON_SECRET` is a real random value (`openssl rand -hex 32`), not the placeholder.
- [ ] `NEXTAUTH_URL` matches your exact production URL (no trailing slash).
- [ ] Google OAuth client has both the localhost and production redirect URIs registered.
- [ ] Gmail API is enabled on the Google Cloud project, and the OAuth consent screen requests only `gmail.readonly`.
- [ ] Anthropic account has billing enabled with a positive balance.
- [ ] `npx prisma migrate deploy` (or `db push`) has been run against the production database.
- [ ] `.env` is not committed to git (verify with `git status` — it should be untracked).

## Verify after deploy

- [ ] Sign in with Google works end-to-end and lands on `/dashboard`.
- [ ] "Sync Now" completes without error and creates at least one application from real email.
- [ ] Vercel project → Settings → Cron Jobs shows `/api/cron/sync` registered.
- [ ] Manually hit `/api/cron/sync` with `Authorization: Bearer <CRON_SECRET>` returns `200` (confirms the cron secret matches).
- [ ] CSV export downloads a valid file; CSV import round-trips it back in.
- [ ] Dark mode toggle persists across reloads.
- [ ] Notifications appear after a sync that includes an interview/offer/rejection email.

## Security

- [ ] Only the `gmail.readonly` scope is requested — the app never has write/send/delete access to Gmail.
- [ ] All API routes that touch user data call `requireUserId()` and scope every Prisma query by `userId`.
- [ ] `/api/cron/sync` rejects requests without the correct `CRON_SECRET` bearer token.
- [ ] Zod validates all mutating API input (`applications` create/update, CSV import rows).
- [ ] No secrets are logged (check `console.error` call sites — they log messages, not full error objects with tokens).
- [ ] OAuth access/refresh tokens are stored only in the database (via the Prisma adapter's `Account` table), never exposed to the client.

## Operational

- [ ] Set a calendar reminder to check `SyncLog` (`npx prisma studio` → `SyncLog` table, or watch for the dashboard's error banner) periodically for recurring sync failures (e.g. an expired Gmail refresh token, which requires re-signing in with Google).
- [ ] If you rotate `GOOGLE_CLIENT_SECRET` or `ANTHROPIC_API_KEY`, update the Vercel env var and redeploy.
- [ ] If the Google OAuth consent screen is still in "Testing" mode, remember only users added under "Test users" can sign in — publish to "In production" (Google Cloud Console → OAuth consent screen → Publish App) if you want anyone to be able to sign in, which for a single-user personal tracker is usually unnecessary.

## Known limitations (by design, for simplicity)

- The daily cron fires at a fixed UTC time and does not shift automatically with daylight saving time — see [DEPLOYMENT.md](./DEPLOYMENT.md#9-confirm-the-daily-auto-sync).
- Vercel serverless functions have a request time limit; `maxDuration` is set to 300s on the sync routes, which comfortably covers a normal daily batch of new emails. A very large first-time backfill (a year of daysToLookBack on a very high email volume) may need to be run in a few manual "Sync Now" clicks rather than one shot, since each run only processes emails not already stored.
