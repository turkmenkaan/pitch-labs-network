import { db, expect, test } from "./fixtures";
import { anHourAgo, createRequest, uniqueTopic } from "./helpers/data";
import {
  addForm,
  memberRow,
  openEdit,
  purgeTestMembers,
  skipBrowserChecks,
} from "./helpers/members";

test.afterEach(async ({}, testInfo) => {
  await purgeTestMembers(testInfo.workerIndex);
});

test("every member action leaves one audit entry naming who did what", async ({
  admin,
  stranger,
}) => {
  // Member: add, edit, deactivate, reactivate.
  await admin.page.goto("/admin/members?type=founder");
  const add = addForm(admin.page);
  await add.getByLabel("Name").fill("E2E Audited Founder");
  await add.getByLabel("Slack email").fill(stranger.email);
  await add.getByRole("button", { name: "Add founder" }).click();
  await expect(add.getByRole("status")).toContainText("added.");

  const row = await memberRow(admin.page, "founder", stranger.email);
  const edit = await openEdit(row);
  await edit.getByLabel("Name").fill("E2E Audited Renamed");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByRole("status")).toContainText("Saved.");
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row.getByRole("button", { name: "Reactivate" })).toBeVisible();
  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();

  // View as.
  await row.getByRole("button", { name: "View as" }).click();
  await admin.page.getByRole("button", { name: "Exit preview" }).click();

  const entries = await db().auditLog.findMany({
    where: { adminId: admin.row.id },
    orderBy: { createdAt: "asc" },
  });
  expect(entries.map((e) => e.action)).toEqual([
    "member.create",
    "member.update",
    "member.deactivate",
    "member.reactivate",
    "member.view_as",
  ]);
  expect(entries.every((e) => e.adminName === admin.row.name)).toBe(true);
  expect(entries[0].detail).toBe(`Added founder E2E Audited Founder <${stranger.email}>`);

  await admin.page.goto("/admin/audit");
  const mine = admin.page.locator("tr", { hasText: admin.row.name });
  await expect(mine.filter({ hasText: "member.deactivate" })).toContainText(
    "Deactivated founder E2E Audited Renamed"
  );
});

test("admin changes and rulings are logged", async ({ admin, founder, advisor, stranger }) => {
  // Add and remove an admin.
  await admin.page.goto("/admin/admins");
  const form = addForm(admin.page);
  await form.getByLabel("Name").fill("E2E Logged Admin");
  await form.getByLabel("Slack email").fill(stranger.email);
  await form.getByRole("button", { name: "Add admin" }).click();
  await expect(form.getByRole("status")).toContainText("is now an admin.");
  const adminRow = admin.page.locator("tr", { hasText: stranger.email });
  await adminRow.getByRole("button", { name: "Remove" }).click();
  await expect(adminRow).toHaveCount(0);

  // Rule on a conflict.
  const topic = uniqueTopic("Logged ruling");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
    scheduledAt: anHourAgo(),
    advisorMet: true,
    founderMet: false,
  });
  await db().adminNotification.create({
    data: {
      type: "MEETING_CONFLICT",
      message: "Advisor and founder disagree.",
      meetingRequestId: request.id,
    },
  });
  await admin.page.goto("/admin/conflicts");
  const kase = admin.page.locator("article.adm-case", { hasText: topic });
  await kase.getByLabel("It happened").check();
  await kase.getByPlaceholder(/Why/).fill("Both calendars agree.");
  await kase.getByRole("button", { name: "Resolve" }).click();
  // A ruled conflict leaves the "awaiting a ruling" list.
  await expect(kase).toHaveCount(0);

  const entries = await db().auditLog.findMany({
    where: { adminId: admin.row.id },
    orderBy: { createdAt: "asc" },
  });
  expect(entries.map((e) => e.action)).toEqual([
    "admin.add",
    "admin.remove",
    "conflict.resolve",
  ]);
  expect(entries[2].detail).toBe(`Ruled "${topic}" did happen: Both calendars agree.`);
});

test("saving a member without changes writes no audit entry", async ({ admin, founder }) => {
  const row = await memberRow(admin.page, "founder", founder.email);
  const form = await openEdit(row);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("status")).toContainText("Saved.");

  expect(await db().auditLog.count({ where: { adminId: admin.row.id } })).toBe(0);
});

test("a refused action leaves no audit entry", async ({ admin, founder }) => {
  const row = await memberRow(admin.page, "founder", founder.email);
  const form = await openEdit(row);
  await skipBrowserChecks(form);
  await form.getByLabel("Name").fill("");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("status")).toContainText("Name is required.");

  expect(await db().auditLog.count({ where: { adminId: admin.row.id } })).toBe(0);
});

test.describe("activity", () => {
  test("the filters narrow requests and the ledger counts hours", async ({
    admin,
    founder,
    advisor,
  }) => {
    const pending = uniqueTopic("Activity pending");
    const accepted = uniqueTopic("Activity accepted");
    const withdrawn = uniqueTopic("Activity withdrawn");
    await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id, topic: pending });
    await createRequest({
      advisorId: advisor.row.id,
      founderId: founder.row.id,
      topic: accepted,
      hours: 2,
      status: "ACCEPTED",
    });
    await createRequest({
      advisorId: advisor.row.id,
      founderId: founder.row.id,
      topic: withdrawn,
      status: "WITHDRAWN",
    });

    const base = `/admin/activity?advisor=${advisor.row.id}`;
    await admin.page.goto(base);
    for (const topic of [pending, accepted, withdrawn]) {
      await expect(admin.page.getByText(topic)).toBeVisible();
    }

    // 10h offered, 2h accepted, 1 still pending.
    const ledger = admin.page.locator("tr", { hasText: advisor.row.name }).first();
    await expect(ledger).toContainText("10h");
    await expect(ledger).toContainText("2h");
    await expect(ledger).toContainText("8h");

    await admin.page.goto(`${base}&status=PENDING`);
    await expect(admin.page.getByText(pending)).toBeVisible();
    await expect(admin.page.getByText(accepted)).toHaveCount(0);
    await expect(admin.page.getByText(withdrawn)).toHaveCount(0);

    await admin.page.goto(`${base}&status=ACCEPTED&founder=${founder.row.id}`);
    await expect(admin.page.getByText(accepted)).toBeVisible();
    await expect(admin.page.getByText(pending)).toHaveCount(0);
  });

  test("a ruled conflict moves from 'awaiting a ruling' to 'resolved'", async ({
    admin,
    founder,
    advisor,
  }) => {
    const topic = uniqueTopic("Conflict list");
    const request = await createRequest({
      advisorId: advisor.row.id,
      founderId: founder.row.id,
      topic,
      status: "ACCEPTED",
      scheduledAt: anHourAgo(),
      advisorMet: true,
      founderMet: false,
    });
    await db().adminNotification.create({
      data: {
        type: "MEETING_CONFLICT",
        message: "Advisor and founder disagree.",
        meetingRequestId: request.id,
      },
    });

    await admin.page.goto("/admin/conflicts");
    await expect(admin.page.locator("article.adm-case", { hasText: topic })).toBeVisible();

    await db().adminNotification.updateMany({
      where: { meetingRequestId: request.id },
      data: { resolved: true, resolvedAt: new Date(), resolutionNote: "Settled." },
    });
    await admin.page.reload();
    await expect(admin.page.locator("article.adm-case", { hasText: topic })).toHaveCount(0);
    await expect(admin.page.locator("tr", { hasText: topic })).toContainText("Settled.");
  });
});
