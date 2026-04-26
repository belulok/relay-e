import type { OpenAPIHono } from "@hono/zod-openapi";
import { healthRoutes } from "./health.js";
import { skillRoutes } from "./skills.js";
import { messagesRoutes } from "./messages.js";
import { connectorRoutes } from "./connectors.js";
import { apiKeyRoutes } from "./api-keys.js";

/**
 * Public route modules. Add a new file under `routes/`, import it here, and
 * append the entry below. The `requiresAuth` flag controls whether the auth
 * middleware is applied. The OpenAPI spec at /openapi.json is regenerated from
 * these on each request, so new routes appear in the docs automatically.
 */
export interface RouteModule {
  name: string;
  basePath: string;
  app: OpenAPIHono;
  requiresAuth: boolean;
}

export const routeModules: RouteModule[] = [
  { name: "health", basePath: "/", app: healthRoutes, requiresAuth: false },
  { name: "skills", basePath: "/", app: skillRoutes, requiresAuth: true },
  { name: "messages", basePath: "/", app: messagesRoutes, requiresAuth: true },
  { name: "connectors", basePath: "/", app: connectorRoutes, requiresAuth: true },
  { name: "api-keys", basePath: "/", app: apiKeyRoutes, requiresAuth: true },
];
