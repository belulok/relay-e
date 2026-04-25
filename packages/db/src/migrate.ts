import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/relay_e";
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  console.log(`[migrate] applying migrations to ${url.replace(/:[^:@]+@/, ":****@")}`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("[migrate] done");
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
