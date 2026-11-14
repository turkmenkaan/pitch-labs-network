import { db, expect, test } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card, sendRequest } from "./helpers/flows";

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
