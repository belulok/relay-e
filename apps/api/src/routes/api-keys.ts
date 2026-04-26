import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { errors } from "@relay-e/shared";
import {
  createApiKey,
  listApiKeysForTenant,
  revokeApiKey,
} from "../bootstrap/api-key-repo.js";
import { bearerAuth, errorResponses } from "../openapi/schemas.js";

/**
 * API key management for the calling tenant.
 *
 * Keys are generated here, stored as SHA-256 hashes — the raw key is returned
 * exactly once in the POST response and never shown again.
 *
 * Bootstrap flow:
 *   1. Use DEV_API_KEY to call POST /v1/api-keys and save the returned key.
 *   2. Unset DEV_API_KEY in production; all auth goes through the DB.
 */

const ApiKeyResponse = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    prefix: z.string().openapi({ description: "First 12 characters — safe to display" }),
    created_at: z.string().datetime(),
    revoked_at: z.string().datetime().nullable(),
  })
  .openapi("ApiKey");

const CreateApiKeyBody = z.object({
  name: z.string().min(1).max(64).openapi({ example: "Production key" }),
});

const listRoute = createRoute({
  method: "get",
  path: "/v1/api-keys",
  tags: ["API Keys"],
  summary: "List tenant API keys",
  description: "Lists active (non-revoked) API keys for this tenant. Key hashes are never returned.",
  security: bearerAuth,
  responses: {
    200: {
      description: "API keys",
      content: { "application/json": { schema: z.object({ data: z.array(ApiKeyResponse) }) } },
    },
    ...errorResponses,
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/v1/api-keys",
  tags: ["API Keys"],
  summary: "Create an API key",
  description:
    "Generates a new API key for this tenant. The `key` field in the response is the raw " +
    "key — store it securely, it will **not** be shown again.",
  security: bearerAuth,
  request: { body: { content: { "application/json": { schema: CreateApiKeyBody } } } },
  responses: {
    201: {
      description: "API key created",
      content: {
        "application/json": {
          schema: ApiKeyResponse.extend({
            key: z.string().openapi({
              description: "Full raw API key — shown once only. Prefix it with `Bearer ` in Authorization headers.",
              example: "rle-a1b2c3d4e5f6...",
            }),
          }),
        },
      },
    },
    ...errorResponses,
  },
});

const revokeRoute = createRoute({
  method: "delete",
  path: "/v1/api-keys/{id}",
  tags: ["API Keys"],
  summary: "Revoke an API key",
  description: "Soft-deletes the key. Requests using the revoked key will immediately get 401.",
  security: bearerAuth,
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: {
    204: { description: "Revoked" },
    ...errorResponses,
  },
});

export const apiKeyRoutes = new OpenAPIHono()
  .openapi(listRoute, async (c) => {
    const { tenantId } = c.get("tenant");
    const rows = await listApiKeysForTenant(tenantId);
    return c.json({
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        prefix: r.keyPrefix,
        created_at: r.createdAt.toISOString(),
        revoked_at: r.revokedAt?.toISOString() ?? null,
      })),
    });
  })
  .openapi(createRoute_, async (c) => {
    const { tenantId } = c.get("tenant");
    const { name } = c.req.valid("json");
    const { row, raw } = await createApiKey(tenantId, name);
    return c.json(
      {
        id: row.id,
        name: row.name,
        prefix: row.keyPrefix,
        key: raw,
        created_at: row.createdAt.toISOString(),
        revoked_at: null,
      },
      201,
    );
  })
  .openapi(revokeRoute, async (c) => {
    const { tenantId } = c.get("tenant");
    const { id } = c.req.valid("param");
    const ok = await revokeApiKey(tenantId, id);
    if (!ok) throw errors.notFound("api_key");
    return c.body(null, 204);
  });
