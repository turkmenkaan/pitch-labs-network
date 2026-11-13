import { db, expect, test } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card } from "./helpers/flows";
import { memberRow } from "./helpers/members";

const banner = (page: import("@playwright/test").Page) => page.locator(".preview-bar");

test("an admin previews the founder workspace, and it is recorded", async ({
  admin,
  founder,
}) => {
  const row = await memberRow(admin.page, "founder", founder.email);
  await row.getByRole("button", { name: "View as" }).click();

  await expect(admin.page).toHaveURL(/\/founder$/);
  await expect(banner(admin.page)).toContainText(
    `Previewing as ${founder.row.name} (founder) · read-only`
  );
  await expect(
    admin.page.getByRole("heading", { name: `Find an advisor, ${founder.row.name.split(" ")[0]}.` })
  ).toBeVisible();

  await admin.page.goto("/admin/audit");
  await expect(
    admin.page.locator("tr", { hasText: admin.row.name }).filter({ hasText: "member.view_as" })
  ).toContainText(`Started a read-only preview as founder ${founder.row.name}`);
});

test("an admin previews the advisor workspace and sees that advisor's requests", async ({
  admin,
  advisor,
  founder,
}) => {
  const topic = uniqueTopic("Seen in preview");
  await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id, topic });

  const row = await memberRow(admin.page, "advisor", advisor.email);
  await row.getByRole("button", { name: "View as" }).click();

  await expect(admin.page).toHaveURL(/\/advisor$/);
  await expect(banner(admin.page)).toContainText(`Previewing as ${advisor.row.name} (advisor)`);
  await expect(card(admin.page, topic)).toBeVisible();
});

test("exiting a preview returns to the admin area", async ({ admin, founder }) => {
  const row = await memberRow(admin.page, "founder", founder.email);
  await row.getByRole("button", { name: "View as" }).click();
  await expect(banner(admin.page)).toBeVisible();

  await banner(admin.page).getByRole("button", { name: "Exit preview" }).click();
  await expect(admin.page).toHaveURL(/\/admin$/);

  await admin.page.goto("/founder");
  await expect(banner(admin.page)).toHaveCount(0);
  await expect(admin.page).toHaveURL(/\/admin$/); // back to the admin's own home
});

const blocked = "You're previewing as an admin, so changes are disabled.";

test("previewing an advisor can't accept a request: the server refuses", async ({
  admin,
  advisor,
  founder,
}) => {
  const topic = uniqueTopic("Preview accept");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
  });

  const row = await memberRow(admin.page, "advisor", advisor.email);
  await row.getByRole("button", { name: "View as" }).click();
  await expect(banner(admin.page)).toBeVisible();

  // The button is greyed out and unclickable, so fire the event past the CSS.
  await card(admin.page, topic)
    .getByRole("button", { name: "Accept", exact: true })
    .dispatchEvent("click");
  await expect(card(admin.page, topic)).toContainText(blocked);
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status
  ).toBe("PENDING");
});

test("previewing a founder can't send a request: the server refuses", async ({
  admin,
  advisor,
  founder,
}) => {
  const row = await memberRow(admin.page, "founder", founder.email);
  await row.getByRole("button", { name: "View as" }).click();
  await expect(banner(admin.page)).toBeVisible();

  const topic = uniqueTopic("Preview send");
  await admin.page.goto(`/founder/advisors/${advisor.row.id}`);
  await admin.page.getByLabel(/^topic/i).fill(topic);
  await admin.page.getByLabel(/^message/i).fill("Should not be sent.");
  await admin.page.getByRole("button", { name: "Send meeting request" }).dispatchEvent("click");
  await expect(admin.page.getByText(blocked)).toBeVisible();
  expect(await db().meetingRequest.count({ where: { topic } })).toBe(0);
});

test("faking the preview cookie gives a non-admin nothing", async ({
  founder,
  advisor,
  baseURL,
}) => {
  await founder.page.context().addCookies([
    { name: "view_as", value: `advisor:${advisor.row.id}`, url: baseURL! },
  ]);

  await founder.page.goto("/founder");
  await expect(banner(founder.page)).toHaveCount(0);
  await expect(founder.page).toHaveURL(/\/founder$/);

  // Still the founder's own workspace, never the advisor's.
  await founder.page.goto("/advisor");
  await expect(founder.page).toHaveURL(/\/founder$/);
  expect((await founder.page.goto("/admin"))?.status()).toBe(404);
});
