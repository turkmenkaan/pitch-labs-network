import { describe, expect, it } from "vitest";
import { productionRef, targetsProduction } from "./env-guard";

const PROD = "ebrfgxeohgfpfenihkkf";
const pooled = (ref: string) =>
  `postgresql://postgres.${ref}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
const direct = (ref: string) =>
  `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres`;

describe("targetsProduction", () => {
  it("flags the production project in either URL", () => {
    expect(targetsProduction({ DATABASE_URL: pooled(PROD) })).toBe(true);
    expect(targetsProduction({ DIRECT_URL: direct(PROD) })).toBe(true);
  });

  it("allows other projects, including a mixed pair only if neither is production", () => {
    expect(
      targetsProduction({
        DATABASE_URL: pooled("nonprodref"),
        DIRECT_URL: direct("nonprodref"),
      })
    ).toBe(false);
    expect(
      targetsProduction({
        DATABASE_URL: pooled("nonprodref"),
        DIRECT_URL: direct(PROD),
      })
    ).toBe(true);
  });

  it("allows an empty environment", () => {
    expect(targetsProduction({})).toBe(false);
  });

  it("lets PROD_SUPABASE_REF override the built-in ref", () => {
    const env = { PROD_SUPABASE_REF: "otherprod", DATABASE_URL: pooled("otherprod") };
    expect(productionRef(env)).toBe("otherprod");
    expect(targetsProduction(env)).toBe(true);
  });
});
