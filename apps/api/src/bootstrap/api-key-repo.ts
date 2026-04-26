import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, apiKeys, type ApiKey } from "@relay-e/db";

export function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

/** Generate a cryptographically random API key with a `rle-` prefix. */
export function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = `rle-${crypto.randomBytes(24).toString("hex")}`;
  return { raw, hash: hashKey(raw), prefix: raw.slice(0, 12) };
}

/**
 * Look up which tenant owns this raw key. Returns undefined when:
 *   - key doesn't exist in the table
 *   - key has been revoked
 *
 * Fires a best-effort last_used_at update on hit.
 */
export async function lookupApiKey(rawKey: string): Promise<{ tenantId: string; id: string } | undefined> {
  const db = getDb();
  const hash = hashKey(rawKey);
  const rows = await db
    .select({ tenantId: apiKeys.tenantId, id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!rows[0]) return undefined;
  // Fire-and-forget — don't slow auth path for a timestamp update.
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, rows[0].id))
    .execute()
    .catch(() => {});
  return { tenantId: rows[0].tenantId, id: rows[0].id };
}

export async function createApiKey(
  tenantId: string,
  name: string,
): Promise<{ row: ApiKey; raw: string }> {
  const db = getDb();
  const { raw, hash, prefix } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ tenantId, name, keyHash: hash, keyPrefix: prefix })
    .returning();
  if (!row) throw new Error("failed_to_create_api_key");
  return { row, raw };
}

export async function listApiKeysForTenant(tenantId: string): Promise<ApiKey[]> {
  const db = getDb();
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)));
}

export async function revokeApiKey(tenantId: string, id: string): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.tenantId, tenantId),
        eq(apiKeys.id, id),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  return updated.length > 0;
}
