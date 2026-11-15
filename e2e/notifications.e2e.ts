import { db, expect, test } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card, enterAgreedTime, proposeTimes, sendRequest } from "./helpers/flows";

// The server runs with NOTIFY_MODE=log (see playwright.config.ts), so nothing
// reaches Slack. Notifications are recorded in the outbox after the response is
// sent, so tests poll for them.
const rowFor = (dedupeKey: string) =>
  db().notification.findUnique({ where: { dedupeKey } });

async function waitForRow(dedupeKey: string) {
  await expect.poll(() => rowFor(dedupeKey), { timeout: 30_000 }).not.toBeNull();
  return (await rowFor(dedupeKey))!;
}

const payloadText = (row: { payload: unknown }) => (row.payload as { text: string }).text;

test("sending a request notifies the advisor", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify request");
  await sendRequest(founder.page, advisor.row.id, { topic, hours: 2 });

  const request = await db().meetingRequest.findFirstOrThrow({ where: { topic } });
  const row = await waitForRow(`request-sent:${request.id}`);

  expect(row).toMatchObject({ type: "REQUEST_SENT", recipientEmail: advisor.email });
  expect(payloadText(row)).toContain(topic);
  expect(payloadText(row)).toContain(founder.row.name);
  // Log mode records the message and doesn't send it.
  await expect.poll(async () => (await rowFor(row.dedupeKey))?.status).toBe("LOGGED");
});

test("accepting or declining notifies the founder, with the reason on a decline", async ({
  founder,
  advisor,
}) => {
  const accepted = uniqueTopic("Notify accept");
  const declined = uniqueTopic("Notify decline");
  const a = await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id, topic: accepted });
  const d = await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id, topic: declined });

  await advisor.page.goto("/advisor");
  await card(advisor.page, accepted).getByRole("button", { name: "Accept" }).click();
  await expect(card(advisor.page, accepted).locator(".pill")).not.toHaveText("Pending");

  const yes = await waitForRow(`request-decided:${a.id}`);
  expect(yes).toMatchObject({ type: "REQUEST_DECIDED", recipientEmail: founder.email });
  expect(payloadText(yes)).toContain("accepted");

  const pending = card(advisor.page, declined);
  await pending.getByLabel("Note to the founder").fill("Not a fit this month.");
  await pending.getByRole("button", { name: "Reject" }).click();
  await expect(pending.locator(".pill")).toHaveText("Rejected");

  const no = await waitForRow(`request-decided:${d.id}`);
  expect(no).toMatchObject({ type: "REQUEST_DECIDED", recipientEmail: founder.email });
  expect(payloadText(no)).toContain("declined");
  expect(payloadText(no)).toContain("Not a fit this month.");
});

test("a refused decline sends nothing", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify refused");
  const request = await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id, topic });

  await advisor.page.goto("/advisor");
  const pending = card(advisor.page, topic);
  await pending.getByRole("button", { name: "Reject" }).click();
  await expect(pending.getByText("Add a reason for declining.")).toBeVisible();

  // Give a (wrongly) queued notification time to appear.
  await advisor.page.waitForTimeout(3000);
  expect(await rowFor(`request-decided:${request.id}`)).toBeNull();
});

test("a deactivated founder isn't notified", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify deactivated");
  const request = await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id, topic });
  await db().founder.update({ where: { id: founder.row.id }, data: { deactivatedAt: new Date() } });

  await advisor.page.goto("/advisor");
  const pending = card(advisor.page, topic);
  await pending.getByRole("button", { name: "Accept" }).click();
  await expect(pending.locator(".pill")).not.toHaveText("Pending");

  await advisor.page.waitForTimeout(3000);
  expect(await rowFor(`request-decided:${request.id}`)).toBeNull();
});

for (const side of ["advisor", "founder"] as const) {
  test(`cancelling as the ${side} notifies the other side with the reason`, async ({
    founder,
    advisor,
  }) => {
    const topic = uniqueTopic(`Notify cancel by ${side}`);
    const request = await createRequest({
      advisorId: advisor.row.id,
      founderId: founder.row.id,
      topic,
      status: "ACCEPTED",
    });

    const mine = side === "advisor" ? advisor : founder;
    await mine.page.goto(side === "advisor" ? "/advisor" : "/founder/meetings");
    const meeting = card(mine.page, topic);
    await meeting.getByText("Cancel meeting", { exact: true }).click();
    await meeting.getByLabel(/^Reason/).fill("Something came up.");
    await meeting.getByRole("button", { name: "Yes, cancel meeting" }).click();
    await expect(meeting).toContainText("You cancelled this meeting.");

    const row = await waitForRow(`cancelled:${request.id}`);
    expect(row).toMatchObject({
      type: "MEETING_CANCELLED",
      recipientEmail: side === "advisor" ? founder.email : advisor.email,
    });
    expect(payloadText(row)).toContain("Something came up.");
  });
}

test("a conflict notifies admins, once per admin", async ({ founder, advisor, admin }) => {
  const topic = uniqueTopic("Notify conflict");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
    scheduledAt: new Date(Date.now() - 60 * 60 * 1000),
  });

  await advisor.page.goto("/advisor");
  const meeting = card(advisor.page, topic);
  await meeting.getByRole("button", { name: "Yes, we met" }).click();
  await expect(meeting.locator(".pill")).toHaveText("Add feedback");

  await founder.page.goto("/founder/meetings");
  const theirs = card(founder.page, topic);
  await theirs.getByRole("button", { name: /No, it didn.t happen/ }).click();
  await expect(theirs.locator(".pill")).toHaveText("Under admin review");

  const row = await waitForRow(`conflict:${request.id}:${admin.row.id}`);
  expect(row).toMatchObject({ type: "MEETING_CONFLICT", recipientEmail: admin.email });
  expect(payloadText(row)).toContain(topic);
  // Only members who are admins hear about it.
  expect(
    await db().notification.count({
      where: { dedupeKey: { startsWith: `conflict:${request.id}:` }, recipientEmail: advisor.email },
    })
  ).toBe(0);
  expect(
    await db().notification.count({ where: { dedupeKey: `conflict:${request.id}:${admin.row.id}` } })
  ).toBe(1);
});

// --- Agreeing a meeting time -------------------------------------------------
const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const rowsWithPrefix = (prefix: string) =>
  db().notification.findMany({ where: { dedupeKey: { startsWith: prefix } } });

async function waitForRows(prefix: string, count: number) {
  await expect.poll(async () => (await rowsWithPrefix(prefix)).length, { timeout: 30_000 }).toBe(count);
  return rowsWithPrefix(prefix);
}

test("proposing times notifies the other side, and proposing again notifies again", async ({
  founder,
  advisor,
}) => {
  const topic = uniqueTopic("Notify propose");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  await advisor.page.goto("/advisor");
  const mine = card(advisor.page, topic);
  await proposeTimes(mine, [inDays(2), inDays(3)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");

  const [first] = await waitForRows(`times-proposed:${request.id}:`, 1);
  expect(first).toMatchObject({ type: "TIMES_PROPOSED", recipientEmail: founder.email });
  const text = payloadText(first);
  expect(text).toContain(advisor.row.name);
  expect(text).toContain(topic);
  expect(text).toContain("suggested times");
  expect(text).toMatch(/ET/);
  expect(text.match(/•/g)).toHaveLength(2);

  // Replacing the times is a new round, so they hear about it again.
  await mine.getByText("Change proposed times").click();
  await proposeTimes(mine.locator("details"), [inDays(6)]);
  const rows = await waitForRows(`times-proposed:${request.id}:`, 2);
  expect(rows.every((r) => r.recipientEmail === founder.email)).toBe(true);
  expect(rows.some((r) => payloadText(r).includes("suggested a time"))).toBe(true);
});

test("picking a time notifies whoever proposed it", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify pick");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  await advisor.page.goto("/advisor");
  await proposeTimes(card(advisor.page, topic), [inDays(2), inDays(3)]);
  await waitForRows(`times-proposed:${request.id}:`, 1);

  await founder.page.goto("/founder/meetings");
  const theirs = card(founder.page, topic);
  const options = theirs.locator("label.slot-option");
  await expect(options).toHaveCount(2);
  await options.nth(1).locator("input").check();
  await theirs.getByRole("button", { name: "Confirm this time" }).click();
  await expect(theirs.locator(".pill")).toHaveText("Upcoming");

  const [confirmed] = await waitForRows(`time-confirmed:${request.id}:`, 1);
  expect(confirmed).toMatchObject({ type: "TIME_CONFIRMED", recipientEmail: advisor.email });
  expect(payloadText(confirmed)).toContain(founder.row.name);
  expect(payloadText(confirmed)).toContain("ET");
  // The proposer isn't told about their own proposal.
  expect(
    await db().notification.count({
      where: { dedupeKey: { startsWith: `times-proposed:${request.id}:` }, recipientEmail: advisor.email },
    })
  ).toBe(0);
});

test("the founder can propose first and the advisor is told", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify founder proposes");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  await founder.page.goto("/founder/meetings");
  await proposeTimes(card(founder.page, topic), [inDays(4)]);

  const [row] = await waitForRows(`times-proposed:${request.id}:`, 1);
  expect(row).toMatchObject({ type: "TIMES_PROPOSED", recipientEmail: advisor.email });
  expect(payloadText(row)).toContain(founder.row.name);
});

test("refused scheduling steps send nothing", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify refused times");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  // Times in the past are refused.
  await advisor.page.goto("/advisor");
  const mine = card(advisor.page, topic);
  await proposeTimes(mine, [inDays(-1)]);
  await expect(mine).toContainText("Pick times in the future.");

  // A pick that went stale is refused: the proposal was replaced under it.
  await proposeTimes(mine, [inDays(2)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");
  await founder.page.goto("/founder/meetings");
  const theirs = card(founder.page, topic);
  await expect(theirs.getByRole("button", { name: "Confirm this time" })).toBeVisible();
  await mine.getByText("Change proposed times").click();
  await proposeTimes(mine.locator("details"), [inDays(9)]);
  await expect
    .poll(async () => (await db().meetingSlot.count({ where: { meetingRequestId: request.id, status: "SUPERSEDED" } })))
    .toBe(1);
  await theirs.getByRole("button", { name: "Confirm this time" }).click();
  await expect(theirs).toContainText("That time was already taken or withdrawn.");

  await advisor.page.waitForTimeout(3000);
  // Only the two successful proposals produced notifications; no confirmation.
  expect(await rowsWithPrefix(`times-proposed:${request.id}:`)).toHaveLength(2);
  expect(await rowsWithPrefix(`time-confirmed:${request.id}:`)).toHaveLength(0);
});

test("entering an agreed time tells the founder", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify direct time");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  await advisor.page.goto("/advisor");
  const mine = card(advisor.page, topic);
  await enterAgreedTime(mine, inDays(3));
  await expect(mine.locator(".pill")).toHaveText("Upcoming");

  const [row] = await waitForRows(`time-set:${request.id}:`, 1);
  expect(row).toMatchObject({ type: "TIME_SET", recipientEmail: founder.email });
  expect(payloadText(row)).toContain(advisor.row.name);
  expect(payloadText(row)).toContain(topic);
  expect(payloadText(row)).toContain("ET");

  // The advisor isn't told about their own action.
  expect(
    await db().notification.count({
      where: { dedupeKey: { startsWith: `time-set:${request.id}:` }, recipientEmail: advisor.email },
    })
  ).toBe(0);
});

test("a refused agreed time sends nothing", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify refused direct time");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });

  await advisor.page.goto("/advisor");
  const mine = card(advisor.page, topic);
  await enterAgreedTime(mine, inDays(-1));
  await expect(mine).toContainText("Pick a time in the future.");

  await advisor.page.waitForTimeout(3000);
  expect(await rowsWithPrefix(`time-set:${request.id}:`)).toHaveLength(0);
});

test("a deactivated member isn't told about proposed times", async ({ founder, advisor }) => {
  const topic = uniqueTopic("Notify deactivated times");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    status: "ACCEPTED",
  });
  await db().founder.update({ where: { id: founder.row.id }, data: { deactivatedAt: new Date() } });

  await advisor.page.goto("/advisor");
  const mine = card(advisor.page, topic);
  await proposeTimes(mine, [inDays(2)]);
  await expect(mine.locator(".pill")).toHaveText("Waiting on founder");

  await advisor.page.waitForTimeout(3000);
  expect(await rowsWithPrefix(`times-proposed:${request.id}:`)).toHaveLength(0);
});

test.describe("admin notifications page", () => {
  test("an admin sees notifications and retries a failed one", async ({ admin, stranger }) => {
    const failed = await db().notification.create({
      data: {
        type: "REQUEST_SENT",
        recipientEmail: stranger.email,
        payload: { text: "hello", path: "/advisor" },
        dedupeKey: `e2e-retry:${stranger.email}`,
        status: "FAILED",
        attempts: 5,
        lastError: "rate_limited",
      },
    });

    await admin.page.goto("/admin/notifications");
    const row = admin.page.locator("tr", { hasText: stranger.email });
    await expect(row).toContainText("FAILED");
    await expect(row).toContainText("rate_limited");
    await row.getByRole("button", { name: "Retry" }).click();
    await expect(row).toContainText("LOGGED");

    const after = await db().notification.findUniqueOrThrow({ where: { id: failed.id } });
    expect(after.status).toBe("LOGGED");
    const audit = await db().auditLog.findFirst({
      where: { adminId: admin.row.id, action: "notification.retry" },
    });
    expect(audit?.detail).toContain(stranger.email);
  });

  test("members and strangers are refused", async ({ founder, advisor, stranger }) => {
    for (const page of [founder.page, advisor.page, stranger.page]) {
      const res = await page.goto("/admin/notifications");
      expect(res?.status()).toBe(404);
    }
  });
});

test.describe("retry sweep endpoint", () => {
  test("refuses requests without the secret", async ({ request }) => {
    expect((await request.get("/api/notifications/sweep")).status()).toBe(401);
    const wrong = await request.get("/api/notifications/sweep", {
      headers: { authorization: "Bearer not-the-secret" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("with the secret, sends what is due", async ({ request, stranger }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, "CRON_SECRET isn't set for this run.");

    const due = await db().notification.create({
      data: {
        type: "REQUEST_SENT",
        recipientEmail: stranger.email,
        payload: { text: "swept", path: "/advisor" },
        dedupeKey: `e2e-sweep:${stranger.email}`,
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });
    const res = await request.get("/api/notifications/sweep", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(res.status()).toBe(200);
    await expect
      .poll(async () => (await db().notification.findUnique({ where: { id: due.id } }))?.status)
      .toBe("LOGGED");
  });
});
