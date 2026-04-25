import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { dbTestsEnabled, openTestDb } from "./test-utils.js";
import { tenants } from "./schema.js";

const dbDescribe = dbTestsEnabled ? describe : describe.skip;

dbDescribe("Postgres schema (real DB)", () => {
  it("connects, has pgvector extension, and round-trips an insert inside a rolled-back tx", async () => {
    const { db, close } = await openTestDb();
    try {
      // Verify the pgvector extension is installed.
      const ext = await db.execute<{ extname: string }>(
        sql`select extname from pg_extension where extname = 'vector'`,
      );
      expect(ext.length).toBe(1);

      // Wrap the write in a transaction we explicitly roll back.
      await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(tenants)
          .values({ name: "test-tenant", plan: "free" })
          .returning();
        expect(inserted?.name).toBe("test-tenant");
        // Force rollback so the row never persists.
        tx.rollback();
      }).catch((err) => {
        // drizzle re-throws the rollback as a TransactionRollbackError; that's expected.
        if ((err as Error)?.name !== "TransactionRollbackError") throw err;
      });

      const remaining = await db
        .select()
        .from(tenants)
        .where(sql`name = 'test-tenant'`);
      expect(remaining).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
