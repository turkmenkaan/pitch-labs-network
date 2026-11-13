import { db, expect, test } from "./fixtures";
import {
  addedEmail,
  addForm,
  memberRow,
  openEdit,
  purgeTestMembers,
  skipBrowserChecks,
} from "./helpers/members";

test.afterEach(async ({}, testInfo) => {
  await purgeTestMembers(testInfo.workerIndex);
});

const status = (scope: import("@playwright/test").Locator) => scope.getByRole("status");

test.describe("adding members", () => {
  test("an admin adds a founder, who can then sign in", async ({ admin, stranger }) => {
    // Sign in first so the stranger has no access yet.
    await stranger.page.goto("/");
    await expect(stranger.page).toHaveURL(/\/no-access$/);

    await admin.page.goto("/admin/members?type=founder");
    const form = addForm(admin.page);
    await form.getByLabel("Name").fill("E2E Added Founder");
    await form.getByLabel("Slack email").fill(stranger.email);
    await form.getByLabel(/^Company/).fill("Added Co");
    await form.getByRole("button", { name: "Add founder" }).click();
    await expect(status(form)).toContainText("E2E Added Founder added.");

    // New members start with an unfinished profile, so they land on it first.
    await stranger.page.goto("/");
    await expect(stranger.page).toHaveURL(/\/founder\/profile\?welcome=1$/);
    expect(await db().founder.findUnique({ where: { email: stranger.email } })).toMatchObject({
      name: "E2E Added Founder",
      company: "Added Co",
    });
  });

  test("an added advisor can sign in but stays unlisted until their intro is filled in", async ({
    admin,
    founder,
    stranger,
  }) => {
    await admin.page.goto("/admin/members?type=advisor");
    const form = addForm(admin.page);
    await form.getByLabel("Name").fill("E2E Added Advisor");
    await form.getByLabel("Slack email").fill(stranger.email);
    await form.getByRole("button", { name: "Add advisor" }).click();
    await expect(status(form)).toContainText("E2E Added Advisor added.");

    await stranger.page.goto("/");
    await expect(stranger.page).toHaveURL(/\/dossier\?welcome=1$/);

    await founder.page.goto("/founder");
    await expect(founder.page.getByText("E2E Added Advisor")).toHaveCount(0);

    await db().advisor.update({
      where: { email: stranger.email },
      data: { bio: "Now complete.", expertise: "Testing" },
    });
    await founder.page.reload();
    await expect(founder.page.getByText("E2E Added Advisor")).toBeVisible();
  });

  test("bad details are refused", async ({ admin, founder, advisor }, testInfo) => {
    // The form clears itself after every submit, so each attempt starts from a
    // fresh page.
    async function attempt(name: string, email: string) {
      await admin.page.goto("/admin/members?type=founder");
      const form = addForm(admin.page);
      await skipBrowserChecks(form);
      await form.getByLabel("Name").fill(name);
      await form.getByLabel("Slack email").fill(email);
      await form.getByRole("button", { name: "Add founder" }).click();
      return status(form);
    }

    await expect(await attempt("   ", addedEmail(testInfo.workerIndex))).toContainText(
      "Name is required."
    );
    await expect(await attempt("E2E Bad Email", "not-an-email")).toContainText(
      "Enter a valid email."
    );

    // Taken by a founder, an advisor, and (ignoring case) the founder again.
    for (const taken of [founder.email, advisor.email, founder.email.toUpperCase()]) {
      await expect(await attempt("E2E Bad Email", taken)).toContainText(
        "That email already belongs to someone on the platform."
      );
    }

    expect(await db().founder.count({ where: { name: "E2E Bad Email" } })).toBe(0);
  });
});

test.describe("editing members", () => {
  test("a rename shows up in the list and the audit log", async ({ admin, founder }) => {
    const row = await memberRow(admin.page, "founder", founder.email);
    const form = await openEdit(row);
    await form.getByLabel("Name").fill("E2E Renamed Founder");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(status(form)).toContainText("Saved.");

    await admin.page.reload();
    await expect(admin.page.locator("tr", { hasText: founder.email })).toContainText(
      "E2E Renamed Founder"
    );
    await admin.page.goto("/admin/audit");
    await expect(
      admin.page.locator("tr", { hasText: admin.row.name }).filter({ hasText: "member.update" })
    ).toContainText(`name "${founder.row.name}" → "E2E Renamed Founder"`);
  });

  test("an edit can't take another member's email, but can keep its own", async ({
    admin,
    founder,
    advisor,
  }) => {
    const row = await memberRow(admin.page, "founder", founder.email);
    const form = await openEdit(row);

    await form.getByLabel("Slack email").fill(advisor.email);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(status(form)).toContainText("That email already belongs to someone else.");
    expect((await db().founder.findUniqueOrThrow({ where: { id: founder.row.id } })).email).toBe(
      founder.email
    );

    await form.getByLabel("Slack email").fill(founder.email);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(status(form)).toContainText("Saved.");
  });

  test("changing a member's email moves their access to the new address", async ({
    admin,
    founder,
    stranger,
  }) => {
    const row = await memberRow(admin.page, "founder", founder.email);
    const form = await openEdit(row);
    await form.getByLabel("Slack email").fill(stranger.email);
    await form.getByRole("button", { name: "Save" }).click();
    // The list is filtered by the old email, so the row drops out once saved.
    await expect
      .poll(async () => (await db().founder.findUnique({ where: { email: stranger.email } }))?.id)
      .toBe(founder.row.id);

    await stranger.page.goto("/founder");
    await expect(stranger.page).toHaveURL(/\/founder$/);
    await founder.page.goto("/founder");
    await expect(founder.page).toHaveURL(/\/no-access$/);
  });

  test("limit overrides must be whole numbers from 1 to 40, or blank", async ({
    admin,
    founder,
  }) => {
    const hoursLimit = async () =>
      (await db().founder.findUniqueOrThrow({ where: { id: founder.row.id } }))
        .monthlyHoursLimit;

    // The form clears itself after every submit, so each attempt reopens it.
    async function save(value: string) {
      const row = await memberRow(admin.page, "founder", founder.email);
      const form = await openEdit(row);
      await skipBrowserChecks(form);
      await form.locator('input[name="monthlyHoursLimit"]').fill(value);
      await form.getByRole("button", { name: "Save" }).click();
      return status(form);
    }

    for (const bad of ["0", "41", "2.5", "-3"]) {
      await expect(await save(bad)).toContainText(
        "Limits must be whole numbers from 1 to 40, or blank."
      );
    }
    expect(await hoursLimit()).toBeNull();

    await expect(await save("6")).toContainText("Saved.");
    expect(await hoursLimit()).toBe(6);

    // Blank puts the founder back on the default.
    await expect(await save("")).toContainText("Saved.");
    expect(await hoursLimit()).toBeNull();
  });
});

test.describe("deactivating members", () => {
  test("a deactivated founder loses access until reactivated", async ({ admin, founder }) => {
    const row = await memberRow(admin.page, "founder", founder.email);
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row.getByRole("button", { name: "Reactivate" })).toBeVisible();
    await expect(row).toContainText("Deactivated");

    await founder.page.goto("/founder");
    await expect(founder.page).toHaveURL(/\/no-access$/);

    await row.getByRole("button", { name: "Reactivate" }).click();
    await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
    await founder.page.goto("/founder");
    await expect(founder.page).toHaveURL(/\/founder$/);
  });

  test("a deactivated advisor leaves the directory and can't be requested", async ({
    admin,
    founder,
    advisor,
  }) => {
    await founder.page.goto("/founder");
    await expect(founder.page.getByRole("heading", { name: advisor.row.name })).toBeVisible();

    const row = await memberRow(admin.page, "advisor", advisor.email);
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row.getByRole("button", { name: "Reactivate" })).toBeVisible();

    await founder.page.reload();
    await expect(founder.page.getByRole("heading", { name: advisor.row.name })).toHaveCount(0);
    const direct = await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
    expect(direct?.status()).toBe(404);

    await row.getByRole("button", { name: "Reactivate" }).click();
    await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
    await founder.page.goto("/founder");
    await expect(founder.page.getByRole("heading", { name: advisor.row.name })).toBeVisible();
  });

  test("the Members filters narrow the list", async ({ admin, founder, advisor }) => {
    await db().founder.update({
      where: { id: founder.row.id },
      data: { deactivatedAt: new Date() },
    });
    const url = (show: string) =>
      `/admin/members?type=founder&q=${encodeURIComponent(founder.email)}&show=${show}`;

    await admin.page.goto(url("active"));
    await expect(admin.page.getByText("No founders match.")).toBeVisible();
    await admin.page.goto(url("deactivated"));
    await expect(admin.page.locator("tr", { hasText: founder.email })).toBeVisible();

    // The search is by name or email, and is case-insensitive.
    await admin.page.goto(`/admin/members?type=advisor&q=${advisor.email.toUpperCase()}`);
    await expect(admin.page.locator("tr", { hasText: advisor.email })).toBeVisible();
  });
});
