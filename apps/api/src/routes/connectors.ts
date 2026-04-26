import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { errors } from "@relay-e/shared";
import { resolveTenant } from "../bootstrap/tenant.js";
import {
  deleteConnector,
  listConnectorsForTenant,
  rowToConnectorConfig,
  upsertConnector,
} from "../bootstrap/connector-repo.js";
import { invalidateTenantBundle } from "../bootstrap/tenant-registry.js";
import { bearerAuth, errorResponses } from "../openapi/schemas.js";

/**
 * Tenant-scoped connector management. The same shape that lives in
 * `relay-e.config.json` for global connectors can also be POSTed here
 * to register per-tenant rows. Skills can then reference them by id.
 *
 * After every write we invalidate the tenant's cached bundle so the next
 * agent run picks up the new connector without a process restart.
 */

const ConnectorTypeSchema = z.enum(["postgres", "mysql", "mongo", "http", "websearch"]);

const CreateConnectorBody = z.object({
  type: ConnectorTypeSchema,
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/i, "alphanumeric, underscore, hyphen only"),
  name: z.string().min(1),
  config: z.record(z.unknown()),
});

const ConnectorResponse = z.object({
  id: z.string(),
  name: z.string(),
  type: ConnectorTypeSchema,
  status: z.string(),
});

const listRoute = createRoute({
  method: "get",
  path: "/v1/connectors",
  tags: ["Connectors"],
  summary: "List the calling tenant's connectors",
  security: bearerAuth,
  responses: {
    200: {
      description: "Connectors registered for this tenant",
      content: { "application/json": { schema: z.object({ data: z.array(ConnectorResponse) }) } },
    },
    ...errorResponses,
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/v1/connectors",
  tags: ["Connectors"],
  summary: "Create or update a tenant connector",
  description:
    "Idempotent on `id` — re-POSTing with the same id updates the existing connector. " +
    "Skills reference connectors by id, so keeping ids stable across updates is recommended.",
  security: bearerAuth,
  request: {
    body: { content: { "application/json": { schema: CreateConnectorBody } } },
  },
  responses: {
    200: {
      description: "Connector saved",
      content: { "application/json": { schema: ConnectorResponse } },
    },
    ...errorResponses,
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/v1/connectors/{id}",
  tags: ["Connectors"],
  summary: "Delete a tenant connector",
  security: bearerAuth,
  request: {
    params: z.object({ id: z.string().openapi({ param: { name: "id", in: "path" } }) }),
  },
  responses: {
    204: { description: "Deleted" },
    ...errorResponses,
  },
});

export const connectorRoutes = new OpenAPIHono()
  .openapi(listRoute, async (c) => {
    const tenant = await resolveTenant(c.get("tenant").tenantId);
    const rows = await listConnectorsForTenant(tenant.id);
    return c.json({
      data: rows.map((r) => ({
        id: r.name,
        name: (r.config as { display?: string }).display ?? r.name,
        type: r.type as z.infer<typeof ConnectorTypeSchema>,
        status: r.status,
      })),
    });
  })
  .openapi(createRouteDef, async (c) => {
    const body = c.req.valid("json");
    const tenant = await resolveTenant(c.get("tenant").tenantId);

    // The config payload is opaque here; the engine validates per-type at
    // construction time. Trust-but-verify: catch a thrown EngineError, surface
    // as 400 instead of crashing the request.
    try {
      const row = await upsertConnector({
        tenantId: tenant.id,
        // The body is validated as a discriminated union by the connector
        // when it's constructed. Cast via `unknown` to satisfy TS variance —
        // we don't want to duplicate Zod schemas at the route boundary.
        config: body as unknown as Parameters<typeof upsertConnector>[0]["config"],
      });
      await invalidateTenantBundle(c.get("tenant").tenantId);
      return c.json({
        id: row.name,
        name: (row.config as { display?: string }).display ?? row.name,
        type: row.type as z.infer<typeof ConnectorTypeSchema>,
        status: row.status,
      });
    } catch (err) {
      throw errors.invalidRequest(
        "connector_save_failed",
        err instanceof Error ? err.message : "save_failed",
      );
    }
  })
  .openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const tenant = await resolveTenant(c.get("tenant").tenantId);
    const ok = await deleteConnector(tenant.id, id);
    if (!ok) throw errors.notFound("connector");
    await invalidateTenantBundle(c.get("tenant").tenantId);
    return c.body(null, 204);
  });

// re-export for tests
export { rowToConnectorConfig };
