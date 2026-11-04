// Runs before `next build`. Applies pending migrations on staging deploys only:
// production migrations are a deliberate manual step (npm run db:migrate:prod).
import { spawnSync } from "node:child_process";
import { targetsProduction } from "../lib/env-guard";

if (process.env.VERCEL_GIT_COMMIT_REF !== "staging") {
  console.log("Not a staging deploy; skipping migrations.");
  process.exit(0);
}

if (targetsProduction()) {
  console.error(
    "The staging deploy is configured with production database URLs. Aborting the build."
  );
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
