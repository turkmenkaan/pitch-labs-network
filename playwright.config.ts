import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { loadDotEnv } from "./lib/env-guard";

// .env holds the non-production Supabase settings; .env.e2e adds the service
// role key and optional overrides. Neither is committed.
loadDotEnv(".env");
loadDotEnv(".env.e2e");

// Shared by every worker (they inherit it), so test users from different runs
// never collide.
process.env.E2E_RUN_ID ??= randomBytes(3).toString("hex");

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isLocal = new URL(baseURL).hostname === "localhost";
const bypass = process.env.E2E_VERCEL_BYPASS_SECRET;

export default defineConfig({
  testDir: "e2e",
  testMatch: ["**/*.e2e.ts"],
  // Server actions talk to a remote database and the dev server compiles routes
  // on first use, so allow more than the 5s default for a page to update.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Lets automated requests through Vercel Deployment Protection on staging.
    extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : {},
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  // Local runs start (or reuse) the dev server; staging runs hit the deployed URL.
  webServer: isLocal
    ? {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        // Like Vercel, the server runs in UTC. Meeting times must be right
        // whatever the zone of the server or the browser.
        env: { TZ: "UTC" },
      }
    : undefined,
});
