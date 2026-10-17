# To do

Status after the admin-role work (commit `8081287`). Roughly in priority order.
Tick items off as they land.

## 0. Admin can view both sides of the platform (next)

Plan agreed in chat; see "Admin view-as" below for the design.

- [ ] Admin can open any advisor's or founder's workspace exactly as they see it
- [ ] Preview is **read-only** (server-enforced), with an always-visible banner and an Exit button
- [ ] Starting a preview is written to the audit log
- [ ] "View as" entry points on the Members page (and a quick menu in the admin masthead)
- [ ] Works for deactivated members too

## 1. Founder meetings page

The biggest functional gap. It also makes the admin conflict inbox usable.

- [ ] `/founder/meetings`: every request with status, advisor's decision note, scheduled time
- [ ] Founder answers "did we meet?" (sets `founderMet`, runs the existing conflict check)
- [ ] Founder can withdraw a pending request
- [ ] Founder sees an admin ruling when a conflict is resolved
- [ ] Founder-side link in `TopBar`

## 2. Notifications

Today every notification is a `TODO` in `app/actions.ts`.

- [ ] Channel: Slack DM (recommended; everyone already signs in with Slack) or email
- [ ] New request -> advisor
- [ ] Accepted / rejected -> founder
- [ ] Meeting scheduled -> founder
- [ ] Conflict raised -> admins
- [ ] Conflict resolved -> advisor and founder

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
- [ ] Calendar invite and video link when a meeting is scheduled
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
