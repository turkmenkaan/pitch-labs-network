import { db, expect, test } from "./fixtures";
import { addForm, purgeTestMembers } from "./helpers/members";

test.afterEach(async ({}, testInfo) => {
  await purgeTestMembers(testInfo.workerIndex);
});

// Not covered here: the "can't remove the last admin" guard. It counts every
// admin in the database, so reaching it means deleting the real admins, which
// this suite must not do to a shared database.

test("a new admin can reach the admin area", async ({ admin, stranger }) => {
  const before = await stranger.page.goto("/admin");
  expect(before?.status()).toBe(404);

  await admin.page.goto("/admin/admins");
  const form = addForm(admin.page);
  await form.getByLabel("Name").fill("E2E New Admin");
  await form.getByLabel("Slack email").fill(stranger.email);
  await form.getByRole("button", { name: "Add admin" }).click();
  await expect(form.getByRole("status")).toContainText("E2E New Admin is now an admin.");

  const after = await stranger.page.goto("/admin");
  expect(after?.status()).toBe(200);
  expect(
    await db().admin.findUnique({ where: { email: stranger.email } })
  ).toMatchObject({ createdById: admin.row.id });
});

test("a removed admin loses access", async ({ admin, stranger }) => {
  await db().admin.create({
    data: { name: "E2E Doomed Admin", email: stranger.email, createdById: admin.row.id },
  });
  expect((await stranger.page.goto("/admin"))?.status()).toBe(200);

  await admin.page.goto("/admin/admins");
  const row = admin.page.locator("tr", { hasText: stranger.email });
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);

  expect((await stranger.page.goto("/admin"))?.status()).toBe(404);
  expect(await db().admin.count({ where: { email: stranger.email } })).toBe(0);
});

test("an email can't be an admin twice", async ({ admin }) => {
  await admin.page.goto("/admin/admins");
  const form = addForm(admin.page);
  for (const taken of [admin.email, admin.email.toUpperCase()]) {
    await form.getByLabel("Name").fill("E2E Clash");
    await form.getByLabel("Slack email").fill(taken);
    await form.getByRole("button", { name: "Add admin" }).click();
    await expect(form.getByRole("status")).toContainText("That email is already an admin.");
  }
  expect(await db().admin.count({ where: { name: "E2E Clash" } })).toBe(0);
});

test("the admin list marks who you are", async ({ admin }) => {
  await admin.page.goto("/admin/admins");
  await expect(admin.page.locator("tr", { hasText: admin.email })).toContainText("(you)");
});
