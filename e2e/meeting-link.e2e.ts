// The video call link on an accepted meeting. Either side can add one once a
// time is agreed; whoever added it owns it; an advisor's default link is copied
// onto each meeting they accept. Setup goes straight to the database; everything
// under test goes through the UI.
import type { Locator, Page } from "@playwright/test";
import { db, expect, test } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card, sendRequest } from "./helpers/flows";
import { memberRow } from "./helpers/members";

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const ZOOM = "https://us02web.zoom.us/j/123456789?pwd=abc";
const MEET = "https://meet.google.com/abc-defg-hij";

async function accepted(
  advisorId: string,
  founderId: string,
  extra: { scheduledAt?: Date | null } = {}
) {
  const topic = uniqueTopic("Link");
  const request = await createRequest({
    advisorId,
    founderId,
    topic,
    status: "ACCEPTED",
    ...extra,
  });
  return { topic, request };
}

const row = (id: string) => db().meetingRequest.findUniqueOrThrow({ where: { id } });
const join = (c: Locator) => c.getByRole("link", { name: "Join video call" });
const linkField = (c: Locator) => c.getByLabel("Video call link");

async function open(page: Page, url: string, topic: string) {
  await page.goto(url);
  const c = card(page, topic);
  await expect(c).toBeVisible();
  return c;
}

// The browser rejects bad URLs itself; switch that off so the server is under test.
const skipBrowserChecks = (c: Locator) =>
  c.locator('form:has(input[name="meetingUrl"])').evaluate(
    (f) => ((f as HTMLFormElement).noValidate = true)
  );

test("an advisor adds a link once a time is agreed, and the founder can join", async ({
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });

  const mine = await open(advisor.page, "/advisor", topic);
  await linkField(mine).fill(ZOOM);
  await mine.getByRole("button", { name: "Add link" }).click();
  await expect(join(mine)).toHaveAttribute("href", ZOOM);
  await expect(mine).toContainText("added by you");

  const stored = await row(request.id);
  expect(stored).toMatchObject({ meetingUrl: ZOOM, meetingUrlSetBy: "advisor" });

  const theirs = await open(founder.page, "/founder/meetings", topic);
  const button = join(theirs);
  await expect(button).toHaveAttribute("href", ZOOM);
  await expect(button).toHaveAttribute("target", "_blank");
  await expect(button).toHaveAttribute("rel", /noopener/);
  await expect(theirs).toContainText(`added by ${advisor.row.name}`);
  // The advisor owns it: the founder has no way to change it.
  await expect(theirs.getByText("Change link")).toHaveCount(0);
  await expect(linkField(theirs)).toHaveCount(0);
});

test("the founder can add a link too, and only they can change it", async ({
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });

  const theirs = await open(founder.page, "/founder/meetings", topic);
  await linkField(theirs).fill(MEET);
  await theirs.getByRole("button", { name: "Add link" }).click();
  await expect(join(theirs)).toHaveAttribute("href", MEET);

  const mine = await open(advisor.page, "/advisor", topic);
  await expect(join(mine)).toHaveAttribute("href", MEET);
  await expect(mine).toContainText(`added by ${founder.row.name}`);
  await expect(mine.getByText("Change link")).toHaveCount(0);

  // The founder replaces it.
  await theirs.getByText("Change link").click();
  await linkField(theirs).fill(ZOOM);
  await theirs.getByRole("button", { name: "Update link" }).click();
  await expect(join(theirs)).toHaveAttribute("href", ZOOM);
  expect((await row(request.id)).meetingUrl).toBe(ZOOM);
});

test("the owner can remove the link", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  await db().meetingRequest.update({
    where: { id: request.id },
    data: { meetingUrl: ZOOM, meetingUrlSetBy: "advisor", meetingUrlSetAt: new Date() },
  });

  const mine = await open(advisor.page, "/advisor", topic);
  await mine.getByText("Change link").click();
  await linkField(mine).fill("");
  await mine.getByRole("button", { name: "Update link" }).click();
  await expect(join(mine)).toHaveCount(0);
  await expect(linkField(mine)).toBeVisible(); // back to "add a link"
  expect(await row(request.id)).toMatchObject({ meetingUrl: null, meetingUrlSetBy: null });
});

test("with no default link, nobody can add one before a time is agreed", async ({
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id);

  const mine = await open(advisor.page, "/advisor", topic);
  await expect(mine.locator(".pill")).toHaveText("Needs a time");
  await expect(linkField(mine)).toHaveCount(0);
  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(linkField(theirs)).toHaveCount(0);
  expect((await row(request.id)).meetingUrl).toBeNull();
});

test("the server refuses a link before a time is agreed", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  const mine = await open(advisor.page, "/advisor", topic);
  await expect(linkField(mine)).toBeVisible();

  // The time is withdrawn behind the page's back, so the open form is stale.
  await db().meetingRequest.update({ where: { id: request.id }, data: { scheduledAt: null } });
  await linkField(mine).fill(ZOOM);
  await mine.getByRole("button", { name: "Add link" }).click();
  await expect(mine).toContainText("Add the video link once a time is confirmed.");
  expect((await row(request.id)).meetingUrl).toBeNull();
});

test("bad links are refused by the server", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  const mine = await open(advisor.page, "/advisor", topic);
  await skipBrowserChecks(mine);

  const cases: [string, string][] = [
    ["http://meet.google.com/abc-defg-hij", "The link must start with https://"],
    ["javascript:alert(1)", "The link must start with https://"],
    ["https://example.com/room", "Use a Google Meet, Zoom, Microsoft Teams or Whereby link."],
    ["https://zoom.us.evil.example/j/1", "Use a Google Meet, Zoom, Microsoft Teams or Whereby link."],
    ["https://user:secret@zoom.us/j/1", "The link can't contain a username or password."],
    ["meet.google.com/abc", "That doesn't look like a link."],
    [`https://zoom.us/j/${"1".repeat(600)}`, "That link is too long"],
  ];
  for (const [value, message] of cases) {
    await linkField(mine).fill(value);
    await mine.getByRole("button", { name: "Add link" }).click();
    await expect(mine).toContainText(message);
    expect((await row(request.id)).meetingUrl).toBeNull();
  }
});

test("the server refuses a change to a link the other side owns", async ({
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  // The advisor opens the page while there is no link, so its form is on screen.
  const mine = await open(advisor.page, "/advisor", topic);
  await expect(linkField(mine)).toBeVisible();

  const theirs = await open(founder.page, "/founder/meetings", topic);
  await linkField(theirs).fill(MEET);
  await theirs.getByRole("button", { name: "Add link" }).click();
  await expect(join(theirs)).toBeVisible();

  await linkField(mine).fill(ZOOM);
  await mine.getByRole("button", { name: "Add link" }).click();
  await expect(mine).toContainText("only they can change it");
  expect((await row(request.id)).meetingUrl).toBe(MEET);
});

test("a member who isn't on the meeting can't set its link: the server refuses", async ({
  advisor,
  otherAdvisor,
  founder,
}) => {
  const { request: target } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  const { topic } = await accepted(otherAdvisor.row.id, founder.row.id, {
    scheduledAt: inDays(3),
  });

  const theirs = await open(otherAdvisor.page, "/advisor", topic);
  await linkField(theirs).fill(ZOOM);
  // Aim the form at someone else's meeting (after typing, which re-renders it).
  await theirs
    .locator('input[name="requestId"]')
    .first()
    .evaluate((input, id) => ((input as HTMLInputElement).value = id), target.id);
  await theirs.getByRole("button", { name: "Add link" }).click();
  await expect(theirs).toContainText("Meeting not found.");
  expect((await row(target.id)).meetingUrl).toBeNull();
});

test("once someone has said whether it happened, the link is closed", async ({
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  await db().meetingRequest.update({
    where: { id: request.id },
    data: { meetingUrl: ZOOM, meetingUrlSetBy: "advisor", meetingUrlSetAt: new Date() },
  });
  const mine = await open(advisor.page, "/advisor", topic);
  await expect(join(mine)).toBeVisible();
  await mine.getByText("Change link").click();

  // The founder says they already met, behind the open page's back.
  await db().meetingRequest.update({ where: { id: request.id }, data: { founderMet: true } });
  await linkField(mine).fill(MEET);
  await mine.getByRole("button", { name: "Update link" }).click();
  await expect(mine).toContainText("This meeting is closed");
  expect((await row(request.id)).meetingUrl).toBe(ZOOM);

  await founder.page.goto("/founder/meetings");
  await expect(join(card(founder.page, topic))).toHaveCount(0);
});

test("cancelling a meeting clears its link", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  await db().meetingRequest.update({
    where: { id: request.id },
    data: { meetingUrl: ZOOM, meetingUrlSetBy: "founder", meetingUrlSetAt: new Date() },
  });

  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(join(theirs)).toBeVisible();
  await theirs.getByText("Cancel meeting", { exact: true }).click();
  await theirs.getByLabel(/^Reason/).fill("Can't make it.");
  await theirs.getByRole("button", { name: "Yes, cancel meeting" }).click();
  await expect(theirs.locator(".pill")).toHaveText("Cancelled");
  await expect(join(theirs)).toHaveCount(0);

  expect(await row(request.id)).toMatchObject({
    status: "CANCELLED",
    meetingUrl: null,
    meetingUrlSetBy: null,
    meetingUrlSetAt: null,
  });
  await advisor.page.goto("/advisor");
  await expect(join(card(advisor.page, topic))).toHaveCount(0);
});

test("rescheduling keeps the link", async ({ advisor, founder }) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  await db().meetingRequest.update({
    where: { id: request.id },
    data: { meetingUrl: ZOOM, meetingUrlSetBy: "advisor", meetingUrlSetAt: new Date() },
  });
  const mine = await open(advisor.page, "/advisor", topic);
  await mine.getByRole("button", { name: "Reschedule" }).click();
  await mine.getByText("Already agreed a time?").click();
  await mine.locator('input[name="scheduledAt"]').fill("2099-01-05T10:00");
  await mine.getByRole("button", { name: "Update time" }).click();
  await expect
    .poll(async () => (await row(request.id)).scheduledAt?.getUTCFullYear())
    .toBe(2099);
  await expect(join(mine)).toHaveAttribute("href", ZOOM);
  expect((await row(request.id)).meetingUrl).toBe(ZOOM);
});

test("an advisor's default link is copied onto meetings they accept, before a time is agreed", async ({
  advisor,
  founder,
}) => {
  await advisor.page.goto("/dossier");
  await advisor.page.getByLabel("Default video call link").fill(MEET);
  await advisor.page.getByRole("button", { name: "Save dossier" }).click();
  await expect(advisor.page.getByText("Dossier saved.")).toBeVisible();
  expect(
    (await db().advisor.findUniqueOrThrow({ where: { id: advisor.row.id } })).defaultMeetingUrl
  ).toBe(MEET);

  const topic = uniqueTopic("Default link");
  await sendRequest(founder.page, advisor.row.id, { topic });
  await advisor.page.goto("/advisor");
  const mine = card(advisor.page, topic);
  await mine.getByRole("button", { name: "Accept" }).click();
  await expect(mine.locator(".pill")).toHaveText("Needs a time");
  await expect(join(mine)).toHaveAttribute("href", MEET);

  // The founder sees it straight away, with no time agreed yet.
  const theirs = await open(founder.page, "/founder/meetings", topic);
  await expect(theirs.locator(".pill")).toHaveText("Accepted");
  await expect(join(theirs)).toHaveAttribute("href", MEET);
  await expect(theirs).toContainText(`added by ${advisor.row.name}`);
  await expect(linkField(theirs)).toHaveCount(0);

  // Changing the default later leaves meetings already accepted alone.
  await advisor.page.goto("/dossier");
  await advisor.page.getByLabel("Default video call link").fill(ZOOM);
  await advisor.page.getByRole("button", { name: "Save dossier" }).click();
  await expect(advisor.page.getByText("Dossier saved.")).toBeVisible();
  const stored = await db().meetingRequest.findFirstOrThrow({ where: { topic } });
  expect(stored).toMatchObject({ meetingUrl: MEET, meetingUrlSetBy: "advisor" });
});

test("a bad default link is refused, and an empty one clears it", async ({ advisor }) => {
  await advisor.page.goto("/dossier");
  const field = advisor.page.getByLabel("Default video call link");
  await advisor.page
    .locator("form.dossier-form")
    .evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  for (const [value, message] of [
    ["http://zoom.us/j/1", "The link must start with https://"],
    ["https://example.com/room", "Use a Google Meet, Zoom, Microsoft Teams or Whereby link."],
  ]) {
    await field.fill(value);
    await advisor.page.getByRole("button", { name: "Save dossier" }).click();
    await expect(advisor.page.getByText(message)).toBeVisible();
  }
  const saved = () =>
    db()
      .advisor.findUniqueOrThrow({ where: { id: advisor.row.id } })
      .then((a) => a.defaultMeetingUrl);
  expect(await saved()).toBeNull();

  await field.fill(MEET);
  await advisor.page.getByRole("button", { name: "Save dossier" }).click();
  await expect(advisor.page.getByText("Dossier saved.")).toBeVisible();
  expect(await saved()).toBe(MEET);
  await field.fill("");
  await advisor.page.getByRole("button", { name: "Save dossier" }).click();
  await expect.poll(saved).toBeNull();
});

test("previewing a member can't set a link: the server refuses", async ({
  admin,
  advisor,
  founder,
}) => {
  const { topic, request } = await accepted(advisor.row.id, founder.row.id, {
    scheduledAt: inDays(2),
  });
  const blocked = "You're previewing as an admin, so changes are disabled.";

  const memberRowLocator = await memberRow(admin.page, "advisor", advisor.email);
  await memberRowLocator.getByRole("button", { name: "View as" }).click();
  await expect(admin.page.locator(".preview-bar")).toBeVisible();
  await admin.page.goto("/advisor");
  const c = card(admin.page, topic);
  await linkField(c).fill(ZOOM);
  await c.getByRole("button", { name: "Add link" }).dispatchEvent("click");
  await expect(c).toContainText(blocked);
  expect((await row(request.id)).meetingUrl).toBeNull();
});
