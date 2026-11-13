import type { Advisor, Founder } from "@prisma/client";
import { db, expect, test, type Member } from "./fixtures";
import { anHourAgo, createRequest, uniqueTopic } from "./helpers/data";
import { card, usageMeter } from "./helpers/flows";
import { DEFAULT_MONTHLY_HOURS } from "../lib/guardrails";

const HOURS = 2;

// A meeting that was due an hour ago. The advisor says it happened and the
// founder says it didn't, both through the UI, which raises a conflict.
async function conflictedMeeting(
  founder: Member<Founder>,
  advisor: Member<Advisor>
) {
  const topic = uniqueTopic("Conflict");
  const request = await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    topic,
    hours: HOURS,
    status: "ACCEPTED",
    scheduledAt: anHourAgo(),
  });

  await advisor.page.goto("/advisor");
  const meeting = advisor.page.locator("article.meeting", { hasText: topic });
  await expect(meeting.locator(".pill")).toHaveText("Did it happen?");
  await meeting.getByRole("button", { name: "Yes, we met" }).click();
  await expect(meeting.locator(".pill")).toHaveText("Add feedback");

  await founder.page.goto("/founder/meetings");
  const mine = card(founder.page, topic);
  await expect(mine.locator(".pill")).toHaveText("Did it happen?");
  await mine.getByRole("button", { name: /No, it didn.t happen/ }).click();
  await expect(mine.locator(".pill")).toHaveText("Under admin review");

  return { topic, request, meeting };
}

test("a disagreement is flagged to the advisor, the founder and the admin", async ({
  admin,
  founder,
  advisor,
}) => {
  const { topic, meeting } = await conflictedMeeting(founder, advisor);

  await advisor.page.reload();
  await expect(meeting).toContainText("conflicts with the founder");
  await expect(card(founder.page, topic)).toContainText(
    `You and ${advisor.row.name} gave different answers`
  );

  await admin.page.goto("/admin/conflicts");
  const kase = admin.page.locator("article.adm-case", { hasText: topic });
  await expect(kase).toContainText(advisor.row.name);
  await expect(kase).toContainText(founder.row.name);
  await expect(kase).toContainText("It happened"); // the advisor's answer
  await expect(kase).toContainText("It did not happen"); // the founder's answer
});

for (const ruling of [
  {
    name: "happened",
    radio: "It happened",
    resolvedLabel: "Happened",
    founderText: "took place",
    hoursUsed: HOURS,
    advisorPill: "Add feedback",
    audit: "did happen",
  },
  {
    name: "did not happen",
    radio: "It did not happen",
    resolvedLabel: "Did not happen",
    founderText: "did not take place",
    hoursUsed: 0,
    advisorPill: "Didn't happen",
    audit: "did not happen",
  },
]) {
  test(`an admin ruling that it ${ruling.name} settles the meeting for everyone`, async ({
    admin,
    founder,
    advisor,
  }) => {
    const { topic } = await conflictedMeeting(founder, advisor);
    const note = `Ruled ${ruling.name} by the e2e suite.`;

    // Until the admin rules, the advisor's "it happened" still counts.
    await founder.page.goto("/founder");
    await expect(usageMeter(founder.page)).toContainText(
      `${HOURS} of ${DEFAULT_MONTHLY_HOURS} hours`
    );

    await admin.page.goto("/admin/conflicts");
    const kase = admin.page.locator("article.adm-case", { hasText: topic });
    await kase.getByLabel(ruling.radio, { exact: true }).check();
    await kase.getByPlaceholder(/why/i).fill(note);
    await kase.getByRole("button", { name: "Resolve" }).click();

    await expect(kase).toHaveCount(0);
    const resolved = admin.page.locator("table.ledger tr", { hasText: topic });
    await expect(resolved).toContainText(ruling.resolvedLabel);
    await expect(resolved).toContainText(note);

    await founder.page.goto("/founder/meetings");
    await expect(card(founder.page, topic).locator(".pill")).toHaveText("Admin ruled");
    await expect(card(founder.page, topic)).toContainText(
      `An admin ruled that this meeting ${ruling.founderText}`
    );
    await expect(card(founder.page, topic)).toContainText(note);
    await expect(
      card(founder.page, topic).getByRole("button", { name: "Yes, we met" })
    ).toHaveCount(0);

    // A "did not happen" ruling gives the hours back; "happened" keeps them.
    await founder.page.goto("/founder");
    await expect(usageMeter(founder.page)).toContainText(
      `${ruling.hoursUsed} of ${DEFAULT_MONTHLY_HOURS} hours`
    );

    await advisor.page.goto("/advisor");
    await expect(
      advisor.page.locator("article.meeting", { hasText: topic }).locator(".pill")
    ).toHaveText(ruling.advisorPill);

    await admin.page.goto("/admin/audit");
    const entry = admin.page.locator("tr", { hasText: "conflict.resolve" }).filter({ hasText: topic });
    await expect(entry).toContainText(`${ruling.audit}: ${note}`);
  });
}

test("a ruling is final", async ({ admin, founder, advisor }) => {
  const { topic } = await conflictedMeeting(founder, advisor);
  // The advisor's page still shows the feedback form from before the ruling.

  const openCase = async (page: typeof admin.page) => {
    await page.goto("/admin/conflicts");
    const kase = page.locator("article.adm-case", { hasText: topic });
    await expect(kase).toBeVisible();
    return kase;
  };
  const first = await openCase(admin.page);
  const secondPage = await admin.page.context().newPage();
  const second = await openCase(secondPage);

  await first.getByLabel("It did not happen", { exact: true }).check();
  await first.getByPlaceholder(/why/i).fill("First ruling.");
  await first.getByRole("button", { name: "Resolve" }).click();
  await expect(first).toHaveCount(0);

  // Resolving the same conflict again from a stale page is refused.
  await second.getByLabel("It happened", { exact: true }).check();
  await second.getByPlaceholder(/why/i).fill("Second ruling.");
  await second.getByRole("button", { name: "Resolve" }).click();
  await expect(second.getByRole("status")).toContainText(
    "This conflict was already resolved."
  );
  expect(
    (await db().meetingRequest.findFirstOrThrow({ where: { topic } })).adminMet
  ).toBe(false);

  // Feedback can't be added to a meeting the admin ruled didn't happen.
  const meeting = advisor.page.locator("article.meeting", { hasText: topic });
  await meeting.getByRole("button", { name: "3 stars" }).click();
  await meeting.getByPlaceholder(/what did you cover/i).fill("Too late.");
  await meeting.getByRole("button", { name: "Submit feedback" }).click();
  await expect(meeting).toContainText("Feedback isn't open for this meeting.");
});
