import type { Page } from "@playwright/test";
import { DEFAULT_MONTHLY_HOURS } from "../lib/guardrails";
import { db, expect, test } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card, datetimeLocal, sendRequest, usageMeter } from "./helpers/flows";

test("a request goes from sent to accepted, scheduled and confirmed by both sides", async ({
  founder,
  advisor,
}) => {
  const topic = `Lifecycle ${Date.now()}`;
  const feedback = "We covered pricing and the next three experiments.";

  // The founder sends a request.
  await sendRequest(founder.page, advisor.row.id, { topic });

  // The advisor sees it and accepts.
  await advisor.page.goto("/advisor");
  await card(advisor.page, topic)
    .getByRole("button", { name: "Accept", exact: true })
    .click();
  const meeting = advisor.page.locator("article.meeting", { hasText: topic });
  await expect(meeting.locator(".pill")).toHaveText("Needs a time");

  // The advisor records a time. The app only allows a future time.
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  await meeting.locator('input[name="scheduledAt"]').fill(datetimeLocal(inTwoDays));
  await meeting.getByRole("button", { name: "Set time" }).click();
  await expect(meeting.locator(".pill")).toHaveText("Upcoming");

  // Time travel: the app has no clock to fake, so move the meeting into the past.
  const request = await db().meetingRequest.findFirstOrThrow({
    where: { advisorId: advisor.row.id, topic },
  });
  await db().meetingRequest.update({
    where: { id: request.id },
    data: { scheduledAt: new Date(Date.now() - 60 * 60 * 1000) },
  });

  // The advisor confirms it happened and leaves feedback.
  await advisor.page.reload();
  await expect(meeting.locator(".pill")).toHaveText("Did it happen?");
  await meeting.getByRole("button", { name: "Yes, we met" }).click();
  await expect(meeting.locator(".pill")).toHaveText("Add feedback");
  await meeting.getByRole("button", { name: "4 stars" }).click();
  await meeting.getByPlaceholder(/what did you cover/i).fill(feedback);
  await meeting.getByRole("button", { name: "Submit feedback" }).click();
  await expect(meeting.locator(".pill")).toHaveText("Completed");
  await expect(meeting).toContainText(feedback);

  // The founder confirms their side.
  await founder.page.goto("/founder/meetings");
  const mine = card(founder.page, topic);
  await expect(mine.locator(".pill")).toHaveText("Did it happen?");
  await mine.getByRole("button", { name: "Yes, we met" }).click();
  await expect(mine.locator(".pill")).toHaveText("Completed");
  await expect(mine).toContainText("You both confirmed this meeting took place.");

  const done = await db().meetingRequest.findUniqueOrThrow({
    where: { id: request.id },
  });
  expect(done).toMatchObject({
    status: "ACCEPTED",
    advisorMet: true,
    founderMet: true,
    advisorRating: 4,
    advisorFeedback: feedback,
  });
});

test("a declined request gives the hours back", async ({ founder, advisor }) => {
  const topic = `Declined ${Date.now()}`;

  await sendRequest(founder.page, advisor.row.id, { topic, hours: 2 });
  await founder.page.goto("/founder");
  await expect(usageMeter(founder.page)).toContainText(
    `2 of ${DEFAULT_MONTHLY_HOURS} hours`
  );

  await advisor.page.goto("/advisor");
  const request = card(advisor.page, topic);
  await request.getByLabel("Note to the founder").fill("Not a fit this month.");
  await request.getByRole("button", { name: "Reject" }).click();
  await expect(request.locator(".pill")).toHaveText("Rejected");

  await founder.page.goto("/founder");
  await expect(usageMeter(founder.page)).toContainText(
    `0 of ${DEFAULT_MONTHLY_HOURS} hours`
  );
  await founder.page.goto("/founder/meetings");
  await expect(card(founder.page, topic).locator(".pill")).toHaveText("Declined");
  await expect(card(founder.page, topic)).toContainText("Not a fit this month.");
});

test("declining needs a reason, and nothing changes without one", async ({
  founder,
  advisor,
}) => {
  const topic = uniqueTopic("Decline no reason");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    hours: 2,
  });

  await advisor.page.goto("/advisor");
  const pending = card(advisor.page, topic);
  for (const blank of ["", "   "]) {
    await pending.getByLabel("Note to the founder").fill(blank);
    await pending.getByRole("button", { name: "Reject" }).click();
    await expect(pending).toContainText("Add a reason for declining.");
  }
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status
  ).toBe("PENDING");

  // A note is still optional when accepting.
  await pending.getByRole("button", { name: "Accept" }).click();
  await expect(pending.locator(".pill")).not.toHaveText("Pending");
});

test("a withdrawn request gives the hours back", async ({ founder, advisor }) => {
  const topic = `Withdrawn ${Date.now()}`;

  await sendRequest(founder.page, advisor.row.id, { topic, hours: 2 });
  await founder.page.goto("/founder");
  await expect(usageMeter(founder.page)).toContainText(
    `2 of ${DEFAULT_MONTHLY_HOURS} hours`
  );

  await founder.page.goto("/founder/meetings");
  const request = card(founder.page, topic);
  await request.getByRole("button", { name: "Withdraw request" }).click();
  await expect(request.locator(".pill")).toHaveText("Withdrawn");

  await founder.page.goto("/founder");
  await expect(usageMeter(founder.page)).toContainText(
    `0 of ${DEFAULT_MONTHLY_HOURS} hours`
  );
});

test.describe("meeting times are in Eastern Time", () => {
  // The test server runs in UTC, as Vercel does, so a time typed as Eastern
  // wall-clock only comes out right if the server reads it as Eastern.
  async function acceptedMeeting(advisorId: string, founderId: string) {
    const topic = uniqueTopic("Eastern");
    await createRequest({ advisorId, founderId, topic, status: "ACCEPTED" });
    return topic;
  }

  test("a time later today can be scheduled, and is kept as the right moment", async ({
    advisor,
    founder,
  }) => {
    const topic = await acceptedMeeting(advisor.row.id, founder.row.id);
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000);

    await advisor.page.goto("/advisor");
    const meeting = advisor.page.locator("article.meeting", { hasText: topic });
    await expect(meeting).toContainText("All times are in Eastern Time (ET).");
    await meeting.locator('input[name="scheduledAt"]').fill(datetimeLocal(inAnHour));
    await meeting.getByRole("button", { name: "Set time" }).click();

    // Accepted as a future time, not rejected or treated as already started.
    await expect(meeting.locator(".pill")).toHaveText("Upcoming");
    await expect(meeting).toContainText(/ ET\b/);
    const stored = await db().meetingRequest.findFirstOrThrow({ where: { topic } });
    expect(Math.abs(stored.scheduledAt!.getTime() - inAnHour.getTime())).toBeLessThan(2 * 60 * 1000);

    // The founder sees the same time, labelled Eastern.
    await founder.page.goto("/founder/meetings");
    await expect(card(founder.page, topic).locator(".pill")).toHaveText("Upcoming");
    await expect(card(founder.page, topic)).toContainText(/ ET\b/);
  });

  test("a time that has already passed is refused", async ({ advisor, founder }) => {
    const topic = await acceptedMeeting(advisor.row.id, founder.row.id);
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await advisor.page.goto("/advisor");
    const meeting = advisor.page.locator("article.meeting", { hasText: topic });
    await meeting.locator('input[name="scheduledAt"]').fill(datetimeLocal(anHourAgo));
    await meeting.getByRole("button", { name: "Set time" }).click();

    await expect(meeting).toContainText("Pick a time in the future.");
    expect(
      (await db().meetingRequest.findFirstOrThrow({ where: { topic } })).scheduledAt
    ).toBeNull();
  });
});

test.describe("a request the founder withdraws", () => {
  // The founder sends a request, the advisor opens their dashboard, and then the
  // founder withdraws it while that dashboard is still open.
  async function withdrawnBehindTheirBack(
    founder: Page,
    advisor: Page,
    advisorId: string
  ) {
    const topic = uniqueTopic("Withdrawn live");
    await sendRequest(founder, advisorId, { topic });
    await advisor.goto("/advisor");
    await expect(card(advisor, topic)).toBeVisible();

    await founder.goto("/founder/meetings");
    await card(founder, topic).getByRole("button", { name: "Withdraw request" }).click();
    await expect(card(founder, topic).locator(".pill")).toHaveText("Withdrawn");
    return topic;
  }

  test("leaves the advisor's open dashboard when they come back to it", async ({
    founder,
    advisor,
  }) => {
    const topic = await withdrawnBehindTheirBack(founder.page, advisor.page, advisor.row.id);

    // The advisor switches back to the tab: no reload needed.
    await advisor.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(card(advisor.page, topic)).toHaveCount(0);
    await expect(advisor.page.getByText("0 awaiting your decision")).toBeVisible();
  });

  test("can't be accepted or declined, and the advisor is told why", async ({
    founder,
    advisor,
  }) => {
    const topic = await withdrawnBehindTheirBack(founder.page, advisor.page, advisor.row.id);

    const pending = card(advisor.page, topic);
    await pending.getByRole("button", { name: "Accept" }).click();
    await expect(pending).toContainText("The founder withdrew this request");

    await pending.getByLabel("Note to the founder").fill("Sorry, not a fit.");
    await pending.getByRole("button", { name: "Reject" }).click();
    await expect(pending).toContainText("The founder withdrew this request");

    const stored = await db().meetingRequest.findFirstOrThrow({ where: { topic } });
    expect(stored.status).toBe("WITHDRAWN");
  });
});
