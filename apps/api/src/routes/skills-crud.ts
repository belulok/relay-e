import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { errors } from "@relay-e/shared";
import { resolveTenant } from "../bootstrap/tenant.js";
import {
  deleteSkill,
  listSkillsForTenant,
  rowToSkillDefinition,
  upsertSkill,
} from "../bootstrap/skill-repo.js";
import { invalidateTenantBundle } from "../bootstrap/tenant-registry.js";
import { bearerAuth, errorResponses } from "../openapi/schemas.js";

/**
 * Tenant-scoped skill management. Pairs with `/v1/connectors`: customers
 * register their connectors first, then compose skills that reference them.
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

const TenantSkillResponse = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  systemPrompt: z.string(),
  connectorIds: z.array(z.string()),
  toolNames: z.array(z.string()),
  preferredTier: PreferredTier.nullable(),
});

const listRoute = createRoute({
  method: "get",
  path: "/v1/tenant-skills",
  tags: ["Skills"],
  summary: "List the calling tenant's skills",
  security: bearerAuth,
  responses: {
    200: {
      description: "Skills registered for this tenant",
      content: { "application/json": { schema: z.object({ data: z.array(TenantSkillResponse) }) } },
    },
    ...errorResponses,
  },
});

const upsertRoute = createRoute({
  method: "post",
  path: "/v1/tenant-skills",
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
      content: { "application/json": { schema: TenantSkillResponse } },
    },
    ...errorResponses,
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/v1/tenant-skills/{id}",
  tags: ["Skills"],
  summary: "Delete a tenant skill",
  security: bearerAuth,
  request: { params: z.object({ id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }) }) },
  responses: { 204: { description: "Deleted" }, ...errorResponses },
});

export const tenantSkillRoutes = new OpenAPIHono()
  .openapi(listRoute, async (c) => {
    const tenant = await resolveTenant(c.get("tenant").tenantId);
    const rows = await listSkillsForTenant(tenant.id);
    return c.json({
      data: rows.map((r) => {
        const sd = rowToSkillDefinition(r);
        return {
          id: r.id,
          name: r.name,
          description: r.description ?? null,
          systemPrompt: r.systemPrompt,
          connectorIds: sd.connectorIds ?? [],
          toolNames: sd.toolNames ?? [],
          preferredTier: sd.preferredTier ?? null,
        };
      }),
    });
  })
  .openapi(upsertRoute, async (c) => {
    const body = c.req.valid("json");
    const tenant = await resolveTenant(c.get("tenant").tenantId);
    try {
      const row = await upsertSkill({
        tenantId: tenant.id,
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
      await invalidateTenantBundle(c.get("tenant").tenantId);
      const sd = rowToSkillDefinition(row);
      return c.json({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        systemPrompt: row.systemPrompt,
        connectorIds: sd.connectorIds ?? [],
        toolNames: sd.toolNames ?? [],
        preferredTier: sd.preferredTier ?? null,
      });
    } catch (err) {
      throw errors.invalidRequest(
        "skill_save_failed",
        err instanceof Error ? err.message : "save_failed",
      );
    }
  })
  .openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const tenant = await resolveTenant(c.get("tenant").tenantId);
    const ok = await deleteSkill(tenant.id, id);
    if (!ok) throw errors.notFound("skill");
    await invalidateTenantBundle(c.get("tenant").tenantId);
    return c.body(null, 204);
  });
