# Pitch Labs Network — Platform

The Pitch Labs Network platform. **Advisor, Founder and Admin views are built.**
Sign-in is Slack (via Supabase Auth); the signed-in email is matched against an
Admin, Advisor or Founder row (see `DEPLOY_AUTH.md`).

## Advisor view

Advisors can:

- **Set monthly availability** in hours. Remaining hours are _derived_ from
  accepted meetings (never stored), so they auto-decrease as meetings are
  accepted and can't drift.
- **Approve / reject meeting requests** from founders, with an optional note.
  Accepting is blocked if it would exceed the month's remaining hours, or if no
  availability has been set yet.
- **Run a meeting through its lifecycle** once accepted (the "Your meetings"
  section):
  1. **Schedule** — record the date/time agreed with the founder.
  2. **Upcoming** — shows the confirmed time; can be rescheduled.
  3. **Did it happen?** — once the time passes, the advisor says yes/no.
  4. **Feedback** — if it happened, leave a 1–5 rating + notes.
  5. **Conflict → admins** — if advisor and founder disagree on whether they
     met, an `AdminNotification` is raised (founder's answer comes from the
     founder view in a later phase; the seed presets one to demo this).

Stages are _derived_ from the underlying fields in `lib/meeting.ts`, so there's
no separate status column to keep in sync.

- **Dossiers (in-app):**
  - **View a founder's dossier** (read-only) from any of their meeting requests
    (`/founders/[id]`). Access is gated — an advisor can only open the dossier of
    a founder who has actually sent them a request.
  - **View / edit their own dossier** (`/dossier`) — title, expertise, intro,
    experience, how-I-help, location, LinkedIn. Saved via the session's advisor,
    so no one can edit another advisor's dossier.

## Founder view

Founders (under `/founder`) can:

- **Browse the advisor list** (`/founder`) with each advisor's expertise and their
  **availability in hours** for the current month (free / fully booked / not set).
- **View an advisor** (`/founder/advisors/[id]`) — their dossier plus availability.
- **Send a meeting request** from that page (topic, message, estimated hours).
  Duplicate open requests with the same advisor in a month are blocked; once sent,
  the page shows the request's status instead of the form.
- **Track their requests** (`/founder/meetings`) — status, the advisor's decision
  note, and any time the advisor recorded. Scheduling happens outside the app (their
  own calendars). Founders answer "did we meet?" (feeds the admin conflict inbox) and
  can withdraw a pending request.
- **Create / edit their profile + dossier** (`/founder/profile`) — name, company,
  one-liner, stage, industry, website, about, traction, what they're looking for.
  Saved via the session's founder identity.

## Admin view

Admins (under `/admin`, 404 for everyone else) can:

- **Overview** — hours committed vs. offered, pending requests, past-due meetings,
  open conflicts, recent admin activity.
- **Conflicts** — when advisor and founder disagree on whether a meeting happened,
  see both answers and rule on it. The ruling (`MeetingRequest.adminMet`) overrides
  the advisor's answer everywhere. Conflicts only arise once founders can answer
  "did we meet?" (`/founder/meetings`).
- **Members** — add advisors/founders by Slack email (the allowlist), edit name/email,
  and deactivate/reactivate. Members are never deleted: deactivating blocks login
  and hides advisors from the founder directory.
- **Activity** — every request across the network, filterable by month, status,
  advisor and founder, plus an hours-by-advisor ledger.
- **Admins** — add/remove admins (the last admin can't be removed).
- **Audit log** — every admin mutation is recorded in `AuditLog`.

One email can hold several roles (for example advisor and founder, or advisor
and admin), with at most one row per role. People with more than one role get a
switcher in the top bar and land on the workspace they used last. Changing the
email of one role moves all of that person's roles. Nobody can request a meeting
with themselves. Create the first admin with `npm run make-admin -- you@company.com "Your Name"`.

## Stack

- Next.js 16 (App Router) + TypeScript, React Server Components + Server Actions
- Prisma 6 + Postgres (Supabase), Supabase Auth (Slack OIDC)
- Plain CSS design system in `app/globals.css` (Fraunces + Hanken Grotesk)

## Environments

| Environment | Code                         | Supabase project | Postgres schema | URL                      |
| ----------- | ---------------------------- | ---------------- | --------------- | ------------------------ |
| Production  | `main` (Vercel Production)   | production       | `public`        | the production domain    |
| Staging     | `staging` (Vercel Preview)   | non-production   | `staging`       | the staging domain       |
| Development | local `npm run dev`          | non-production   | `public`        | http://localhost:3000    |

Staging and development share one non-production Supabase project and are kept
apart by Postgres schema (`?schema=staging` on both DB URLs on the Vercel
staging variables). Production is never reachable from a local `.env`.

Release flow: feature branch -> `staging` (auto-deploys and runs
`prisma migrate deploy`) -> check it -> `npm run db:migrate:prod` -> merge to `main`.

## Getting started

```bash
npm install
cp .env.example .env     # fill in the NON-PRODUCTION Supabase values
npx prisma migrate dev   # apply migrations to your dev database
ALLOW_DESTRUCTIVE_SEED=1 npm run seed   # wipes members + meetings; refuses to run on production
npm run dev              # http://localhost:3000
```

Useful scripts:

- `npm run seed` - re-seed the database (refuses to run against production)
- `npm run db:reset` - drop, re-migrate, and re-seed (refuses to run against production)
- `npm run db:migrate:staging` - apply migrations to the `staging` schema of the non-production project
- `npm run db:migrate:prod` - apply migrations to production; reads `.env.prod-migrate` (gitignored) and asks for confirmation

## End-to-end tests

Playwright tests live in `e2e/`. They sign in without Slack, using the
**non-production** Supabase project: each test creates its own advisor, founder
or admin (in the database and in Supabase Auth), signs them in with the secret
API key, and deletes everything afterwards. Tests never depend on seed data or
on each other.

```bash
cp .env.e2e.example .env.e2e    # add the non-production secret key
npm run test:e2e                # starts `npm run dev` if it isn't running
```

- Tests (`e2e/`): the meeting lifecycle (`meeting-lifecycle`), role access
  (`access-control`), founder booking limits and admin overrides
  (`booking-limits`, including a simultaneous-request race), advisor
  availability (`availability`), conflict resolution (`conflicts`), cancelling accepted meetings
  (`cancellation`), member and
  admin management (`member-management`, `admin-management`), the admin
  "view as" preview (`view-as`), and the audit log and activity pages
  (`audit-and-activity`). Every new feature needs a test here (see `CLAUDE.md`).
- Not covered: the "can't remove the last admin" guard, because reaching it
  means deleting the real admins in a shared database.
- Each worker signs in once per role and reuses that session: Supabase limits
  how many sign-ins you can do in a few minutes, so a full run uses roughly
  25-30 of them. Wait about 5 minutes between full runs.
- The app refuses to schedule a meeting in the past, so the lifecycle test moves
  the meeting time into the past directly in the database (`e2e/helpers/db.ts`).
- Needs the Email provider enabled on the non-production Supabase project (the default).
- Refuses to run if the Supabase URL or database is the production project.
- Against staging: set `E2E_BASE_URL`, `E2E_VERCEL_BYPASS_SECRET` and
  `E2E_DATABASE_URL` (the pooled URL with `schema=staging`) in `.env.e2e`.
- In CI, provide the same variables as secrets instead of `.env.e2e`
  (`CI=true` switches to retries and the GitHub reporter).

## Project map

| Path                   | Purpose                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `prisma/schema.prisma`   | Advisor, Founder (+ dossier fields), MonthlyAvailability, MeetingRequest, AdminNotification |
| `prisma/seed.ts`         | Sample data (3 advisors, 4 founders, requests, dossiers)       |
| `lib/availability.ts`    | Derives remaining hours from accepted meetings                 |
| `lib/meeting.ts`         | Derives a meeting's lifecycle stage from its fields            |
| `lib/session.ts`         | Role + identity from the Supabase session (admin/advisor/founder) |
| `app/admin/`             | Admin area: overview, conflicts, members, activity, admins, audit log |
| `app/actions.ts`         | Server actions for both roles (identity, availability, decide, lifecycle, dossier, send request, founder profile) |
| `app/page.tsx`           | Advisor dashboard (root; redirects founders to `/founder`)    |
| `app/dossier/`           | Advisor's own dossier (view + edit)                           |
| `app/founders/[id]/`     | Read-only founder dossier for advisors (access-gated)         |
| `app/founder/`           | Founder workspace: advisor list, advisor detail, profile     |
| `app/components/`        | Client components + shared role-aware `TopBar` nav            |

## Notes / known follow-ups (later phases)

- `status` is a string (`PENDING|ACCEPTED|REJECTED|WITHDRAWN`) because SQLite has no native
  enum; the union lives in `lib/types.ts`. Meeting lifecycle stages are derived,
  not stored.
- Notifications to the other party (request sent, approval/rejection, scheduling)
  are stubbed (`TODO`s in `app/actions.ts`).
- Scheduling is external (no calendar invite or video link). The advisor's "record a
  time" step still gates their "did it happen?" step.
