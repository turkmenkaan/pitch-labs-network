# To do

Status after the landing page (commit `a17b745` and the copy commits after it). Roughly in priority order.
Tick items off as they land.

## 0. Admin can view both sides of the platform (done)

See "Admin view-as" below for the design.

- [x] Admin can open any advisor's or founder's workspace as they see it
- [x] Preview is **read-only** (server-enforced), with a banner and an Exit button
- [x] Starting a preview is written to the audit log
- [x] "View as" on Members rows and on names in Activity (masthead menu deliberately skipped)
- [x] Works for deactivated members too
- [ ] Not yet confirmed in a browser: "Exit preview" returns to `/admin`, and a blocked write
      shows the "changes are disabled" message

## 1. Founder meetings page (done)

The biggest functional gap. It also makes the admin conflict inbox usable. Scheduling is
out of scope here: pairs arrange a time in their own calendars.

- [x] `/founder/meetings`: every request with status, advisor's decision note, and the
      advisor's recorded time if there is one
- [x] Founder answers "did we meet?" (sets `founderMet`, runs the existing conflict check)
- [x] Founder can withdraw a pending request (new `WITHDRAWN` status)
- [x] Founder sees an admin ruling when a conflict is resolved
- [x] "My meetings" link in `TopBar`
- [x] Page confirmed rendering in a founder preview. Write actions (answer, withdraw) still
      untested in a browser; they are blocked in preview

## 1b. Landing page (done)

- [x] Public landing page on `/`; signed-in members are redirected to their workspace
- [x] Advisor dashboard moved to `/advisor`
- [x] Copy: advisory network, year-long cohorts (~30 founders, ~10 advisors), a different
      advisor each month, pricing line ("less than an hour of a consultancy call")
- [x] "Request information" is a `mailto:info@pitchlabs.net` link
- [ ] Look at it in a browser (only checked with curl and typecheck so far)
- [ ] Update `/no-access` copy ("Contact an admin") and link the mailto there
- [ ] Replace the mailto with a stored request form and admin inbox (see section 6)
- [ ] Back up the pricing claim with a figure you can show people who ask
- [ ] The app doesn't enforce "a different advisor each month" or the one-year cohort

## 1c. Founder guardrails (built and committed, not pushed)

- [x] Founders: 4 hours of calls a month, 2 calls per advisor (pending + accepted count;
      declined, withdrawn and didn't-meet give time back; month = month sent)
- [x] Enforced in `sendMeetingRequest` inside a transaction with a per-founder lock
- [x] Usage meter on the founder pages; limits disclosed under "How it works"
- [x] Admin override per founder (Members > Edit), written to the audit log
- [x] First Vitest tests (`npm test`, `lib/guardrails.test.ts`)
- [x] Migration `20261022120000_founder_limits` (two nullable Founder columns) applied to
      the shared database
- [ ] Try it in a browser; check the demo seed doesn't already break a limit

## 2. Notifications (backlogged, planned)

Today every notification is a `TODO` in `app/actions.ts`. Planned in chat, not started.

**Design:** an outbox table (`Notification`, with a unique `dedupeKey`), sent best-effort via
`after()` so a Slack failure never fails the user's action. Retries with backoff plus a
cron-protected sweeper route. Slack bot DMs (scopes `chat:write`, `im:write`, `users:read`,
`users:read.email`), recipient looked up by email and cached in a `slackUserId` column.
`NOTIFY_MODE=off|log|slack` plus `NOTIFY_ALLOWLIST`. **Local `.env` points at the production
database, so local runs must default to `log`.** Admin page `/admin/notifications` for failures
and retries.

**Events:** new request -> advisor; accepted / declined -> founder; withdrawn -> advisor;
conflict raised -> admins; conflict resolved -> advisor + founder; welcome on add member/admin;
reminders (outcome, pending nudge, availability). Dropped: "meeting scheduled" (scheduling is
external).

**Phases:** 1 foundation, 2 core events, 3 reminders (cron), 4 later (email fallback, mute,
in-app inbox).

**Open decisions before starting:**
- [ ] Can the existing Slack app get bot scopes and be installed? Same workspace as all members?
- [ ] Vercel plan (Hobby cron is once a day)
- [ ] Admin alerts: DM each admin or one channel
- [ ] Which reminders in the first release, and the nudge delay
- [ ] Email fallback now or later
- [ ] Quiet hours / time zones for reminders
- [ ] Global on/off only, or per-person mute

## 3. Go-live prep

- [ ] Rotate the Supabase database password (it was printed in a terminal during the
      admin work, so it's in a session log)
- [ ] Decide the real first members, then clear the demo seed data
- [ ] Member emails must match their Slack emails (see `DEPLOY_AUTH.md` > Membership)
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Vercel
      **before** pushing (`DEPLOY_AUTH.md` step 1)
- [ ] Apply the admin migration to production before the deploy (already applied to the
      shared database; confirm it is the one production uses)
- [ ] Push `main`. This also ships the 4 earlier Slack-login commits, which replace the
      open "Viewing as" switcher
- [ ] Walk through "Verify production" in `DEPLOY_AUTH.md`, plus: non-admin gets a 404 on
      `/admin`
- [ ] Update `DEPLOY_AUTH.md` for the admin role (first admin via `npm run make-admin`)

## 4. Safety and correctness

- [ ] Make accepting a request transactional so two concurrent accepts can't overbook an advisor
- [ ] Same for the duplicate-open-request check when a founder sends a request
- [ ] Input limits: cap hours (offered and requested) and free-text lengths
- [ ] `error.tsx`, `loading.tsx` and a custom `not-found` page
- [ ] Fix the N+1 availability queries in the founder directory (`app/founder/page.tsx`)
- [ ] Rate-limit server actions
- [ ] Replace string statuses with Postgres enums (`MeetingRequest.status`, notification type)
- [ ] Refresh stale schema comments (still say "SQLite" and "Phase 1")
- [ ] Page titles per area (currently "Pitch Labs Network — Advisor" on founder and login pages)
- [ ] Remove unused Next.js starter SVGs from `public/`

## 5. Tests

The project has none.

- [ ] Add Vitest
- [ ] Meeting stage derivation, including `adminMet` overriding `advisorMet`
- [ ] Email normalization and the one-table-per-email rule
- [ ] Availability math (committed vs remaining)
- [ ] Server-action guards: ownership checks, last-admin removal, resolving a conflict twice
- [ ] ESLint config and a CI workflow that runs typecheck, lint, tests and `next build`

## 6. Product extras

- [ ] Month navigation and rollover (current month is hardcoded; a request on the 31st
      lands in the wrong month)
- [ ] Per-user time zones (scheduled times are parsed in the server's zone)
- [ ] Scheduling happens outside the app (each pair uses their own calendar), so no
      calendar invite or video link. Follow-up: the advisor's "record a time" step still
      gates their "did it happen?" step (`NEEDS_SCHEDULE`); make the time optional there
- [ ] Reschedule and cancel for accepted meetings (cancelling frees the hours)
- [ ] Advisor directory search and filter; structured expertise tags instead of a
      comma-separated string
- [ ] Founder rating of meetings; advisor reputation
- [ ] Self-serve access requests instead of the `/no-access` dead end
- [ ] Decide whether a "didn't meet" outcome releases the advisor's hours (currently no change)
- [ ] Admin: show times in the admin's time zone; audit log pagination; CSV export of Activity

---

## Admin view-as: design

**Goal:** an admin can see the advisor and founder sides of the product the way a given
member sees them, without needing a member row of their own.

**Approach:** "view as" preview, not a separate admin copy of those pages.

- An admin picks a member. A `viewAs` cookie (`advisor:<id>` or `founder:<id>`) is set by a
  server action that calls `getCurrentAdmin()` first.
- The cookie is only a hint. On every request it is honoured **only if the real Supabase
  session belongs to an admin**, so forging it gets a non-admin nothing.
- `lib/session.ts`: `getRoles`, `getCurrentAdvisor` and `getCurrentFounder` return the
  previewed member when the real user is an admin with a valid cookie. Deactivated members
  are allowed in preview. A stale or invalid cookie is ignored.
- **Read-only:** every mutating server action in `app/actions.ts` switches to a
  `getActingAdvisor()` / `getActingFounder()` that refuses while previewing. Enforced on the
  server; forms also disable their submit buttons so it doesn't just fail after the click.
- `TopBar` shows a persistent banner ("Viewing as Maya Okonkwo, advisor. Read-only. Exit")
  and the Exit button clears the cookie. Sign out also clears it.
- Entry points: a "View as" button on each Members row, plus a "View as" menu in the admin
  masthead. Names in the Activity table link to the preview.
- Starting a preview writes an `AuditLog` row (`member.view_as`). Admin pages themselves are
  unaffected by the cookie.
- No schema change.
