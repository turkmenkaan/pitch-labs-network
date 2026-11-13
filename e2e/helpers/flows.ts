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
