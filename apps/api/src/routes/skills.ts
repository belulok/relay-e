import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { skills, tools } from "../bootstrap/registries.js";
import { bearerAuth, errorResponses } from "../openapi/schemas.js";

const SkillSchema = z
  .object({
    name: z.string().openapi({ example: "financial-advisor" }),
    description: z.string().nullable(),
    tools: z.array(z.string()).openapi({ example: ["get_balance", "analyze_spending"] }),
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
  .openapi(ListSkillsRoute, (c) =>
    c.json({
      data: skills.list().map((s) => ({
        name: s.name,
        description: s.description ?? null,
        tools: s.toolNames,
        preferred_tier: s.preferredTier ?? null,
      })),
    }),
  )
  .openapi(ListToolsRoute, (c) =>
    c.json({
      data: tools.list().map((t) => ({
        name: t.name,
        description: t.description,
        requires_approval: Boolean(t.requiresApproval),
      })),
    }),
  );
