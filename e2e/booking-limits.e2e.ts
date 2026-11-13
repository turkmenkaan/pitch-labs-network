import type { Admin } from "@prisma/client";
import {
  DEFAULT_CALLS_PER_ADVISOR,
  DEFAULT_MONTHLY_HOURS,
} from "../lib/guardrails";
import { db, expect, test, type Member } from "./fixtures";
import { createRequest, uniqueTopic } from "./helpers/data";
import { card, sendRequest, usageMeter } from "./helpers/flows";

const sendButton = { name: "Send meeting request" };

test("using all the monthly hours closes the request form", async ({
  founder,
  advisor,
  otherAdvisor,
}) => {
  // Spread across two advisors so the per-advisor call limit isn't the reason.
  await createRequest({
    advisorId: advisor.row.id,
    founderId: founder.row.id,
    hours: DEFAULT_MONTHLY_HOURS - 1,
  });
  await createRequest({
    advisorId: otherAdvisor.row.id,
    founderId: founder.row.id,
    hours: 1,
  });

  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await expect(usageMeter(founder.page)).toContainText(
    `${DEFAULT_MONTHLY_HOURS} of ${DEFAULT_MONTHLY_HOURS} hours`
  );
  await expect(
    founder.page.getByText(
      `You've used all ${DEFAULT_MONTHLY_HOURS} of your advisor hours this month.`
    )
  ).toBeVisible();
  await expect(founder.page.getByRole("button", sendButton)).toHaveCount(0);
});

test("the server refuses a request for more hours than are left", async ({
  founder,
  advisor,
  otherAdvisor,
}) => {
  await createRequest({
    advisorId: otherAdvisor.row.id,
    founderId: founder.row.id,
    hours: DEFAULT_MONTHLY_HOURS - 1,
  });

  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await founder.page.getByLabel(/^topic/i).fill(uniqueTopic("Too long"));
  await founder.page.getByLabel(/^message/i).fill("Please help.");
  // The browser caps the field at the hours left; switch that off to prove the
  // server enforces the limit on its own.
  await founder.page
    .locator("form.dossier-form")
    .evaluate((form) => ((form as HTMLFormElement).noValidate = true));
  await founder.page.getByLabel(/^estimated hours/i).fill("2");
  await founder.page.getByRole("button", sendButton).click();

  await expect(
    founder.page.getByText(
      `You have 1 hour left this month (limit ${DEFAULT_MONTHLY_HOURS}). Ask for fewer hours.`
    )
  ).toBeVisible();
});

test("the per-advisor call limit closes the form for that advisor only", async ({
  founder,
  advisor,
  otherAdvisor,
}) => {
  for (let i = 0; i < DEFAULT_CALLS_PER_ADVISOR; i++) {
    await createRequest({
      advisorId: advisor.row.id,
      founderId: founder.row.id,
      hours: 1,
    });
  }

  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await expect(
    founder.page.getByText(
      `You've reached the limit of ${DEFAULT_CALLS_PER_ADVISOR} calls with ${advisor.row.name} this month.`
    )
  ).toBeVisible();
  await expect(founder.page.getByRole("button", sendButton)).toHaveCount(0);

  // Another advisor is still bookable.
  await sendRequest(founder.page, otherAdvisor.row.id, {
    topic: uniqueTopic("Another advisor"),
  });
});

test("withdrawing a request brings the form back at the call limit", async ({
  founder,
  advisor,
}) => {
  const topic = uniqueTopic("Withdraw me");
  await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id, topic });
  for (let i = 1; i < DEFAULT_CALLS_PER_ADVISOR; i++) {
    await createRequest({ advisorId: advisor.row.id, founderId: founder.row.id });
  }

  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await expect(founder.page.getByRole("button", sendButton)).toHaveCount(0);

  await founder.page.goto("/founder/meetings");
  await card(founder.page, topic)
    .getByRole("button", { name: "Withdraw request" })
    .click();
  await expect(card(founder.page, topic).locator(".pill")).toHaveText("Withdrawn");

  await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
  await expect(founder.page.getByRole("button", sendButton)).toBeVisible();
});

test.describe("admin overrides", () => {
  // Opens the founder's row in Members and saves new limits.
  async function setLimits(
    admin: Member<Admin>,
    founderEmail: string,
    limits: { hours?: number; calls?: number }
  ) {
    await admin.page.goto(`/admin/members?type=founder&q=${encodeURIComponent(founderEmail)}`);
    const row = admin.page.locator("tr", { hasText: founderEmail });
    await row.locator("details.adm-edit summary").click();
    if (limits.hours != null) {
      await row.locator('input[name="monthlyHoursLimit"]').fill(String(limits.hours));
    }
    if (limits.calls != null) {
      await row.locator('input[name="advisorCallLimit"]').fill(String(limits.calls));
    }
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("status")).toContainText("Saved.");
  }

  test("raising a founder's hours limit lets them book more", async ({
    admin,
    founder,
    advisor,
    otherAdvisor,
  }) => {
    await createRequest({
      advisorId: advisor.row.id,
      founderId: founder.row.id,
      hours: DEFAULT_MONTHLY_HOURS - 1,
    });
    await createRequest({
      advisorId: otherAdvisor.row.id,
      founderId: founder.row.id,
      hours: 1,
    });
    await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
    await expect(founder.page.getByRole("button", sendButton)).toHaveCount(0);

    const raised = DEFAULT_MONTHLY_HOURS + 2;
    await setLimits(admin, founder.email, { hours: raised });

    await founder.page.reload();
    await expect(usageMeter(founder.page)).toContainText(
      `${DEFAULT_MONTHLY_HOURS} of ${raised} hours`
    );
    await expect(founder.page.getByRole("button", sendButton)).toBeVisible();

    // Other tests write audit entries too, so look only at this test's admin.
    await admin.page.goto("/admin/audit");
    await expect(
      admin.page
        .locator("tr", { hasText: admin.row.name })
        .filter({ hasText: "member.update" })
    ).toContainText(`monthly hours limit default → ${raised}`);
  });

  test("raising a founder's call limit lets them book the same advisor again", async ({
    admin,
    founder,
    advisor,
  }) => {
    for (let i = 0; i < DEFAULT_CALLS_PER_ADVISOR; i++) {
      await createRequest({
        advisorId: advisor.row.id,
        founderId: founder.row.id,
        hours: 1,
      });
    }
    await founder.page.goto(`/founder/advisors/${advisor.row.id}`);
    await expect(founder.page.getByRole("button", sendButton)).toHaveCount(0);

    await setLimits(admin, founder.email, { calls: DEFAULT_CALLS_PER_ADVISOR + 1 });

    await founder.page.reload();
    await expect(founder.page.getByRole("button", sendButton)).toBeVisible();
  });
});

test("two simultaneous requests cannot both slip past the hours cap", async ({
  founder,
  advisor,
}) => {
  const hours = DEFAULT_MONTHLY_HOURS - 1; // either fits alone, both together don't
  const pages = [founder.page, await founder.page.context().newPage()];
  const topics = pages.map((_, i) => uniqueTopic(`Race ${i}`));

  for (const [i, page] of pages.entries()) {
    await page.goto(`/founder/advisors/${advisor.row.id}`);
    await page.getByLabel(/^topic/i).fill(topics[i]);
    await page.getByLabel(/^message/i).fill("Racing.");
    await page.getByLabel(/^estimated hours/i).fill(String(hours));
  }

  // Click both as close together as possible.
  await Promise.all(
    pages.map((page) => page.getByRole("button", sendButton).click())
  );

  const outcome = (page: (typeof pages)[number]) =>
    page.getByText("Request sent ✓").or(page.locator(".stage-error"));
  for (const page of pages) await expect(outcome(page)).toBeVisible();

  const sent = await Promise.all(
    pages.map((page) => page.getByText("Request sent ✓").isVisible())
  );
  expect(sent.filter(Boolean)).toHaveLength(1);

  expect(
    await db().meetingRequest.count({ where: { founderId: founder.row.id } })
  ).toBe(1);
});
