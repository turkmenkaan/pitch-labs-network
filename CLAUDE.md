@AGENTS.md

# Every feature ships with an end-to-end test

When you add a feature or change user-visible behavior, add or update a Playwright test in `e2e/` in the same change. A feature isn't done until its test passes.

- Cover the behavior through the UI as a user would meet it: the happy path, plus the refusals and limits the feature enforces. Where a rule is enforced on the server (permissions, limits, preview-only), also prove the server refuses it, not just the UI.
- Put the test in the file for that area (`access-control`, `meeting-lifecycle`, `booking-limits`, `availability`, `conflicts`, `member-management`, `admin-management`, `view-as`, `audit-and-activity`), or add a new `*.e2e.ts` file for a new area.
- Reuse `e2e/fixtures.ts` (`advisor`, `otherAdvisor`, `founder`, `admin`, `stranger`) and the helpers in `e2e/helpers/`. Tests create their own data and clean it up; never rely on seed data or on other tests.
- Run the new test and the affected files with `npx playwright test <file>`, and the full suite (`npm run test:e2e`) before finishing. Full runs are limited by Supabase's sign-in rate limit: wait about 5 minutes between them. Setup and rules are in the README's "End-to-end tests" section.
- Bug fixes get a regression test too when the bug was reachable through the UI.
- Pure logic (such as `lib/guardrails.ts`) can also have a unit test with `npm test`, but that doesn't replace the end-to-end test.
