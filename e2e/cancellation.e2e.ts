import type { Page } from "@playwright/test";
import { db, expect, test } from "./fixtures";
import { anHourAgo, createRequest, uniqueTopic } from "./helpers/data";
import { card, sendRequest, usageMeter } from "./helpers/flows";
import { memberRow } from "./helpers/members";
import { DEFAULT_MONTHLY_HOURS } from "../lib/guardrails";

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);
const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

// Opens the card's "Cancel meeting" confirmation, gives a reason and confirms.
async function cancelFrom(page: Page, topic: string, reason = "Something came up.") {
  const meeting = card(page, topic);
  await meeting.getByText("Cancel meeting", { exact: true }).click();
  await meeting.getByLabel(/^Reason/).fill(reason);
  await meeting.getByRole("button", { name: "Yes, cancel meeting" }).click();
}

// The advisor dashboard's "hours remaining" number.
const hoursRemaining = (page: Page) => page.locator(".gauge .big");

test("an advisor cancels an accepted meeting and the hours go back to both sides", async ({
  advisor,
  founder,
  admin,
}) => {
  const topic = uniqueTopic("Advisor cancels");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    hours: 2,
    status: "ACCEPTED",
  });

  await advisor.page.goto("/advisor");
  await expect(hoursRemaining(advisor.page)).toHaveText("8");
  await founder.page.goto("/founder/meetings");
  await expect(usageMeter(founder.page)).toContainText(`2 of ${DEFAULT_MONTHLY_HOURS} hours`);

  await cancelFrom(advisor.page, topic, "I'm travelling that week.");

  // Advisor: the meeting moves to Cancelled and the 2 hours are free again.
  await expect(advisor.page.locator("article.meeting", { hasText: topic })).toHaveCount(0);
  await expect(card(advisor.page, topic)).toContainText("You cancelled this meeting.");
  await expect(hoursRemaining(advisor.page)).toHaveText("10");

  // Founder: told who cancelled, and the quota is back.
  await founder.page.reload();
  await expect(card(founder.page, topic).locator(".pill")).toHaveText("Cancelled");
  await expect(card(founder.page, topic)).toContainText(
    `${advisor.row.name} cancelled this meeting.`
  );
  await expect(card(founder.page, topic)).toContainText("Reason: “I'm travelling that week.”");
  await expect(usageMeter(founder.page)).toContainText(`0 of ${DEFAULT_MONTHLY_HOURS} hours`);

  const stored = await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } });
  expect(stored).toMatchObject({
    status: "CANCELLED",
    cancelledBy: "advisor",
    cancelReason: "I'm travelling that week.",
  });
  expect(stored.cancelledAt).not.toBeNull();

  // Admins can find it under Activity.
  await admin.page.goto(`/admin/activity?status=CANCELLED&advisor=${advisor.row.id}`);
  await expect(admin.page.locator("tr", { hasText: topic })).toContainText("cancelled");
});

test("a founder cancels a scheduled meeting and can book that time again", async ({
  advisor,
  founder,
}) => {
  const topic = uniqueTopic("Founder cancels");
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    hours: DEFAULT_MONTHLY_HOURS,
    status: "ACCEPTED",
    scheduledAt: tomorrow(),
  });

  // All the monthly hours are in this one meeting, so the form is closed.
  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await expect(founder.page.getByRole("button", { name: "Send meeting request" })).toHaveCount(0);

  await founder.page.goto("/founder/meetings");
  await cancelFrom(founder.page, topic, "Our launch moved.");
  await expect(card(founder.page, topic).locator(".pill")).toHaveText("Cancelled");
  await expect(card(founder.page, topic)).toContainText("You cancelled this meeting.");
  await expect(usageMeter(founder.page)).toContainText(`0 of ${DEFAULT_MONTHLY_HOURS} hours`);

  // The hours and the call are free again, so a new request goes through.
  await sendRequest(founder.page, advisor.row.id, {
    topic: uniqueTopic("Booked after cancelling"),
    hours: 1,
  });

  // The advisor sees who cancelled, and the hours are theirs again.
  await advisor.page.goto("/advisor");
  await expect(card(advisor.page, topic)).toContainText(`${founder.row.name} cancelled this meeting.`);
  await expect(card(advisor.page, topic)).toContainText("Reason: “Our launch moved.”");
  await expect(hoursRemaining(advisor.page)).toHaveText("10");
});

test("a meeting can be cancelled until it happens, not after", async ({ advisor, founder }) => {
  const started = uniqueTopic("Already started");
  const answered = uniqueTopic("Already answered");
  const waiting = uniqueTopic("Still pending");
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic: started,
    status: "ACCEPTED",
    scheduledAt: anHourAgo(),
  });
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic: answered,
    status: "ACCEPTED",
    founderMet: true,
  });
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic: waiting,
    status: "PENDING",
  });

  for (const page of [advisor.page, founder.page]) {
    await page.goto(page === advisor.page ? "/advisor" : "/founder/meetings");
    for (const topic of [started, answered, waiting]) {
      await expect(card(page, topic)).toBeVisible();
      await expect(card(page, topic).getByText("Cancel meeting", { exact: true })).toHaveCount(0);
    }
  }
});

test("the server refuses a cancellation once the time has passed", async ({
  advisor,
  founder,
}) => {
  const topic = uniqueTopic("Time passes");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
    scheduledAt: inAnHour(),
  });

  await advisor.page.goto("/advisor");
  // The page was loaded while the meeting was ahead; then its time goes by.
  await db().meetingRequest.update({
    where: { id: request.id },
    data: { scheduledAt: anHourAgo() },
  });
  await cancelFrom(advisor.page, topic);

  await expect(card(advisor.page, topic)).toContainText("can't be cancelled");
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status
  ).toBe("ACCEPTED");
});

test("cancelling twice from a stale page is refused", async ({ advisor, founder }) => {
  const topic = uniqueTopic("Cancel twice");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  await founder.page.goto("/founder/meetings");
  await advisor.page.goto("/advisor");
  await cancelFrom(advisor.page, topic);
  await expect(card(advisor.page, topic)).toContainText("You cancelled this meeting.");

  await cancelFrom(founder.page, topic);
  await expect(card(founder.page, topic)).toContainText("already cancelled");
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).cancelledBy
  ).toBe("advisor");
});

test("an advisor can't cancel someone else's meeting", async ({
  advisor,
  otherAdvisor,
  founder,
}) => {
  const mine = uniqueTopic("Mine");
  const theirs = await createRequest({
    advisorId: otherAdvisor.row.id,
    founderId: founder.row.id,
    topic: uniqueTopic("Theirs"),
    status: "ACCEPTED",
  });
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic: mine,
    status: "ACCEPTED",
  });

  await advisor.page.goto("/advisor");
  // Point the form at the other advisor's meeting before submitting it.
  await card(advisor.page, mine)
    .locator('input[name="requestId"]')
    .last()
    .evaluate((input, id) => ((input as HTMLInputElement).value = id), theirs.id);
  await cancelFrom(advisor.page, mine);

  await expect(card(advisor.page, mine)).toContainText("Meeting not found.");
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: theirs.id } })).status
  ).toBe("ACCEPTED");
});

test("an admin previewing a member can't cancel for them", async ({ admin, advisor, founder }) => {
  const topic = uniqueTopic("Preview cancel");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  const row = await memberRow(admin.page, "advisor", advisor.email);
  await row.getByRole("button", { name: "View as" }).click();
  await expect(admin.page.locator(".preview-bar")).toBeVisible();

  const meeting = card(admin.page, topic);
  await meeting.getByText("Cancel meeting", { exact: true }).click();
  await meeting.getByLabel(/^Reason/).fill("Previewing only.");
  await meeting.getByRole("button", { name: "Yes, cancel meeting" }).dispatchEvent("click");
  await expect(meeting).toContainText("You're previewing as an admin, so changes are disabled.");
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status
  ).toBe("ACCEPTED");
});

test("cancelling needs a reason", async ({ advisor, founder }) => {
  const topic = uniqueTopic("No reason");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  for (const [page, path] of [
    [advisor.page, "/advisor"],
    [founder.page, "/founder/meetings"],
  ] as const) {
    await page.goto(path);
    const meeting = card(page, topic);
    await meeting.getByText("Cancel meeting", { exact: true }).click();
    // The browser asks for a reason...
    await expect(meeting.getByLabel(/^Reason/)).toHaveAttribute("required", "");
    // ...and the server insists too, for a blank or whitespace-only one.
    await meeting
      .locator("form", { hasText: "Cancel this meeting" })
      .evaluate((f) => ((f as HTMLFormElement).noValidate = true));
    for (const blank of ["", "   "]) {
      await meeting.getByLabel(/^Reason/).fill(blank);
      await meeting.getByRole("button", { name: "Yes, cancel meeting" }).click();
      await expect(meeting).toContainText("Add a reason for cancelling.");
    }
  }
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status
  ).toBe("ACCEPTED");
});

