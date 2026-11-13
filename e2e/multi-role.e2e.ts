// One email can hold several roles (an advisor who is also a founder, or an
// admin). These tests give the signed-in `advisor` fixture a second role by
// adding rows under the same email, which is what an admin does in Members.
import type { Advisor } from "@prisma/client";
import { db, expect, test, type Member } from "./fixtures";
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

const status = (form: ReturnType<typeof addForm>) => form.getByRole("status");

async function alsoFounder(advisor: Member<Advisor>) {
  return db().founder.create({
    data: {
      name: advisor.row.name.replace("Advisor", "Founder"),
      email: advisor.email,
      company: "E2E Dual Co",
      about: "Both an advisor and a founder.",
    },
  });
}

async function alsoAdmin(advisor: Member<Advisor>) {
  return db().admin.create({
    data: { name: advisor.row.name.replace("Advisor", "Admin"), email: advisor.email },
  });
}

async function dropRoles(email: string) {
  const admins = await db().admin.findMany({ where: { email }, select: { id: true } });
  await db().auditLog.deleteMany({ where: { adminId: { in: admins.map((a) => a.id) } } });
  await db().admin.deleteMany({ where: { email } });
  await db().meetingRequest.deleteMany({ where: { founder: { email } } });
  await db().founder.deleteMany({ where: { email } });
}

test("an admin gives an existing advisor a founder role with the same email", async ({
  admin,
  advisor,
}) => {
  try {
    await admin.page.goto("/admin/members?type=founder");
    const form = addForm(admin.page);
    await skipBrowserChecks(form);
    await form.getByLabel("Name").fill("E2E Dual Founder");
    await form.getByLabel("Slack email").fill(advisor.email);
    await form.getByRole("button", { name: "Add founder" }).click();
    await expect(status(form)).toContainText("E2E Dual Founder added.");
    expect(await db().founder.count({ where: { email: advisor.email } })).toBe(1);

    // Both lists show the person, flagged with their other role.
    const founderRow = await memberRow(admin.page, "founder", advisor.email);
    await expect(founderRow).toContainText("Also advisor");
    const advisorRow = await memberRow(admin.page, "advisor", advisor.email);
    await expect(advisorRow).toContainText("Also founder");

    // A second founder row for the same email is still refused.
    await admin.page.goto("/admin/members?type=founder");
    const again = addForm(admin.page);
    await skipBrowserChecks(again);
    await again.getByLabel("Name").fill("E2E Dual Founder");
    await again.getByLabel("Slack email").fill(advisor.email);
    await again.getByRole("button", { name: "Add founder" }).click();
    await expect(status(again)).toContainText("That email is already a founder.");
    expect(await db().founder.count({ where: { email: advisor.email } })).toBe(1);
  } finally {
    await dropRoles(advisor.email);
  }
});

test("an advisor who is also a founder switches workspaces, and the choice is remembered", async ({
  advisor,
}) => {
  try {
    await alsoFounder(advisor);

    // Default priority: advisor first.
    await advisor.page.goto("/");
    await expect(advisor.page).toHaveURL(/\/advisor$/);

    await advisor.page.getByRole("button", { name: "Founder view" }).click();
    await expect(advisor.page).toHaveURL(/\/founder$/);
    await expect(advisor.page.getByRole("button", { name: "Advisor view" })).toBeVisible();
    await expect(advisor.page.getByRole("button", { name: "Founder view" })).toHaveCount(0);

    // Coming back (as after a new sign-in) lands on the last workspace used.
    await advisor.page.goto("/");
    await expect(advisor.page).toHaveURL(/\/founder$/);

    await advisor.page.getByRole("button", { name: "Advisor view" }).click();
    await expect(advisor.page).toHaveURL(/\/advisor$/);
    await advisor.page.goto("/");
    await expect(advisor.page).toHaveURL(/\/advisor$/);
  } finally {
    await dropRoles(advisor.email);
  }
});

test("someone with a single role gets no switcher", async ({ advisor }) => {
  await advisor.page.goto("/advisor");
  await expect(advisor.page.getByRole("navigation", { name: "Switch workspace" })).toHaveCount(0);
});

test("a forged last-role cookie grants nothing", async ({ advisor }) => {
  await advisor.page.goto("/advisor");
  await advisor.page
    .context()
    .addCookies([{ name: "last_role", value: "admin", url: advisor.page.url() }]);
  await advisor.page.goto("/");
  await expect(advisor.page).toHaveURL(/\/advisor$/);
  expect((await advisor.page.goto("/admin"))?.status()).toBe(404);
});

test("a founder who is also an advisor can't request a meeting with themselves", async ({
  advisor,
  otherAdvisor,
}) => {
  try {
    await alsoFounder(advisor);
    await advisor.page.goto("/founder");

    // The directory lists other advisors, never the person's own profile.
    await expect(advisor.page.getByRole("heading", { name: otherAdvisor.row.name })).toBeVisible();
    await expect(advisor.page.getByRole("heading", { name: advisor.row.name })).toHaveCount(0);

    const own = await advisor.page.goto(`/founder/advisors/${advisor.row.id}`);
    expect(own?.status()).toBe(404);
  } finally {
    await dropRoles(advisor.email);
  }
});

test("an advisor who is also an admin reaches both workspaces", async ({ advisor }) => {
  try {
    await alsoAdmin(advisor);

    await advisor.page.goto("/");
    await expect(advisor.page).toHaveURL(/\/admin$/);
    await advisor.page.getByRole("button", { name: "Advisor view" }).click();
    await expect(advisor.page).toHaveURL(/\/advisor$/);
    await expect(advisor.page.getByRole("button", { name: "Admin view" })).toBeVisible();

    await advisor.page.getByRole("button", { name: "Admin view" }).click();
    await expect(advisor.page).toHaveURL(/\/admin$/);
    await expect(advisor.page.getByRole("button", { name: "Advisor view" })).toBeVisible();
  } finally {
    await dropRoles(advisor.email);
  }
});

test("changing the email on one role moves every role with it", async ({
  admin,
  advisor,
}, testInfo) => {
  const newEmail = addedEmail(testInfo.workerIndex);
  try {
    await alsoFounder(advisor);
    await alsoAdmin(advisor);

    const row = await memberRow(admin.page, "advisor", advisor.email);
    const form = await openEdit(row);
    await form.getByLabel("Slack email").fill(newEmail);
    await form.getByRole("button", { name: "Save" }).click();
    // The row leaves this filtered list once its email changes, so check the
    // database rather than the form's status line.
    await expect
      .poll(() => db().admin.count({ where: { email: newEmail } }))
      .toBe(1);

    expect(await db().advisor.count({ where: { email: newEmail } })).toBe(1);
    expect(await db().founder.count({ where: { email: newEmail } })).toBe(1);
    expect(await db().admin.count({ where: { email: newEmail } })).toBe(1);
    expect(await db().founder.count({ where: { email: advisor.email } })).toBe(0);
    expect(await db().admin.count({ where: { email: advisor.email } })).toBe(0);
  } finally {
    await dropRoles(newEmail);
    await dropRoles(advisor.email);
    // Hand the fixture its own email back so it cleans up as usual.
    await db().advisor.updateMany({
      where: { id: advisor.row.id },
      data: { email: advisor.email },
    });
  }
});

test("an email change is refused when another role of the person can't move", async ({
  admin,
  advisor,
}, testInfo) => {
  const newEmail = addedEmail(testInfo.workerIndex);
  try {
    await alsoFounder(advisor);
    // Someone else is already a founder under the new address.
    await db().founder.create({
      data: { name: "E2E Taken Founder", email: newEmail, company: "E2E Co" },
    });

    const row = await memberRow(admin.page, "advisor", advisor.email);
    const form = await openEdit(row);
    await form.getByLabel("Slack email").fill(newEmail);
    await form.getByRole("button", { name: "Save" }).click();
    await expect(status(form)).toContainText("already has a founder role");

    // Nothing moved.
    expect(await db().advisor.count({ where: { email: advisor.email } })).toBe(1);
    expect(await db().founder.count({ where: { email: advisor.email } })).toBe(1);
  } finally {
    await dropRoles(newEmail);
    await dropRoles(advisor.email);
  }
});

test("deactivating one role leaves the other working", async ({ admin, advisor }) => {
  try {
    await alsoFounder(advisor);

    const row = await memberRow(admin.page, "founder", advisor.email);
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row.getByRole("button", { name: "Reactivate" })).toBeVisible();

    await advisor.page.goto("/founder");
    await expect(advisor.page).not.toHaveURL(/\/founder$/);
    await advisor.page.goto("/advisor");
    await expect(advisor.page).toHaveURL(/\/advisor$/);
    await expect(advisor.page.getByRole("navigation", { name: "Switch workspace" })).toHaveCount(0);
  } finally {
    await dropRoles(advisor.email);
  }
});
