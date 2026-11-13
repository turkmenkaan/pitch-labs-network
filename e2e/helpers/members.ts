import { randomBytes } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { db } from "./db";

const runId = () => process.env.E2E_RUN_ID ?? "local";

// An email no one has signed in with. Rows created for it are removed by
// purgeTestMembers, so a test that adds a member through the UI leaves nothing.
export function addedEmail(workerIndex: number): string {
  return `e2e-added-${runId()}-w${workerIndex}-${randomBytes(3).toString("hex")}@e2e.example.com`;
}

// Deletes members this worker created through the admin UI, including the
// `stranger` identity once an admin has given it a role.
export async function purgeTestMembers(workerIndex: number): Promise<void> {
  const where = {
    OR: [
      { email: { startsWith: `e2e-added-${runId()}-w${workerIndex}-` } },
      { email: { startsWith: `e2e-stranger-${runId()}-w${workerIndex}@` } },
    ],
  };
  await db().advisor.deleteMany({ where });
  await db().founder.deleteMany({ where });
  await db().admin.deleteMany({ where });
}

// A member's row in Members, found by email.
export async function memberRow(
  page: Page,
  type: "advisor" | "founder",
  email: string
): Promise<Locator> {
  await page.goto(`/admin/members?type=${type}&q=${encodeURIComponent(email)}`);
  const row = page.locator("tr", { hasText: email });
  await expect(row).toBeVisible();
  return row;
}

// Opens a member's Edit panel and returns its form.
export async function openEdit(row: Locator): Promise<Locator> {
  await row.locator("details.adm-edit summary").click();
  return row.locator("details.adm-edit form");
}

// Turns off the browser's own checks (required, type=email, min/max) so the
// server's validation is what the test exercises.
export async function skipBrowserChecks(form: Locator): Promise<void> {
  await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true));
}

// The "Add a founder/advisor/admin" form at the bottom of an admin page.
export function addForm(page: Page): Locator {
  return page.locator("section.adm-add form");
}
