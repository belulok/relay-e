import { describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { dbTestsEnabled, openTestDb } from "./test-utils.js";
import { tenants } from "./schema.js";

const dbDescribe = dbTestsEnabled ? describe : describe.skip;

dbDescribe("Postgres schema (real DB)", () => {
  it("connects, has pgvector extension, and round-trips an insert", async () => {
    const { db, close } = await openTestDb();
    try {
      // pgvector extension is enabled (CI does this; locally docker-compose runs the init script).
      const ext = await db.execute<{ extname: string }>(
        sql`select extname from pg_extension where extname = 'vector'`,
      );
      expect(ext.length).toBe(1);

      // Round-trip an insert against the migrated `tenants` table, then clean up.
      // We don't use db.transaction({ rollback }) because the framework's rollback
      // signal raises a DrizzleError whose `.name` (inherited from the parent
      // class) is "DrizzleError" not "TransactionRollbackError" — easy to mis-handle.
      const [inserted] = await db
        .insert(tenants)
        .values({ name: "schema-test-tenant", plan: "free" })
        .returning();
      expect(inserted?.name).toBe("schema-test-tenant");
      expect(inserted?.id).toMatch(/[0-9a-f-]{36}/);

      await db.delete(tenants).where(eq(tenants.id, inserted!.id));

      const remaining = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, inserted!.id));
      expect(remaining).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
