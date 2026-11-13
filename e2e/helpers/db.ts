// Direct database access for test setup, teardown and "time travel" (the app
// refuses to schedule meetings in the past, so tests move a meeting's time into
// the past directly). Uses the same database the app under test uses: .env's
// DATABASE_URL, or E2E_DATABASE_URL (e.g. the staging schema).
import { PrismaClient } from "@prisma/client";
import { productionRef } from "../../lib/env-guard";

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  if (client) return client;
  let url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (or E2E_DATABASE_URL) is not set.");
  if (
    [url, process.env.DIRECT_URL].some((u) => u?.includes(productionRef()))
  ) {
    throw new Error("Refusing to run: the database is the production project.");
  }
  // The transaction pooler needs this flag (see lib/db.ts).
  if (!url.includes("pgbouncer=true")) {
    url += (url.includes("?") ? "&" : "?") + "pgbouncer=true";
  }
  client = new PrismaClient({ datasourceUrl: url });
  return client;
}
