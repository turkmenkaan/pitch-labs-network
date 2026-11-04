// Keeps destructive scripts (seed, db:reset) and non-production builds away from
// the production Supabase project. Both DB URLs embed the project ref, so a
// substring match is enough.

const PRODUCTION_REF_FALLBACK = "ebrfgxeohgfpfenihkkf";

type Env = Record<string, string | undefined>;

export function productionRef(env: Env = process.env): string {
  return env.PROD_SUPABASE_REF || PRODUCTION_REF_FALLBACK;
}

export function targetsProduction(env: Env = process.env): boolean {
  const ref = productionRef(env);
  return [env.DATABASE_URL, env.DIRECT_URL].some((url) => url?.includes(ref));
}

// Load .env the way Prisma does (existing variables win), for scripts that run
// before Prisma has loaded it.
export function loadDotEnv(file = ".env"): void {
  try {
    process.loadEnvFile(file);
  } catch {
    // No such file: fall back to whatever is already in the environment.
  }
}

// Exits the process if the configured database is production.
export function assertNotProduction(action: string): void {
  if (targetsProduction()) {
    console.error(
      `Refusing to ${action}: DATABASE_URL / DIRECT_URL point at the production ` +
        "Supabase project.\nPoint .env at the non-production project and try again."
    );
    process.exit(1);
  }
}

// Returns url with its Postgres schema set (replacing any existing one).
export function withSchema(url: string | undefined, schema: string): string | undefined {
  if (!url) return url;
  const clean = url.replace(/([?&])schema=[^&]*&?/, "$1").replace(/[?&]$/, "");
  return clean + (clean.includes("?") ? "&" : "?") + `schema=${schema}`;
}
