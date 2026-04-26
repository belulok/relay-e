import { and, eq } from "drizzle-orm";
import { getDb, connectors as connectorsTable, type Connector as ConnectorRow } from "@relay-e/db";
import type { ConnectorConfig } from "@relay-e/engine";

/**
 * Tenant-scoped repository for `connectors`. The on-disk table already
 * exists in `packages/db/src/schema.ts` with the right shape; this module
 * just translates the engine's `ConnectorConfig` discriminated union
 * to/from the DB row.
 */

export interface SaveConnectorInput {
  tenantId: string;
  config: ConnectorConfig;
}

export async function listConnectorsForTenant(tenantId: string): Promise<ConnectorRow[]> {
  const db = getDb();
  return db.select().from(connectorsTable).where(eq(connectorsTable.tenantId, tenantId));
}

export async function getConnectorById(tenantId: string, id: string): Promise<ConnectorRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(connectorsTable)
    .where(and(eq(connectorsTable.tenantId, tenantId), eq(connectorsTable.id, id)))
    .limit(1);
  return rows[0];
}

export async function upsertConnector(input: SaveConnectorInput): Promise<ConnectorRow> {
  const db = getDb();
  const { tenantId, config } = input;

  // Use the connector's stable id from config as the row id when creating;
  // otherwise let the DB generate a UUID. We persist the engine-side `id`
  // string in `name` so we can find it later by id-string.
  const existing = await db
    .select()
    .from(connectorsTable)
    .where(
      and(
        eq(connectorsTable.tenantId, tenantId),
        eq(connectorsTable.name, config.id),
      ),
    )
    .limit(1);

  // Each connector's `config` is one of several shapes (Postgres / MySQL /
  // Mongo / Http / WebSearch). The DB column is opaque JSONB — cast through
  // `unknown` to satisfy TS without losing the runtime data.
  const cfgPayload = config.config as unknown as Record<string, unknown>;

  if (existing[0]) {
    const [updated] = await db
      .update(connectorsTable)
      .set({
        type: config.type,
        config: { display: config.name, ...cfgPayload },
      })
      .where(eq(connectorsTable.id, existing[0].id))
      .returning();
    if (!updated) throw new Error("failed_to_update_connector");
    return updated;
  }

  const [created] = await db
    .insert(connectorsTable)
    .values({
      tenantId,
      type: config.type,
      name: config.id,
      config: { display: config.name, ...cfgPayload },
    })
    .returning();
  if (!created) throw new Error("failed_to_create_connector");
  return created;
}

export async function deleteConnector(tenantId: string, id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(connectorsTable)
    .where(and(eq(connectorsTable.tenantId, tenantId), eq(connectorsTable.id, id)))
    .returning({ id: connectorsTable.id });
  return deleted.length > 0;
}

/**
 * Convert a stored row back into the engine-side `ConnectorConfig` shape.
 * `display` is the human name; `type` is on the row itself.
 */
export function rowToConnectorConfig(row: ConnectorRow): ConnectorConfig {
  const cfg = row.config as { display?: string } & Record<string, unknown>;
  const { display, ...rest } = cfg;
  return {
    id: row.name,
    name: display ?? row.name,
    type: row.type as ConnectorConfig["type"],
    // The engine validates each connector's config at construction time, so
    // we don't need a per-type Zod parse here.
    config: rest as never,
  } as ConnectorConfig;
}
