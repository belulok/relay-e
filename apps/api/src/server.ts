import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { logger as appLogger } from "@relay-e/shared";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { routeModules } from "./routes/index.js";
import { bootstrap } from "./bootstrap/registries.js";

const app = new OpenAPIHono();

app.use("*", requestIdMiddleware);
app.use("*", honoLogger((message) => appLogger.debug(message)));
app.use("*", cors());

// Mount each route module. Auth-protected modules get the auth middleware
// scoped to their basePath so introspection of /openapi.json stays public.
for (const mod of routeModules) {
  if (mod.requiresAuth) app.use(`${mod.basePath}v1/*`, authMiddleware);
  app.route(mod.basePath, mod.app);
}

// Auto-generated OpenAPI spec. New routes registered above appear here automatically.
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Relay-E API",
    version: "0.0.1",
    description:
      "Context-aware AI orchestration engine. Add a route under apps/api/src/routes/, " +
      "register it in routes/index.ts, and it shows up here on the next request.",
  },
  servers: [
    { url: "http://localhost:3001", description: "Local dev" },
  ],
});

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "API key — send as `Authorization: Bearer <key>`.",
});

// Interactive docs UI (Scalar; modern alternative to Swagger UI).
// Scalar's published types only declare a subset of the runtime config; cast through
// to access `url` without losing strictness anywhere else.
app.get(
  "/docs",
  apiReference({
    pageTitle: "Relay-E API",
    url: "/openapi.json",
  } as Parameters<typeof apiReference>[0]),
);

app.onError(errorHandler);

const port = Number(process.env.API_PORT ?? 3001);
const hostname = process.env.API_HOST ?? "0.0.0.0";

// Load skills + connectors from relay-e.config.json before accepting traffic.
// If config loading fails for one entry, that entry is skipped and logged;
// the server still boots so users can fix their config without losing the
// rest of the engine.
await bootstrap();

serve({ fetch: app.fetch, port, hostname }, (info) => {
  appLogger.info(
    { port: info.port, hostname, docs: `http://localhost:${info.port}/docs` },
    "relay-e api started",
  );
});
