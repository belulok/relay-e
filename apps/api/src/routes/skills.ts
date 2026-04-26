import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { errors } from "@relay-e/shared";
import { tools, connectors as globalConnectors } from "../bootstrap/registries.js";
import {
  deleteSkill,
  listSkillsForTenant,
  rowToSkillDefinition,
  upsertSkill,
} from "../bootstrap/skill-repo.js";
import { getTenantBundle, invalidateTenantBundle } from "../bootstrap/tenant-registry.js";
import { bearerAuth, errorResponses } from "../openapi/schemas.js";

/**
 * Unified skill management. GET /v1/skills lists all skills (global + tenant);
 * POST /v1/skills and DELETE /v1/skills/{id} manage tenant-scoped skills.
 * GET /v1/tools lists all active tools across global + tenant connectors.
 */

const PreferredTier = z.enum(["fast", "balanced", "premium"]);

const SkillBody = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_-]+$/i, "alphanumeric, underscore, hyphen only"),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  connectorIds: z.array(z.string()).optional(),
  toolNames: z.array(z.string()).optional(),
  preferredTier: PreferredTier.optional(),
  examples: z
    .array(z.object({ input: z.string(), output: z.string() }))
    .optional(),
});

const SkillResponse = z
  .object({
    id: z.string().uuid().nullable().openapi({
      description: "DB id; null for global skills loaded from config",
    }),
    name: z.string(),
    description: z.string().nullable(),
    systemPrompt: z.string(),
    connectorIds: z.array(z.string()),
    toolNames: z.array(z.string()),
    preferredTier: PreferredTier.nullable(),
    source: z.enum(["global", "tenant"]).openapi({
      description: "Where this skill was registered from",
    }),
  })
  .openapi("Skill");

const ToolResponse = z
  .object({
    name: z.string().openapi({ example: "query_shop_db" }),
    description: z.string(),
    requires_approval: z.boolean(),
  })
  .openapi("Tool");

const listSkillsRoute = createRoute({
  method: "get",
  path: "/v1/skills",
  tags: ["Skills"],
  summary: "List all skills (global + tenant)",
  security: bearerAuth,
  responses: {
    200: {
      description: "All skills visible to this tenant",
      content: { "application/json": { schema: z.object({ data: z.array(SkillResponse) }) } },
    },
    ...errorResponses,
  },
});

const upsertSkillRoute = createRoute({
  method: "post",
  path: "/v1/skills",
  tags: ["Skills"],
  summary: "Create or update a tenant skill",
  description:
    "Idempotent on `name` — re-POSTing with the same name updates the existing skill. " +
    "Tenant skills override globals on name collision.",
  security: bearerAuth,
  request: { body: { content: { "application/json": { schema: SkillBody } } } },
  responses: {
    200: {
      description: "Skill saved",
      content: { "application/json": { schema: SkillResponse } },
    },
    ...errorResponses,
  },
});

const deleteSkillRoute = createRoute({
  method: "delete",
  path: "/v1/skills/{id}",
  tags: ["Skills"],
  summary: "Delete a tenant skill",
  security: bearerAuth,
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
    }),
  },
  responses: { 204: { description: "Deleted" }, ...errorResponses },
});

const listToolsRoute = createRoute({
  method: "get",
  path: "/v1/tools",
  tags: ["Tools"],
  summary: "List all active tools",
  description:
    "Returns explicit in-process tools plus every tool contributed by global and " +
    "tenant connectors. Deduped by name — tenant connector tool wins on collision.",
  security: bearerAuth,
  responses: {
    200: {
      description: "Available tools",
      content: { "application/json": { schema: z.object({ data: z.array(ToolResponse) }) } },
    },
    ...errorResponses,
  },
});

function toolShape(t: { name: string; description: string; requiresApproval?: boolean }) {
  return { name: t.name, description: t.description, requires_approval: Boolean(t.requiresApproval) };
}

export const skillRoutes = new OpenAPIHono()
  .openapi(listSkillsRoute, async (c) => {
    const { tenantId } = c.get("tenant");
    const bundle = await getTenantBundle(tenantId);
    const tenantRows = await listSkillsForTenant(tenantId);
    const tenantNames = new Set(tenantRows.map((r) => r.name));

    const tenantItems = tenantRows.map((r) => {
      const sd = rowToSkillDefinition(r);
      return {
        id: r.id,
        name: r.name,
        description: r.description ?? null,
        systemPrompt: r.systemPrompt,
        connectorIds: sd.connectorIds ?? [],
        toolNames: sd.toolNames ?? [],
        preferredTier: sd.preferredTier ?? null,
        source: "tenant" as const,
      };
    });

    const globalItems = bundle.skills
      .list()
      .filter((s) => !tenantNames.has(s.name))
      .map((s) => ({
        id: null,
        name: s.name,
        description: s.description ?? null,
        systemPrompt: s.systemPrompt ?? "",
        connectorIds: s.connectorIds ?? [],
        toolNames: s.toolNames ?? [],
        preferredTier: s.preferredTier ?? null,
        source: "global" as const,
      }));

    return c.json({ data: [...globalItems, ...tenantItems] });
  })
  .openapi(upsertSkillRoute, async (c) => {
    const { tenantId } = c.get("tenant");
    const body = c.req.valid("json");
    try {
      const row = await upsertSkill({
        tenantId,
        skill: {
          name: body.name,
          description: body.description,
          systemPrompt: body.systemPrompt,
          connectorIds: body.connectorIds,
          toolNames: body.toolNames,
          preferredTier: body.preferredTier,
          examples: body.examples,
        },
      });
      await invalidateTenantBundle(tenantId);
      const sd = rowToSkillDefinition(row);
      return c.json({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        systemPrompt: row.systemPrompt,
        connectorIds: sd.connectorIds ?? [],
        toolNames: sd.toolNames ?? [],
        preferredTier: sd.preferredTier ?? null,
        source: "tenant" as const,
      });
    } catch (err) {
      throw errors.invalidRequest(
        "skill_save_failed",
        err instanceof Error ? err.message : "save_failed",
      );
    }
  })
  .openapi(deleteSkillRoute, async (c) => {
    const { tenantId } = c.get("tenant");
    const { id } = c.req.valid("param");
    const ok = await deleteSkill(tenantId, id);
    if (!ok) throw errors.notFound("skill");
    await invalidateTenantBundle(tenantId);
    return c.body(null, 204);
  })
  .openapi(listToolsRoute, async (c) => {
    const { tenantId } = c.get("tenant");
    const bundle = await getTenantBundle(tenantId);

    const byName = new Map<string, ReturnType<typeof toolShape>>();

    // Explicit in-process tools (lowest priority)
    for (const t of tools.list()) byName.set(t.name, toolShape(t));

    // Global connector tools
    for (const t of (await Promise.all(globalConnectors.list().map((conn) => conn.tools()))).flat()) {
      byName.set(t.name, toolShape(t));
    }

    // Tenant connector tools (highest priority — override on collision)
    for (const t of (await Promise.all(bundle.connectors.list().map((conn) => conn.tools()))).flat()) {
      byName.set(t.name, toolShape(t));
    }

    return c.json({ data: [...byName.values()] });
  });

// Backward-compat alias so existing imports don't break immediately
export { skillRoutes as introspectionRoutes };
