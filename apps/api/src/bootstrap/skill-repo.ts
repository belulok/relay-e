import { and, eq } from "drizzle-orm";
import { getDb, skills as skillsTable, type Skill as SkillRow } from "@relay-e/db";
import type { SkillDefinition } from "@relay-e/engine";

export interface SaveSkillInput {
  tenantId: string;
  skill: SkillDefinition;
}

export async function listSkillsForTenant(tenantId: string): Promise<SkillRow[]> {
  const db = getDb();
  return db.select().from(skillsTable).where(eq(skillsTable.tenantId, tenantId));
}

export async function upsertSkill(input: SaveSkillInput): Promise<SkillRow> {
  const db = getDb();
  const { tenantId, skill } = input;

  const existing = await db
    .select()
    .from(skillsTable)
    .where(and(eq(skillsTable.tenantId, tenantId), eq(skillsTable.name, skill.name)))
    .limit(1);

  const config: Record<string, unknown> = {
    description: skill.description,
    connectorIds: skill.connectorIds ?? [],
    examples: skill.examples ?? [],
    preferredTier: skill.preferredTier ?? null,
  };

  if (existing[0]) {
    const [updated] = await db
      .update(skillsTable)
      .set({
        description: skill.description,
        systemPrompt: skill.systemPrompt,
        toolIds: skill.toolNames ?? [],
        examples: skill.examples ?? [],
        config,
      })
      .where(eq(skillsTable.id, existing[0].id))
      .returning();
    if (!updated) throw new Error("failed_to_update_skill");
    return updated;
  }

  const [created] = await db
    .insert(skillsTable)
    .values({
      tenantId,
      name: skill.name,
      description: skill.description,
      systemPrompt: skill.systemPrompt,
      toolIds: skill.toolNames ?? [],
      examples: skill.examples ?? [],
      config,
    })
    .returning();
  if (!created) throw new Error("failed_to_create_skill");
  return created;
}

export async function deleteSkill(tenantId: string, id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(skillsTable)
    .where(and(eq(skillsTable.tenantId, tenantId), eq(skillsTable.id, id)))
    .returning({ id: skillsTable.id });
  return deleted.length > 0;
}

export function rowToSkillDefinition(row: SkillRow): SkillDefinition {
  const config = (row.config ?? {}) as {
    description?: string;
    connectorIds?: string[];
    examples?: SkillDefinition["examples"];
    preferredTier?: SkillDefinition["preferredTier"];
  };
  return {
    name: row.name,
    description: row.description ?? config.description ?? "",
    systemPrompt: row.systemPrompt,
    toolNames: row.toolIds,
    connectorIds: config.connectorIds,
    examples: config.examples,
    preferredTier: config.preferredTier ?? undefined,
  };
}
