import type { MiddlewareHandler } from "hono";
import { errors } from "@relay-e/shared";
import { lookupApiKey } from "../bootstrap/api-key-repo.js";
import { resolveTenant } from "../bootstrap/tenant.js";

export interface TenantContext {
  /** Tenant UUID from the `tenants` table. */
  tenantId: string;
  apiKey: string;
}

declare module "hono" {
  interface ContextVariableMap {
    tenant: TenantContext;
    requestId: string;
  }
}

/**
 * Bearer-token authentication with two-tier fallback:
 *
 * 1. **DB lookup** — hash the incoming key, find it in `api_keys`.
 *    Sets `tenant.tenantId` to the owning tenant's UUID.
 *
 * 2. **DEV_API_KEY** — if `DEV_API_KEY` is set and the token matches,
 *    auto-creates a "dev-tenant" row and uses its UUID. Lets a fresh
 *    checkout work without any DB setup.
 *
 * In production: set DEV_API_KEY="" (unset) and issue real keys via
 * POST /v1/api-keys (first key bootstrapped while DEV_API_KEY is active).
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) throw errors.unauthorized();

  // --- 1. Real API key lookup ---
  try {
    const hit = await lookupApiKey(token);
    if (hit) {
      c.set("tenant", { tenantId: hit.tenantId, apiKey: token });
      await next();
      return;
    }
  } catch {
    // DB unavailable or schema missing — fall through to DEV_API_KEY
  }

  // --- 2. Dev-mode fallback ---
  const devKey = process.env.DEV_API_KEY;
  if (devKey && token === devKey) {
    const tenant = await resolveTenant("dev-tenant");
    c.set("tenant", { tenantId: tenant.id, apiKey: token });
    await next();
    return;
  }

  throw errors.unauthorized();
};
