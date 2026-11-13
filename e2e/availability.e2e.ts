import { db, expect, test } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card, sendRequest } from "./helpers/flows";

const accept = { name: "Accept", exact: true } as const;

test("accepting needs availability set for the month", async ({ founder, advisor }) => {
  await db().monthlyAvailability.deleteMany({ where: { advisorId: advisor.row.id } });
  const topic = uniqueTopic("No hours set");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
  });

  await advisor.page.goto("/advisor");
  await card(advisor.page, topic).getByRole("button", accept).click();

  await expect(card(advisor.page, topic)).toContainText(
    "Set your availability for this month before accepting."
  );
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status
  ).toBe("PENDING");
});

test("accepting is refused when it would exceed the hours left", async ({
  founder,
  advisor,
}) => {
  await db().monthlyAvailability.updateMany({
    where: { advisorId: advisor.row.id },
    data: { totalHours: 2 },
  });
  const topic = uniqueTopic("Too many hours");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    hours: 3,
  });

  await advisor.page.goto("/advisor");
  await card(advisor.page, topic).getByRole("button", accept).click();

  await expect(card(advisor.page, topic)).toContainText(
    "2h remaining, this needs 3h."
  );
  expect(
    (await db().meetingRequest.findUniqueOrThrow({ where: { id: request.id } })).status
  ).toBe("PENDING");
});

test("accepting draws down the hours the advisor and founders see", async ({
  founder,
  advisor,
}) => {
  const topic = uniqueTopic("Draw down");
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    hours: 2,
  });

  await advisor.page.goto("/advisor");
  await expect(advisor.page.locator(".gauge .big")).toHaveText("10");
  await card(advisor.page, topic).getByRole("button", accept).click();

  await expect(advisor.page.locator(".gauge .big")).toHaveText("8");
  await expect(advisor.page.locator(".gauge-caption")).toContainText(
    "2h committed to accepted meetings"
  );

  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await expect(founder.page.getByText("8 of 10h free")).toBeVisible();
});

test("an advisor can't set their hours below what is already committed", async ({
  founder,
  advisor,
}) => {
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    hours: 3,
    status: "ACCEPTED",
  });

  await advisor.page.goto("/advisor");
  // The field's own minimum would stop this in the browser; the server must too.
  await advisor.page
    .locator("form.avail-form")
    .evaluate((form) => ((form as HTMLFormElement).noValidate = true));
  await advisor.page.getByLabel(/hours i can give/i).fill("2");
  await advisor.page.getByRole("button", { name: "Save availability" }).click();
  await expect(
    advisor.page.getByText(
      "You've already committed 3h to accepted meetings this month. Set 3h or more."
    )
  ).toBeVisible();

  await advisor.page.getByLabel(/hours i can give/i).fill("5");
  await advisor.page.getByRole("button", { name: "Save availability" }).click();
  await expect(advisor.page.getByText("Availability updated.")).toBeVisible();
  await expect(advisor.page.locator(".gauge .big")).toHaveText("2");
});

test("a founder can still send a request to an advisor with no hours open", async ({
  founder,
  advisor,
}) => {
  await db().monthlyAvailability.deleteMany({ where: { advisorId: advisor.row.id } });

  await founder.page.goto("/founder");
  await expect(
    founder.page.locator("a.advisor-card", { hasText: advisor.row.name })
  ).toContainText("No hours set");

  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await expect(
    founder.page.getByText(
      "This advisor has no hours open this month, so your request may wait."
    )
  ).toBeVisible();

  const topic = uniqueTopic("Waiting");
  await sendRequest(founder.page, advisor.row.id, { topic });

  await advisor.page.goto("/advisor");
  await expect(card(advisor.page, topic).locator(".pill")).toHaveText("Pending");
});
