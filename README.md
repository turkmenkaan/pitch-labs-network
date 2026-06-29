# Pitch Labs Network — Platform

The Pitch Labs Network platform. **Advisor and Founder views are built; the Admin
view comes next.** Auth is stubbed: a "Viewing as" switcher in the header lets you
act as any advisor or founder (cookie-backed role + identity).

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
- **Create / edit their profile + dossier** (`/founder/profile`) — name, company,
  one-liner, stage, industry, website, about, traction, what they're looking for.
  Saved via the session's founder identity.

## Stack

- Next.js 16 (App Router) + TypeScript, React Server Components + Server Actions
- Prisma 6 + SQLite (`prisma/dev.db`)
- Plain CSS design system in `app/globals.css` (Fraunces + Hanken Grotesk)

## Getting started

```bash
npm install
npx prisma migrate dev   # create the SQLite DB + schema
npm run seed             # load sample advisors / founders / requests
npm run dev              # http://localhost:3000
```

Useful scripts:

- `npm run seed` — re-seed the database
- `npm run db:reset` — drop, re-migrate, and re-seed

## Project map

| Path                   | Purpose                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `prisma/schema.prisma`   | Advisor, Founder (+ dossier fields), MonthlyAvailability, MeetingRequest, AdminNotification |
| `prisma/seed.ts`         | Sample data (3 advisors, 4 founders, requests, dossiers)       |
| `lib/availability.ts`    | Derives remaining hours from accepted meetings                 |
| `lib/meeting.ts`         | Derives a meeting's lifecycle stage from its fields            |
| `lib/session.ts`         | Stubbed role + identity (advisor/founder) via cookies          |
| `app/actions.ts`         | Server actions for both roles (identity, availability, decide, lifecycle, dossier, send request, founder profile) |
| `app/page.tsx`           | Advisor dashboard (root; redirects founders to `/founder`)    |
| `app/dossier/`           | Advisor's own dossier (view + edit)                           |
| `app/founders/[id]/`     | Read-only founder dossier for advisors (access-gated)         |
| `app/founder/`           | Founder workspace: advisor list, advisor detail, profile     |
| `app/components/`        | Client components + shared role-aware `TopBar` nav            |

## Notes / known follow-ups (later phases)

- `status` is a string (`PENDING|ACCEPTED|REJECTED`) because SQLite has no native
  enum; the union lives in `lib/types.ts`. Meeting lifecycle stages are derived,
  not stored.
- Notifications to the other party (request sent, approval/rejection, scheduling)
  are stubbed (`TODO`s in `app/actions.ts`).
- `AdminNotification` records are created on conflict but there's no admin view to
  surface them yet.
- The founder view does not yet let founders answer "did we meet?" (`founderMet`)
  — that's the remaining piece to fully close the conflict→admin loop from the UI.
- Not yet built: the **admin view** (onboard users, view commitments & decisions,
  surface notifications), real auth, and auto calendar invite + video link on
  scheduling.
