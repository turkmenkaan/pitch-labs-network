// Agreeing a meeting time: either side proposes up to three times, the other
// picks one or answers with times of their own. Setup goes straight to the
// database (an accepted meeting); everything under test goes through the UI.
import type { Page } from "@playwright/test";
import { db, expect, test } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card, enterAgreedTime, proposeTimes, usageMeter } from "./helpers/flows";
import { memberRow } from "./helpers/members";

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function accepted(
  advisorId: string,
  founderId: string,
  extra: { scheduledAt?: Date } = {}
) {
  const topic = uniqueTopic("Schedule");
  const request = await createRequest({
    advisorId,
    founderId,
    topic,
    status: "ACCEPTED",
    hours: 2,
    ...extra,
  });
  return { topic, request };
}

const slots = (requestId: string) =>
  db().meetingSlot.findMany({ where: { meetingRequestId: requestId }, orderBy: { startsAt: "asc" } });

async function open(page: Page, url: string, topic: string) {
  await page.goto(url);
  const c = card(page, topic);
  await expect(c).toBeVisible();
  return c;
}

test("the advisor proposes times and the founder picks one", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const mine = await open(advisor.page, "/advisor", topic);
  await expect(mine.locator(".pill")).toHaveText("Needs a time");
  await expect(mine).toContainText("All times are in Eastern Time (ET).");
  await proposeTimes(mine, [inDays(2), inDays(3)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");
  await expect(mine).toContainText("Waiting for");

  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(theirs.locator(".pill")).toHaveText("Pick a time");
  const options = theirs.locator("label.slot-option");
  await expect(options).toHaveCount(2);
  const chosen = ((await options.nth(1).textContent()) ?? "").trim();
  await options.nth(1).locator("input").check();
  await theirs.getByRole("button", { name: "Confirm this time" }).click();

  await expect(theirs.locator(".pill")).toHaveText("Upcoming");
  await expect(theirs).toContainText(chosen);
  await advisor.page.reload();
  await expect(card(advisor.page, topic).locator(".pill")).toHaveText("Upcoming");
  await expect(card(advisor.page, topic)).toContainText(chosen);

  // The second proposed time is the meeting's time; the other slot is closed.
  const row = await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } });
  const all = await slots(request.id);
  expect(row.scheduledAt?.getTime()).toBe(all[1].startsAt.getTime());
  expect(all.map((s) => s.status)).toEqual(["SUPERSEDED", "PICKED"]);

  // Agreeing a time doesn't touch the hours held for the meeting.
  await founder.page.goto("/founder");
  await expect(usageMeter(founder.page)).toContainText("2 of");
});

test("the founder can propose first, and the advisor confirms", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(theirs.locator(".pill")).toHaveText("Accepted");
  await proposeTimes(theirs, [inDays(4)]);
  await expect(theirs.locator(".pill")).toHaveText("Waiting on advisor");

  const mine = await open(advisor.page, "/advisor", topic);
  await expect(mine.locator(".pill")).toHaveText("Pick a time");
  await mine.getByRole("button", { name: "Confirm this time" }).click();
  await expect(mine.locator(".pill")).toHaveText("Upcoming");

  await founder.page.reload();
  await expect(card(founder.page, topic).locator(".pill")).toHaveText("Upcoming");
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).scheduledAt
  ).not.toBeNull();
});

test("suggesting other times replaces the proposal", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const mine = await open(advisor.page, "/advisor", topic);
  await proposeTimes(mine, [inDays(2)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");

  const theirs = await open(founder.page, "/founder/meetings", topic);
  await theirs.getByText("None of these work").click();
  await proposeTimes(theirs, [inDays(5), inDays(6)]);
  await expect(theirs.locator(".pill")).toHaveText("Waiting on advisor");

  await advisor.page.reload();
  const again = card(advisor.page, topic);
  await expect(again.locator(".pill")).toHaveText("Pick a time");
  await expect(again.locator("label.slot-option")).toHaveCount(2);

  const all = await slots(request.id);
  expect(all.filter((s) => s.status === "OPEN").map((s) => s.proposedBy)).toEqual([
    "founder",
    "founder",
  ]);
  expect(all.filter((s) => s.status === "SUPERSEDED").map((s) => s.proposedBy)).toEqual(["advisor"]);
});

test("a proposer can change their own proposal", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const mine = await open(advisor.page, "/advisor", topic);
  await proposeTimes(mine, [inDays(2), inDays(3)]);
  await mine.getByText("Change proposed times").click();
  await proposeTimes(mine.locator("details"), [inDays(7)]);

  await expect
    .poll(async () => (await slots(request.id)).filter((s) => s.status === "OPEN").length)
    .toBe(1);
  await open(founder.page, "/founder/meetings", topic);
  await expect(card(founder.page, topic).locator("label.slot-option")).toHaveCount(1);
});

test("bad times are refused", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);
  const mine = await open(advisor.page, "/advisor", topic);

  // Nothing entered: the server refuses even with the browser's checks off.
  await mine.locator("form").first().evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await mine.getByRole("button", { name: "Propose times" }).click();
  await expect(mine).toContainText("Propose at least one time.");

  await proposeTimes(mine, [inDays(-1)]);
  await expect(mine).toContainText("Pick times in the future.");

  await proposeTimes(mine, [inDays(2), inDays(2)]);
  await expect(mine).toContainText("Each proposed time must be different.");

  expect(await slots(request.id)).toHaveLength(0);
});

test("a stale pick is refused once the other side has changed the times", async ({
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const mine = await open(advisor.page, "/advisor", topic);
  await proposeTimes(mine, [inDays(2)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");

  // The founder has the pick form open...
  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(theirs.getByRole("button", { name: "Confirm this time" })).toBeVisible();

  // ...while the advisor replaces the times.
  await mine.getByText("Change proposed times").click();
  await proposeTimes(mine.locator("details"), [inDays(9)]);
  await expect
    .poll(async () => (await slots(request.id)).filter((s) => s.status === "SUPERSEDED").length)
    .toBe(1);

  await theirs.getByRole("button", { name: "Confirm this time" }).click();
  await expect(theirs).toContainText("That time was already taken or withdrawn.");
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).scheduledAt
  ).toBeNull();
});

test("a pick on a meeting that was cancelled is refused", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const mine = await open(advisor.page, "/advisor", topic);
  await proposeTimes(mine, [inDays(2)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");
  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(theirs.getByRole("button", { name: "Confirm this time" })).toBeVisible();

  await mine.getByText("Cancel meeting", { exact: true }).click();
  await mine.getByLabel(/^Reason/).fill("Can't make it this month.");
  await mine.getByRole("button", { name: "Yes, cancel meeting" }).click();
  await expect
    .poll(async () => (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status)
    .toBe("CANCELLED");

  await theirs.getByRole("button", { name: "Confirm this time" }).click();
  await expect(theirs).toContainText("That time was already taken or withdrawn.");
  const row = await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(row).toMatchObject({ status: "CANCELLED", scheduledAt: null });
});

test("entering an agreed time settles any proposal still open", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const mine = await open(advisor.page, "/advisor", topic);
  await proposeTimes(mine, [inDays(2)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");
  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(theirs.getByRole("button", { name: "Confirm this time" })).toBeVisible();

  const agreed = inDays(8);
  await enterAgreedTime(mine, agreed);
  await expect(mine.locator(".pill")).toHaveText("Upcoming");

  await theirs.getByRole("button", { name: "Confirm this time" }).click();
  await expect(theirs).toContainText("That time was already taken or withdrawn.");
  const row = await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(Math.abs(row.scheduledAt!.getTime() - agreed.getTime())).toBeLessThan(2 * 60 * 1000);
  expect((await slots(request.id)).every((s) => s.status === "SUPERSEDED")).toBe(true);
});

test("rescheduling keeps the current time until a new one is agreed", async ({
  advisor,
  founder,
}) => {
  const original = inDays(2);
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: original,
  });

  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(theirs.locator(".pill")).toHaveText("Upcoming");
  await theirs.getByText("Propose a new time").click();
  await proposeTimes(theirs, [inDays(5)]);
  await expect(theirs).toContainText("Waiting for");

  // Still Upcoming at the old time while the new one is pending.
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).scheduledAt
  ).toEqual(original);

  const mine = await open(advisor.page, "/advisor", topic);
  await expect(mine.locator(".pill")).toHaveText("Upcoming");
  await expect(mine.getByRole("button", { name: "Reschedule", exact: true })).toHaveCount(0);
  await mine.getByRole("button", { name: "Confirm this time" }).click();

  await expect
    .poll(async () =>
      (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).scheduledAt?.getTime()
    )
    .not.toBe(original.getTime());
  const all = await slots(request.id);
  expect(all.map((s) => s.status)).toEqual(["PICKED"]);
});

test("previewing a member can't propose or pick: the server refuses", async ({
  admin,
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);
  const blocked = "You're previewing as an admin, so changes are disabled.";

  const row = await memberRow(admin.page, "founder", founder.email);
  await row.getByRole("button", { name: "View as" }).click();
  await expect(admin.page.locator(".preview-bar")).toBeVisible();
  await admin.page.goto("/founder/meetings");
  const c = card(admin.page, topic);
  // The form's own checks would stop an empty submit; the server is under test.
  await c.locator("form").first().evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await c.getByRole("button", { name: "Propose times" }).dispatchEvent("click");
  await expect(c).toContainText(blocked);
  expect(await slots(request.id)).toHaveLength(0);
});
