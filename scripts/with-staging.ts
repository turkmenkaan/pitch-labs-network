// Runs a command against the `staging` schema of the non-production project.
//   npm run seed:staging
//   npm run make-admin:staging -- someone@company.com "Full Name"
import { spawnSync } from "node:child_process";
import { loadDotEnv, targetsProduction, withSchema } from "../lib/env-guard";

loadDotEnv(".env");
if (targetsProduction()) {
  console.error("Refusing: .env points at the production project.");
  process.exit(1);
}

process.env.DATABASE_URL = withSchema(process.env.DATABASE_URL, "staging");
process.env.DIRECT_URL = withSchema(process.env.DIRECT_URL, "staging");

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: tsx scripts/with-staging.ts <command> [args...]");
  process.exit(1);
}

const result = spawnSync("npx", [command, ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
