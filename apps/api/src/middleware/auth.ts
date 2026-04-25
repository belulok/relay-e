import type { MiddlewareHandler } from "hono";
import { errors } from "@relay-e/shared";

export interface TenantContext {
  tenantId: string;
  apiKey: string;
}

declare module "hono" {
  interface ContextVariableMap {
    tenant: TenantContext;
    requestId: string;
  }
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization");
  const key = header?.startsWith("Bearer ") ? header.slice(7) : header;
  const expected = process.env.DEV_API_KEY;
  if (!expected) {
    throw errors.internal("DEV_API_KEY is not set");
  }
  if (!key || key !== expected) {
    throw errors.unauthorized();
  }
  // In dev there is one implicit tenant. Multi-tenant lookup comes from the DB later.
  c.set("tenant", { tenantId: "dev-tenant", apiKey: key });
  await next();
};
