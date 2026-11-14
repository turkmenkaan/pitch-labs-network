import { db, expect, test } from "./fixtures";

test("a founder picks their stage from a dropdown", async ({ founder }) => {
  await founder.page.goto("/founder/profile");
  const stage = founder.page.getByLabel("Stage");
  await expect(stage).toHaveJSProperty("tagName", "SELECT");
  await expect(stage.locator("option")).toHaveText([
    "Select a stage",
    "Idea",
    "Pre-seed",
    "Seed",
    "Series A",
    "Series B",
    "Series C or later",
  ]);

  await stage.selectOption("Series A");
  await founder.page.getByRole("button", { name: "Save profile" }).click();
  await expect(founder.page.getByText("Profile saved.")).toBeVisible();
  expect((await db().founder.findUniqueOrThrow({ where: { id: founder.row.id } })).stage).toBe(
    "Series A"
  );
});

test("the server refuses a stage that isn't on the list", async ({ founder }) => {
  await db().founder.update({ where: { id: founder.row.id }, data: { stage: "Seed" } });
  await founder.page.goto("/founder/profile");

  // Swap an option's value in the page to prove the server checks on its own.
  await founder.page
    .getByLabel("Stage")
    .locator("option", { hasText: "Idea" })
    .evaluate((option) => ((option as HTMLOptionElement).value = "Unicorn"));
  await founder.page.getByLabel("Stage").selectOption("Unicorn");
  await founder.page.getByRole("button", { name: "Save profile" }).click();

  await expect(founder.page.getByText("Choose a stage from the list.")).toBeVisible();
  expect((await db().founder.findUniqueOrThrow({ where: { id: founder.row.id } })).stage).toBe(
    "Seed"
  );
});

test("a stored free-text stage still shows and saves", async ({ founder }) => {
  await db().founder.update({
    where: { id: founder.row.id },
    data: { stage: "Bootstrapped" },
  });
  await founder.page.goto("/founder/profile");
  await expect(founder.page.getByLabel("Stage")).toHaveValue("Bootstrapped");

  await founder.page.getByLabel("Company *").fill("E2E Legacy Stage Co");
  await founder.page.getByRole("button", { name: "Save profile" }).click();
  await expect(founder.page.getByText("Profile saved.")).toBeVisible();
  expect((await db().founder.findUniqueOrThrow({ where: { id: founder.row.id } })).stage).toBe(
    "Bootstrapped"
  );
});
