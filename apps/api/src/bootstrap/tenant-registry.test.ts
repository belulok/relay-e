import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, tenants } from "@relay-e/db";
import { dbTestsEnabled } from "@relay-e/db/test-utils";
import { getTenantBundle, invalidateTenantBundle } from "./tenant-registry.js";
import { upsertConnector } from "./connector-repo.js";
import { upsertSkill } from "./skill-repo.js";

let tenantId: string;

describe.skipIf(!dbTestsEnabled)("tenant-registry", () => {
  beforeAll(async () => {
    const db = getDb();
    const [row] = await db
      .insert(tenants)
      .values({ name: `test-tenant-registry-${Date.now()}`, plan: "free" })
      .returning();
    if (!row) throw new Error("failed to create test tenant");
    tenantId = row.id;
  });

  afterAll(async () => {
    await invalidateTenantBundle(tenantId);
    if (tenantId) {
      await getDb().delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  it("getTenantBundle returns a bundle with empty connector + skill registries for a fresh tenant", async () => {
    const bundle = await getTenantBundle(tenantId);
    expect(bundle).toBeDefined();
    expect(bundle.connectors).toBeDefined();
    expect(bundle.skills).toBeDefined();
    expect(bundle.connectors.list()).toHaveLength(0);
  });

  it("returns the same object on a second call within TTL (cache hit)", async () => {
    const a = await getTenantBundle(tenantId);
    const b = await getTenantBundle(tenantId);
    expect(a).toBe(b);
  });

  it("connector registered after invalidation appears in the next bundle load", async () => {
    await upsertConnector({
      tenantId,
      config: {
        type: "websearch" as const,
        id: "test_reg_search",
        name: "Registry Search",
        config: { provider: "tavily" as const, apiKeyEnv: "TAVILY_KEY" },
      },
    });

    await invalidateTenantBundle(tenantId);
    const bundle = await getTenantBundle(tenantId);

    const ids = bundle.connectors.list().map((c) => c.id);
    expect(ids).toContain("test_reg_search");
  });

  it("skill registered after invalidation appears in the next bundle load", async () => {
    await upsertSkill({
      tenantId,
      skill: {
        name: "test-registry-skill",
        description: "Registry test skill",
        systemPrompt: "Be helpful.",
      },
    });

    await invalidateTenantBundle(tenantId);
    const bundle = await getTenantBundle(tenantId);

    const names = bundle.skills.list().map((s) => s.name);
    expect(names).toContain("test-registry-skill");
  });

  it("invalidateTenantBundle clears the cache so the next call rebuilds", async () => {
    const before = await getTenantBundle(tenantId);
    await invalidateTenantBundle(tenantId);
    const after = await getTenantBundle(tenantId);
    // After invalidation the bundle is rebuilt — different object reference
    expect(after).not.toBe(before);
  });
});
