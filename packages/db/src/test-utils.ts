import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

/**
 * Test DB helpers. Each test gets a transaction that is rolled back at the
 * end so the database stays clean between cases.
 *
 * Set `DATABASE_URL_TEST` (or fall back to DATABASE_URL with `_test` appended)
 * and run `npm run db:migrate` against that DB once before running these tests.
 *
 * The `RELAY_E_TEST_DB` flag opts the suite in — by default DB tests are
 * skipped so unit tests stay fast and CI can choose to include them or not.
 */

export const dbTestsEnabled = process.env.RELAY_E_TEST_DB === "1";

export function resolveTestDbUrl(): string | undefined {
  const explicit = process.env.DATABASE_URL_TEST;
  if (explicit) return explicit;
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;
  // Append "_test" to the database name segment of the URL.
  return base.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2");
}

export interface TestDbHandle {
  db: PostgresJsDatabase<typeof schema>;
  client: Sql;
  close: () => Promise<void>;
}

export async function openTestDb(): Promise<TestDbHandle> {
  const url = resolveTestDbUrl();
  if (!url) throw new Error("No test DB URL configured");
  const client = postgres(url, { max: 2, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return {
    db,
    client,
    close: async () => {
      await client.end({ timeout: 1 });
    },
  };
}
