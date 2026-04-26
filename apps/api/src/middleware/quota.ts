import type { MiddlewareHandler } from "hono";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, tenants, usageEvents } from "@relay-e/db";
import { errors } from "@relay-e/shared";

/**
 * Per-tenant monthly token quota enforcement.
 *
 * Reads the tenant's `token_quota_monthly` limit, sums this month's
 * usage_events, and throws 429 if the tenant is at or over their limit.
 *
 * Both the quota value and the usage sum are cached with short TTLs to avoid
 * a DB round-trip on every request. The trade-off is that a tenant can briefly
 * overshoot by one request window; this is acceptable for billing-soft limits.
 *
 * Apply this middleware to any route that triggers LLM calls:
 *
 *   export const messagesRoutes = new OpenAPIHono()
 *     .use("*", quotaMiddleware)
 *     .openapi(...);
 */

const QUOTA_TTL_MS = 10 * 60_000; // tenant quota cached for 10 min
const USAGE_TTL_MS = 5 * 60_000;  // monthly usage cached for 5 min

const quotaCache = new Map<string, { limit: number; at: number }>();
const usageCache = new Map<string, { tokens: number; at: number }>();

async function getTenantQuota(tenantId: string): Promise<number> {
  const hit = quotaCache.get(tenantId);
  if (hit && Date.now() - hit.at < QUOTA_TTL_MS) return hit.limit;

  const db = getDb();
  const rows = await db
    .select({ quota: tenants.tokenQuotaMonthly })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const limit = rows[0]?.quota ?? 0;
  quotaCache.set(tenantId, { limit, at: Date.now() });
  return limit;
}

async function getMonthlyUsage(tenantId: string): Promise<number> {
  const hit = usageCache.get(tenantId);
  if (hit && Date.now() - hit.at < USAGE_TTL_MS) return hit.tokens;

  const db = getDb();
  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(${usageEvents.tokensIn} + ${usageEvents.tokensOut}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.tenantId, tenantId),
        gte(usageEvents.createdAt, sql`date_trunc('month', now())`),
      ),
    );

  const tokens = Number(rows[0]?.total ?? 0);
  usageCache.set(tenantId, { tokens, at: Date.now() });
  return tokens;
}

export const quotaMiddleware: MiddlewareHandler = async (c, next) => {
  const { tenantId } = c.get("tenant");

  const [limit, used] = await Promise.all([
    getTenantQuota(tenantId),
    getMonthlyUsage(tenantId),
  ]);

  // limit = 0 means unlimited (e.g. internal tenants, free plan before quota configured)
  if (limit > 0 && used >= limit) {
    throw errors.quota(
      `Monthly token quota of ${limit.toLocaleString()} tokens exceeded. ` +
        `Used: ${used.toLocaleString()}. Resets on the 1st of each month.`,
    );
  }

  await next();
};

/** Evict a tenant's usage cache after a turn is persisted. */
export function invalidateUsageCache(tenantId: string): void {
  usageCache.delete(tenantId);
}
