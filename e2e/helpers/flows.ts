import { expect, type Locator, type Page } from "@playwright/test";
import { toEasternInput } from "../../lib/time";

// Founder fills in and sends the "Request a meeting" form on an advisor's page.
export async function sendRequest(
  page: Page,
  advisorId: string,
  request: { topic: string; message?: string; hours?: number }
): Promise<void> {
  await page.goto(`/founder/advisors/${advisorId}`);
  await page.getByLabel(/^topic/i).fill(request.topic);
  await page.getByLabel(/^message/i).fill(request.message ?? "Please help.");
  if (request.hours) {
    await page.getByLabel(/^estimated hours/i).fill(String(request.hours));
  }
  await page.getByRole("button", { name: "Send meeting request" }).click();
  await expect(page.getByText("Request sent ✓")).toBeVisible();
}

// The founder's "X of Y hours booked this month" meter.
export function usageMeter(page: Page): Locator {
  return page.getByRole("group", { name: "Your monthly advisor time" });
}

// A request or meeting card, found by its (unique) topic.
export function card(page: Page, topic: string): Locator {
  return page.locator("article", { hasText: topic });
}

// "YYYY-MM-DDTHH:mm" as the Eastern wall clock reads at `date`, for the
// datetime-local input (meeting times are entered in Eastern Time).
export function datetimeLocal(date: Date): string {
  return toEasternInput(date);
}

// Fills the "Propose times" form on a card with Eastern wall-clock times and
// sends it.
export async function proposeTimes(cardLocator: Locator, times: Date[]): Promise<void> {
  const inputs = cardLocator.locator('input[name="slot"]');
  for (const [i, time] of times.entries()) {
    await inputs.nth(i).fill(datetimeLocal(time));
  }
  await cardLocator.getByRole("button", { name: "Propose times" }).click();
}

// Opens the advisor's "Already agreed a time?" shortcut and enters a time.
export async function enterAgreedTime(cardLocator: Locator, time: Date): Promise<void> {
  await cardLocator.getByText("Already agreed a time?").click();
  await cardLocator.locator('input[name="scheduledAt"]').fill(datetimeLocal(time));
  await cardLocator.getByRole("button", { name: "Set time" }).click();
}
