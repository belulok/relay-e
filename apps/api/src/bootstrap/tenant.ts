import { eq } from "drizzle-orm";
import { getDb, tenants, type Tenant } from "@relay-e/db";

/**
 * Resolve the auth-time tenant identifier (a string from the API key) into
 * a real `tenants` row. For dev mode the key maps to a single
 * `name = "dev-tenant"` row that's auto-created on first hit. Production
 * deployments will replace this with a per-key lookup.
 */
const cache = new Map<string, Tenant>();

export async function resolveTenant(name: string): Promise<Tenant> {
  const cached = cache.get(name);
  if (cached) return cached;

  const db = getDb();
  const existing = await db.select().from(tenants).where(eq(tenants.name, name)).limit(1);
  if (existing[0]) {
    cache.set(name, existing[0]);
    return existing[0];
  }

  const [created] = await db
    .insert(tenants)
    .values({ name, plan: "free" })
    .returning();
  if (!created) throw new Error("failed_to_create_tenant");
  cache.set(name, created);
  return created;
}

export function clearTenantCache(): void {
  cache.clear();
}
