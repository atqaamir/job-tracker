# API Reference

All routes are Next.js App Router route handlers under `src/app/api/`. Every
route except `/api/cron/sync` requires an authenticated session (NextAuth
cookie) and operates only on the signed-in user's own data — there is no way
to read or modify another user's applications through this API.

Request/response bodies are JSON unless noted. Errors are
`{ "error": string | ZodFlattenedError }` with an appropriate HTTP status.

---

## Applications

### `GET /api/applications`

List the current user's applications with search, filtering, sorting, and pagination.

**Query parameters** (all optional):

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | 1-indexed |
| `pageSize` | `20` | max `100` |
| `search` | — | matches company, position, recruiter name, location, notes (case-insensitive) |
| `status` | — | one of the `ApplicationStatus` enum values |
| `archived` | `false` | `"true"` to list archived applications instead |
| `sortBy` | `dateApplied` | one of `company`, `position`, `dateApplied`, `dateLastEmail`, `status`, `createdAt` |
| `sortDir` | `desc` | `asc` or `desc` |

**Response:** `{ applications: JobApplication[], pagination: { page, pageSize, total, totalPages } }`

### `POST /api/applications`

Manually create an application. Body validated by `applicationCreateSchema`
(`src/lib/validation.ts`): `company`, `position`, `status` required;
`dateApplied`, `recruiterName`, `recruiterEmail`, `salaryMin`, `salaryMax`,
`salaryCurrency`, `location`, `employmentType`, `source`, `notes` optional.

**Response:** `201 { application }`

### `GET /api/applications/:id`

Fetch one application with its full email history.

### `PATCH /api/applications/:id`

Partial update (any subset of the create fields, plus `isArchived: boolean`).

### `DELETE /api/applications/:id`

Permanently deletes the application and its associated emails (cascade).

### `GET /api/applications/duplicates`

Returns groups of applications that share the same (normalized) company +
position: `{ duplicateGroups: JobApplication[][] }`. Only non-archived
applications are considered.

### `POST /api/applications/merge`

Merge duplicate applications into one. Body: `{ primaryId: string,
duplicateIds: string[] }`. Moves all emails from the duplicates onto the
primary, fills in any blank fields on the primary from the duplicates, keeps
the earliest `dateApplied` and latest `dateLastEmail`, then deletes the
duplicates.

### `GET /api/applications/export`

Streams a CSV of all of the user's applications (`Content-Disposition:
attachment`). Columns: Company, Position, Status, DateApplied,
DateLastEmail, RecruiterName, RecruiterEmail, SalaryMin, SalaryMax,
SalaryCurrency, Location, EmploymentType, Source, Notes, GmailLink, Archived.

### `POST /api/applications/import`

Body: `multipart/form-data` with a `file` field (CSV, same column layout as
export — header row required, extra/missing columns are tolerated). Creates
one application per valid row.

**Response:** `{ imported: number, skipped: number, errors: string[] }`

---

## Sync

### `POST /api/sync`

Triggers a Gmail sync for the current user immediately (this is what the
"Sync Now" button calls). Runs `runSync()` (`src/lib/sync.ts`): lists new
Gmail messages matching the configured search since the last sync,
classifies each one (Claude if `ANTHROPIC_API_KEY` is set, otherwise the
free built-in classifier), creates/updates applications, and writes
notifications.

**Response:** `{ ok: true, summary: SyncSummary }` — see the `SyncSummary`
interface in `src/lib/sync.ts` for the exact shape (counts, per-category
lists, stale-application follow-up suggestions, errors).

**Errors:** `409` if Gmail isn't connected or the OAuth token can't be
refreshed (the user needs to sign in again to re-grant access).

### `GET /api/cron/sync`

Called by Vercel Cron once a day (see `vercel.json`). **Not
session-authenticated** — instead requires an `Authorization: Bearer
<CRON_SECRET>` header matching the `CRON_SECRET` environment variable.
Runs `runSync()` for every user with `autoSync` enabled in their
`SyncSettings`, catching and recording per-user errors independently so one
failing account doesn't block the rest.

To test manually:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/sync
```

---

## Settings

### `GET /api/settings`

Returns (and lazily creates, if missing) the current user's `SyncSettings`:
`{ settings: { daysToLookBack, gmailQuery, autoSync, lastSyncAt, ... } }`.

### `PATCH /api/settings`

Body validated by `syncSettingsUpdateSchema`: `daysToLookBack` (7-1825),
`gmailQuery` (non-empty string), `autoSync` (boolean). If
`daysToLookBack` or `gmailQuery` actually changes value, the user's
`lastSyncAt` cursor is reset so the *next* sync re-scans using the new
window/query instead of silently continuing from where it left off
(already-processed emails are still skipped, so this is safe, just wider).

**Response:** `{ settings, willRescanOnNextSync: boolean }`

---

## Notifications

### `GET /api/notifications?unread=true`

Returns the 50 most recent notifications (optionally unread-only) plus an
unread count: `{ notifications: Notification[], unreadCount: number }`.

### `PATCH /api/notifications`

Body: `{ all: true }` to mark every notification read, or `{ ids: string[]
}` to mark specific ones read.

---

## Stats

### `GET /api/stats?months=12`

Dashboard aggregates for the last N months (default 12, max 60):
applications, active count, interviews, assessments, offers, rejections,
response rate, interview rate, average response time (days), weekly/monthly
application counts, status distribution, most recent sync log, and unread
notification count. See `DashboardStats` in `src/lib/stats.ts` for the
exact shape. This same function backs the dashboard's server-rendered page,
so the API and the UI are always consistent.

---

## Auth

### `GET|POST /api/auth/*`

Handled entirely by NextAuth (`src/lib/auth.ts`) — sign in, sign out,
callback, session, CSRF token endpoints. Not meant to be called directly;
use `next-auth/react`'s `signIn()` / `signOut()` on the client (see
`src/components/auth/sign-in-button.tsx` and
`src/components/layout/user-menu.tsx`).
