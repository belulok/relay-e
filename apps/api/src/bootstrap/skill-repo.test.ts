import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, tenants } from "@relay-e/db";
import { dbTestsEnabled } from "@relay-e/db/test-utils";
import {
  upsertSkill,
  listSkillsForTenant,
  deleteSkill,
  rowToSkillDefinition,
} from "./skill-repo.js";

let tenantId: string;

describe.skipIf(!dbTestsEnabled)("skill-repo", () => {
  beforeAll(async () => {
    const db = getDb();
    const [row] = await db
      .insert(tenants)
      .values({ name: `test-skill-repo-${Date.now()}`, plan: "free" })
      .returning();
    if (!row) throw new Error("failed to create test tenant");
    tenantId = row.id;
  });

  afterAll(async () => {
    if (tenantId) {
      await getDb().delete(tenants).where(eq(tenants.id, tenantId));
    }
  });

  it("upserts a skill and lists it back", async () => {
    const skill = {
      name: "test-skill",
      description: "A test skill",
      systemPrompt: "You are a test assistant.",
      connectorIds: ["db1", "db2"],
      preferredTier: "balanced" as const,
    };
    const row = await upsertSkill({ tenantId, skill });
    expect(row.name).toBe("test-skill");
    expect(row.tenantId).toBe(tenantId);
    expect(row.systemPrompt).toBe(skill.systemPrompt);

    const list = await listSkillsForTenant(tenantId);
    expect(list.some((r) => r.name === "test-skill")).toBe(true);
  });

  it("upsert with the same name updates instead of inserting", async () => {
    const base = {
      name: "test-skill-update",
      description: "Original",
      systemPrompt: "Original prompt.",
    };
    await upsertSkill({ tenantId, skill: base });
    await upsertSkill({
      tenantId,
      skill: { ...base, description: "Updated", systemPrompt: "Updated prompt." },
    });

    const list = await listSkillsForTenant(tenantId);
    const matches = list.filter((r) => r.name === "test-skill-update");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.systemPrompt).toBe("Updated prompt.");
  });

  it("rowToSkillDefinition round-trips through the DB row", async () => {
    const skill = {
      name: "test-skill-rt",
      description: "Round-trip skill",
      systemPrompt: "Be helpful.",
      connectorIds: ["shop_db", "stripe"],
      toolNames: ["custom_tool"],
      preferredTier: "premium" as const,
      examples: [{ input: "hello", output: "world" }],
    };
    const row = await upsertSkill({ tenantId, skill });
    const sd = rowToSkillDefinition(row);

    expect(sd.name).toBe(skill.name);
    expect(sd.systemPrompt).toBe(skill.systemPrompt);
    expect(sd.connectorIds).toEqual(skill.connectorIds);
    expect(sd.toolNames).toEqual(skill.toolNames);
    expect(sd.preferredTier).toBe(skill.preferredTier);
  });

  it("deleteSkill removes the row and returns true", async () => {
    const row = await upsertSkill({
      tenantId,
      skill: {
        name: "test-skill-del",
        description: "Delete me",
        systemPrompt: "Temp.",
      },
    });
    const deleted = await deleteSkill(tenantId, row.id);
    expect(deleted).toBe(true);

    const list = await listSkillsForTenant(tenantId);
    expect(list.some((r) => r.id === row.id)).toBe(false);
  });

  it("deleteSkill returns false for an unknown id", async () => {
    const result = await deleteSkill(tenantId, "00000000-0000-0000-0000-000000000000");
    expect(result).toBe(false);
  });
});
