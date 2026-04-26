import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { tools } from "../bootstrap/registries.js";
import { getTenantBundle } from "../bootstrap/tenant-registry.js";
import { bearerAuth, errorResponses } from "../openapi/schemas.js";

const SkillSchema = z
  .object({
    name: z.string().openapi({ example: "shop-assistant" }),
    description: z.string().nullable(),
    tools: z.array(z.string()).openapi({ example: [], description: "Explicit in-process tool names. Usually empty — connectors generate the tools." }),
    connectors: z
      .array(z.string())
      .openapi({ example: ["shop_db", "stripe", "web"], description: "Connector ids the skill has access to." }),
    preferred_tier: z.enum(["fast", "balanced", "premium"]).nullable(),
  })
  .openapi("Skill");

const ToolSchema = z
  .object({
    name: z.string().openapi({ example: "get_balance" }),
    description: z.string(),
    requires_approval: z.boolean(),
  })
  .openapi("Tool");

const ListSkillsRoute = createRoute({
  method: "get",
  path: "/v1/skills",
  tags: ["Skills"],
  summary: "List registered skills",
  security: bearerAuth,
  responses: {
    200: {
      description: "Available skills",
      content: { "application/json": { schema: z.object({ data: z.array(SkillSchema) }) } },
    },
    ...errorResponses,
  },
});

const ListToolsRoute = createRoute({
  method: "get",
  path: "/v1/tools",
  tags: ["Tools"],
  summary: "List registered tools",
  security: bearerAuth,
  responses: {
    200: {
      description: "Available tools",
      content: { "application/json": { schema: z.object({ data: z.array(ToolSchema) }) } },
    },
    ...errorResponses,
  },
});

export const introspectionRoutes = new OpenAPIHono()
  .openapi(ListSkillsRoute, async (c) => {
    const bundle = await getTenantBundle(c.get("tenant").tenantId);
    return c.json({
      data: bundle.skills.list().map((s) => ({
        name: s.name,
        description: s.description ?? null,
        tools: s.toolNames ?? [],
        connectors: s.connectorIds ?? [],
        preferred_tier: s.preferredTier ?? null,
      })),
    });
  })
  .openapi(ListToolsRoute, async (c) => {
    // Explicit (in-process) tools + every active connector's tools, where
    // "active" = global JSON connectors + this tenant's DB rows.
    const explicit = tools.list().map((t) => ({
      name: t.name,
      description: t.description,
      requires_approval: Boolean(t.requiresApproval),
    }));

    const bundle = await getTenantBundle(c.get("tenant").tenantId);
    const fromConnectors = (
      await Promise.all(bundle.connectors.list().map((c) => c.tools()))
    )
      .flat()
      .map((t) => ({
        name: t.name,
        description: t.description,
        requires_approval: Boolean(t.requiresApproval),
      }));

    const byName = new Map<string, (typeof fromConnectors)[number]>();
    for (const t of explicit) byName.set(t.name, t);
    for (const t of fromConnectors) byName.set(t.name, t);

    return c.json({ data: [...byName.values()] });
  });
