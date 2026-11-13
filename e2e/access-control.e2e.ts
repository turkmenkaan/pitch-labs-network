import { db, expect, test } from "./fixtures";

test.describe("signed out", () => {
  for (const path of ["/admin", "/advisor", "/founder"]) {
    test(`${path} sends a visitor to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("the landing page is public", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Sign in with Slack" }).first()).toBeVisible();
  });
});

test.describe("founder", () => {
  test("lands in the founder workspace and is kept out of the others", async ({
    founder,
  }) => {
    await founder.page.goto("/");
    await expect(founder.page).toHaveURL(/\/founder$/);

    await founder.page.goto("/advisor");
    await expect(founder.page).toHaveURL(/\/founder$/);

    const admin = await founder.page.goto("/admin");
    expect(admin?.status()).toBe(404);
  });
});

test.describe("advisor", () => {
  test("lands in the advisor workspace and is kept out of the others", async ({
    advisor,
  }) => {
    await advisor.page.goto("/");
    await expect(advisor.page).toHaveURL(/\/advisor$/);

    await advisor.page.goto("/founder");
    await expect(advisor.page).toHaveURL(/\/advisor$/);

    const admin = await advisor.page.goto("/admin");
    expect(admin?.status()).toBe(404);
  });

  test("a deactivated advisor loses access", async ({ advisor }) => {
    await db().advisor.update({
      where: { id: advisor.row.id },
      data: { deactivatedAt: new Date() },
    });
    await advisor.page.goto("/advisor");
    await expect(advisor.page).toHaveURL(/\/no-access$/);
  });
});

test.describe("admin", () => {
  test("lands in the admin area and is sent there from the member workspaces", async ({
    admin,
  }) => {
    await admin.page.goto("/");
    await expect(admin.page).toHaveURL(/\/admin$/);

    await admin.page.goto("/advisor");
    await expect(admin.page).toHaveURL(/\/admin$/);

    await admin.page.goto("/founder");
    await expect(admin.page).toHaveURL(/\/admin$/);
  });
});

test.describe("signed in but not a member", () => {
  test("is sent to /no-access from the member workspaces", async ({ stranger }) => {
    for (const path of ["/advisor", "/founder"]) {
      await stranger.page.goto(path);
      await expect(stranger.page).toHaveURL(/\/no-access$/);
    }
    await expect(
      stranger.page.getByRole("heading", { name: /not a member yet/i })
    ).toBeVisible();
    await expect(stranger.page.getByText(stranger.email)).toBeVisible();

    const admin = await stranger.page.goto("/admin");
    expect(admin?.status()).toBe(404);
  });
});

test.describe("first sign-in", () => {
  test("a founder with an unfinished profile lands on it, and can skip it", async ({
    founder,
  }) => {
    await db().founder.update({ where: { id: founder.row.id }, data: { about: null } });

    await founder.page.goto("/");
    await expect(founder.page).toHaveURL(/\/founder\/profile\?welcome=1$/);
    await expect(founder.page.getByText("Welcome — start here")).toBeVisible();

    // Skipping goes to the directory, and isn't sent back by browsing.
    await founder.page.getByRole("link", { name: "← Back to advisors" }).click();
    await expect(founder.page).toHaveURL(/\/founder$/);
    await founder.page.reload();
    await expect(founder.page).toHaveURL(/\/founder$/);

    // Filling it in makes the next sign-in land on the directory.
    await founder.page.goto("/founder/profile");
    await founder.page.getByLabel(/What you.re building/).fill("An e2e-tested thing.");
    await founder.page.getByRole("button", { name: /save/i }).click();
    await expect(founder.page.getByText(/saved/i).first()).toBeVisible();
    await founder.page.goto("/");
    await expect(founder.page).toHaveURL(/\/founder$/);
  });

  test("an advisor with an unfinished dossier lands on it, and can skip it", async ({
    advisor,
  }) => {
    await db().advisor.update({
      where: { id: advisor.row.id },
      data: { bio: "", expertise: "" },
    });

    await advisor.page.goto("/");
    await expect(advisor.page).toHaveURL(/\/dossier\?welcome=1$/);
    await expect(advisor.page.getByText("Welcome — start here")).toBeVisible();

    await advisor.page.getByRole("link", { name: "← Back to requests" }).click();
    await expect(advisor.page).toHaveURL(/\/advisor$/);

    await db().advisor.update({
      where: { id: advisor.row.id },
      data: { bio: "Complete now.", expertise: "Testing" },
    });
    await advisor.page.goto("/");
    await expect(advisor.page).toHaveURL(/\/advisor$/);
  });

  test("an admin previewing an unfinished profile sees the workspace, not the profile", async ({
    admin,
    founder,
  }) => {
    await db().founder.update({ where: { id: founder.row.id }, data: { about: null } });
    await admin.page.goto(
      `/admin/members?type=founder&q=${encodeURIComponent(founder.email)}`
    );
    await admin.page
      .locator("tr", { hasText: founder.email })
      .getByRole("button", { name: "View as" })
      .click();
    await expect(admin.page).toHaveURL(/\/founder$/);
    await admin.page.goto("/");
    await expect(admin.page).toHaveURL(/\/founder$/);
  });
});
