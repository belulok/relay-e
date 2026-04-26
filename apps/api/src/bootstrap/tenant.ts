import { eq } from "drizzle-orm";
import { getDb, tenants, type Tenant } from "@relay-e/db";

const byName = new Map<string, Tenant>();
const byId = new Map<string, Tenant>();

/** Resolve a tenant by **name** (creates it if missing). Used for dev-mode bootstrap. */
export async function resolveTenant(name: string): Promise<Tenant> {
  const cached = byName.get(name);
  if (cached) return cached;

  const db = getDb();
  const existing = await db.select().from(tenants).where(eq(tenants.name, name)).limit(1);
  if (existing[0]) {
    byName.set(name, existing[0]);
    byId.set(existing[0].id, existing[0]);
    return existing[0];
  }

  const [created] = await db
    .insert(tenants)
    .values({ name, plan: "free" })
    .returning();
  if (!created) throw new Error("failed_to_create_tenant");
  byName.set(name, created);
  byId.set(created.id, created);
  return created;
}

/** Resolve a tenant by **UUID** (throws if not found). Used after API-key auth. */
export async function resolveTenantById(id: string): Promise<Tenant> {
  const cached = byId.get(id);
  if (cached) return cached;

  const db = getDb();
  const rows = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!rows[0]) throw new Error(`tenant_not_found:${id}`);
  byId.set(id, rows[0]);
  byName.set(rows[0].name, rows[0]);
  return rows[0];
}

export function clearTenantCache(): void {
  byName.clear();
  byId.clear();
}
