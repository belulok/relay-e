import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, tenants } from "@relay-e/db";
import { dbTestsEnabled } from "@relay-e/db/test-utils";
import {
  upsertConnector,
  listConnectorsForTenant,
  getConnectorById,
  deleteConnector,
  rowToConnectorConfig,
} from "./connector-repo.js";

let tenantId: string;

describe.skipIf(!dbTestsEnabled)("connector-repo", () => {
  beforeAll(async () => {
    const db = getDb();
    const [row] = await db
      .insert(tenants)
      .values({ name: `test-connector-repo-${Date.now()}`, plan: "free" })
      .returning();
    if (!row) throw new Error("failed to create test tenant");
    tenantId = row.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await getDb().delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  it("upserts a postgres connector and lists it back", async () => {
    const config = {
      type: "postgres" as const,
      id: "test_pg",
      name: "Test PG",
      config: { url: "postgres://localhost/test", rowLimit: 50 },
    };
    const row = await upsertConnector({ tenantId, config });
    expect(row.name).toBe("test_pg");
    expect(row.tenantId).toBe(tenantId);
    expect(row.type).toBe("postgres");

    const list = await listConnectorsForTenant(tenantId);
    expect(list.some((r) => r.name === "test_pg")).toBe(true);
  });

  it("getConnectorById finds the row by DB uuid", async () => {
    const config = {
      type: "websearch" as const,
      id: "test_search",
      name: "Test Search",
      config: { provider: "tavily" as const, apiKeyEnv: "TAVILY_KEY" },
    };
    const created = await upsertConnector({ tenantId, config });
    const found = await getConnectorById(tenantId, created.id);
    expect(found?.id).toBe(created.id);
  });

  it("upsert with the same connector id updates instead of inserting", async () => {
    const base = {
      type: "postgres" as const,
      id: "test_pg_update",
      name: "Original Name",
      config: { url: "postgres://localhost/original" },
    };
    await upsertConnector({ tenantId, config: base });
    const updated = await upsertConnector({
      tenantId,
      config: { ...base, name: "Updated Name" },
    });

    // The row's name column stores the connector id string
    expect(updated.name).toBe("test_pg_update");
    // Display name is stored inside the config JSONB
    expect((updated.config as { display?: string }).display).toBe("Updated Name");

    const list = await listConnectorsForTenant(tenantId);
    expect(list.filter((r) => r.name === "test_pg_update")).toHaveLength(1);
  });

  it("rowToConnectorConfig round-trips config through the DB row", async () => {
    const config = {
      type: "websearch" as const,
      id: "test_ws_rt",
      name: "Round-trip Search",
      config: { provider: "brave" as const, apiKeyEnv: "BRAVE_KEY", maxResults: 10 },
    };
    const row = await upsertConnector({ tenantId, config });
    const cfg = rowToConnectorConfig(row);
    expect(cfg.type).toBe("websearch");
    expect(cfg.id).toBe("test_ws_rt");
    expect(cfg.name).toBe("Round-trip Search");
    expect((cfg.config as typeof config.config).provider).toBe("brave");
  });

  it("deleteConnector removes the row and returns true", async () => {
    const config = {
      type: "http" as const,
      id: "test_http_del",
      name: "Delete Me",
      config: { baseUrl: "https://api.example.com" },
    };
    const row = await upsertConnector({ tenantId, config });
    const deleted = await deleteConnector(tenantId, row.id);
    expect(deleted).toBe(true);

    const list = await listConnectorsForTenant(tenantId);
    expect(list.some((r) => r.id === row.id)).toBe(false);
  });

  it("deleteConnector returns false for an unknown id", async () => {
    const result = await deleteConnector(tenantId, "00000000-0000-0000-0000-000000000000");
    expect(result).toBe(false);
  });
});
