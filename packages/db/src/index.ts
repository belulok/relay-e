import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { schema };

export type DB = PostgresJsDatabase<typeof schema>;

let cached: DB | undefined;

export function createDb(connectionString?: string): DB {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(url, {
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    prepare: false,
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

export function getDb(): DB {
  if (!cached) cached = createDb();
  return cached;
}
