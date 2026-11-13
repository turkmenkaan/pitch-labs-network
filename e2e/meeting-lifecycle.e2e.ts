import { DEFAULT_MONTHLY_HOURS } from "../lib/guardrails";
import { db, expect, test } from "./fixtures";
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
  await request.getByPlaceholder(/optional note/i).fill("Not a fit this month.");
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
