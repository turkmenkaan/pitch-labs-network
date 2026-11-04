// Exits non-zero if .env points at production. Runs before db:reset.
import { assertNotProduction, loadDotEnv } from "../lib/env-guard";

loadDotEnv();
assertNotProduction("reset the database");
