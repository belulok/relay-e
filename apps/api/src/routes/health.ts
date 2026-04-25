import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const HealthSchema = z
  .object({
    status: z.enum(["ok", "degraded"]).openapi({ example: "ok" }),
    version: z.string().openapi({ example: "0.0.1" }),
    uptime_s: z.number().int().openapi({ example: 42 }),
  })
  .openapi("HealthStatus");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Service health",
  description: "Liveness probe. Always returns 200 when the process is up.",
  responses: {
    200: {
      description: "Service is up",
      content: { "application/json": { schema: HealthSchema } },
    },
  },
});

export const healthRoutes = new OpenAPIHono().openapi(healthRoute, (c) =>
  c.json({
    status: "ok" as const,
    version: "0.0.1",
    uptime_s: Math.round(process.uptime()),
  }),
);
