import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { childLogger, errors, ids } from "@relay-e/shared";
import { runAgent, type AgentEvent } from "@relay-e/engine";
import { context, providers, skills, tools } from "../bootstrap/registries.js";
import {
  SessionIdParam,
  ToolCallSchema,
  UsageSchema,
  bearerAuth,
  errorResponses,
} from "../openapi/schemas.js";

const SendMessageBodySchema = z
  .object({
    prompt: z.string().min(1).openapi({ example: "How much did I spend on food last month?" }),
    skills: z.array(z.string()).optional().openapi({ example: ["financial-advisor"] }),
    stream: z.boolean().optional().openapi({
      description: "If true, response is SSE (text/event-stream); otherwise JSON.",
      example: false,
    }),
    modelKey: z.string().optional().openapi({ example: "claude-sonnet-4-6" }),
  })
  .openapi("SendMessageBody");

const MessageResponseSchema = z
  .object({
    id: z.string().openapi({ example: "msg_abc" }),
    session_id: z.string(),
    role: z.literal("assistant"),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    usage: UsageSchema,
    finish_reason: z.string().openapi({ example: "stop" }),
    tool_calls: z.array(ToolCallSchema),
    context: z.object({ sources: z.array(z.string()) }),
  })
  .openapi("MessageResponse");

const SendMessageRoute = createRoute({
  method: "post",
  path: "/v1/sessions/{id}/messages",
  tags: ["Messages"],
  summary: "Send a message and run the agent",
  description:
    "Runs the agent loop against the given session. Returns JSON when `stream` is false (default) " +
    "or an SSE stream when `stream: true` is set. SSE event types: `thinking`, `context_resolved`, " +
    "`tool_call`, `tool_result`, `usage`, `text`, `done`, `error`.",
  security: bearerAuth,
  request: {
    params: SessionIdParam,
    body: {
      content: { "application/json": { schema: SendMessageBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Agent response (JSON when stream=false, SSE when stream=true)",
      content: {
        "application/json": { schema: MessageResponseSchema },
        "text/event-stream": {
          schema: z.string().openapi({
            description: "SSE stream — events documented in route description",
          }),
        },
      },
    },
    ...errorResponses,
  },
});

export const messagesRoutes = new OpenAPIHono().openapi(SendMessageRoute, async (c) => {
  const tenant = c.get("tenant");
  const requestId = c.get("requestId");
  const { id: sessionId } = c.req.valid("param");
  const { prompt, skills: skillNames, stream, modelKey } = c.req.valid("json");

  const log = childLogger({ requestId, sessionId, tenantId: tenant.tenantId });
  const skillDefs = skills.resolve(skillNames ?? ["financial-advisor"]);

  const ac = new AbortController();
  c.req.raw.signal.addEventListener("abort", () => ac.abort());

  const runId = ids.run();

  if (stream) {
    return streamSSE(c, async (sse) => {
      const send = async (event: AgentEvent) => {
        await sse.writeSSE({ event: event.type, data: JSON.stringify(event) });
      };
      try {
        const result = await runAgent(
          { tenantId: tenant.tenantId, sessionId, runId, prompt, skills: skillDefs, modelKey },
          { providers, tools, context, logger: log, emit: send },
          ac.signal,
        );
        await sse.writeSSE({ event: "text", data: JSON.stringify({ text: result.text }) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "agent_failed";
        await sse.writeSSE({ event: "error", data: JSON.stringify({ message }) });
      }
    });
  }

  const result = await runAgent(
    { tenantId: tenant.tenantId, sessionId, runId, prompt, skills: skillDefs, modelKey },
    { providers, tools, context, logger: log },
    ac.signal,
  );

  if (!result) throw errors.internal("agent_returned_no_result");

  return c.json({
    id: ids.message(),
    session_id: sessionId,
    role: "assistant" as const,
    content: [{ type: "text" as const, text: result.text }],
    usage: result.usage,
    finish_reason: result.finishReason,
    tool_calls: result.toolCalls,
    context: { sources: result.context.items.map((i) => i.source) },
  });
});
