// Applies Prisma migrations to a chosen environment.
//   npm run db:migrate:staging   .env (non-prod project), `staging` schema
//   npm run db:migrate:prod      .env.prod-migrate, after confirmation
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { loadDotEnv, targetsProduction, withSchema } from "../lib/env-guard";

function hostOf(url: string | undefined): string {
  try {
    return new URL(url ?? "").host;
  } catch {
    return "(unparseable URL)";
  }
}

async function main() {
  const target = process.argv[2];

  if (target === "staging") {
    loadDotEnv(".env");
    if (targetsProduction()) {
      console.error("Refusing: .env points at the production project.");
      process.exit(1);
    }
    process.env.DATABASE_URL = withSchema(process.env.DATABASE_URL, "staging");
    process.env.DIRECT_URL = withSchema(process.env.DIRECT_URL, "staging");
  } else if (target === "prod") {
    loadDotEnv(".env.prod-migrate");
    if (!process.env.DIRECT_URL || !targetsProduction()) {
      console.error(
        ".env.prod-migrate must define DATABASE_URL and DIRECT_URL for the production project."
      );
      process.exit(1);
    }
    console.log(`About to run migrations on PRODUCTION (${hostOf(process.env.DIRECT_URL)}).`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Type "production" to continue: ');
    rl.close();
    if (answer.trim() !== "production") {
      console.error("Cancelled.");
      process.exit(1);
    }
  } else {
    console.error("Usage: tsx scripts/migrate.ts <staging|prod>");
    process.exit(1);
  }

  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

main();
