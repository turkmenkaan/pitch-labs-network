// Runs before `next build`. Applies pending migrations on staging deploys only:
// production migrations are a deliberate manual step (npm run db:migrate:prod).
import { spawnSync } from "node:child_process";
import { targetsProduction, withSchema } from "../lib/env-guard";

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

// Always migrate the `staging` schema, whatever the Vercel URLs say: a URL
// missing ?schema=staging would otherwise migrate `public` and leave the
// schema the app actually reads without its new tables.
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: withSchema(process.env.DATABASE_URL, "staging"),
    DIRECT_URL: withSchema(process.env.DIRECT_URL, "staging"),
  },
});
process.exit(result.status ?? 1);
