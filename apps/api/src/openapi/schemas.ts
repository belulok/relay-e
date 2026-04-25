import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.object({
      type: z
        .enum([
          "invalid_request_error",
          "authentication_error",
          "permission_error",
          "not_found_error",
          "rate_limit_error",
          "tenant_quota_error",
          "provider_error",
          "tool_execution_error",
          "context_error",
          "internal_error",
        ])
        .openapi({ example: "invalid_request_error" }),
      code: z.string().openapi({ example: "invalid_body" }),
      message: z.string().openapi({ example: "Request body did not match schema" }),
      request_id: z.string().optional().openapi({ example: "req_abc123" }),
      details: z.record(z.unknown()).optional(),
    }),
  })
  .openapi("Error");

export const UsageSchema = z
  .object({
    tokens_in: z.number().int().openapi({ example: 1234 }),
    tokens_out: z.number().int().openapi({ example: 567 }),
    cache_read_tokens: z.number().int().optional().openapi({ example: 800 }),
    cache_write_tokens: z.number().int().optional().openapi({ example: 100 }),
    cost_usd: z.number().openapi({ example: 0.012 }),
  })
  .openapi("Usage");

export const ContentBlockSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({
      type: z.literal("image"),
      file_id: z.string().optional(),
      url: z.string().url().optional(),
      mime: z.string().default("image/png"),
    }),
    z.object({
      type: z.literal("audio"),
      file_id: z.string().optional(),
      transcript: z.string().optional(),
      duration_s: z.number().optional(),
    }),
    z.object({
      type: z.literal("document"),
      file_id: z.string(),
      summary: z.string().optional(),
    }),
  ])
  .openapi("ContentBlock");

export const ToolCallSchema = z
  .object({
    name: z.string(),
    input: z.unknown(),
    output: z.unknown(),
    is_error: z.boolean().optional(),
  })
  .openapi("ToolCall");

export const SessionIdParam = z
  .object({
    id: z
      .string()
      .min(1)
      .openapi({
        param: { name: "id", in: "path" },
        example: "demo",
        description: "Session identifier (free-form string for now)",
      }),
  })
  .openapi("SessionIdParam");

export const errorResponses = {
  400: { description: "Invalid request", content: { "application/json": { schema: ErrorSchema } } },
  401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
  404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } },
  429: { description: "Rate limited", content: { "application/json": { schema: ErrorSchema } } },
  500: { description: "Server error", content: { "application/json": { schema: ErrorSchema } } },
} as const;

export const bearerAuth: { bearerAuth: string[] }[] = [{ bearerAuth: [] }];
