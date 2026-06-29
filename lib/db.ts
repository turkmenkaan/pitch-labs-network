import { PrismaClient } from "@prisma/client";

// Supabase's transaction pooler (PgBouncer, port 6543) does not support
// prepared statements. Prisma must be told to disable them via `pgbouncer=true`
// on the connection URL, otherwise queries fail at runtime with Postgres error
// 26000 ("prepared statement ... does not exist"). Guarantee the flag is present
// even if the deployed DATABASE_URL omits it, so a mis-pasted env var can't break
// production.
function poolerSafeUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("pgbouncer=true")) return url;
  return url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}

// Reuse a single PrismaClient across hot-reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceUrl = poolerSafeUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
