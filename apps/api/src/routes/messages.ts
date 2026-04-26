import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { childLogger, errors, ids } from "@relay-e/shared";
import { runAgent, type AgentEvent } from "@relay-e/engine";
import { context, providers, tools } from "../bootstrap/registries.js";
import { getTenantBundle, tenantConnectorSource } from "../bootstrap/tenant-registry.js";
import { ensureSession, persistTurn, persistFailedRun } from "../bootstrap/run-repo.js";
import { quotaMiddleware, invalidateUsageCache } from "../middleware/quota.js";
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

const _app = new OpenAPIHono();
// Quota check runs before every handler in this sub-app, after auth sets tenant context.
_app.use("*", quotaMiddleware);
export const messagesRoutes = _app.openapi(SendMessageRoute, async (c) => {
    const tenant = c.get("tenant");
    const requestId = c.get("requestId");
    const { id: sessionKey } = c.req.valid("param");
    const { prompt, skills: skillNames, stream, modelKey } = c.req.valid("json");

    const log = childLogger({ requestId, sessionId: sessionKey, tenantId: tenant.tenantId });

    // Resolve the per-tenant bundle: JSON globals + DB rows from /v1/connectors + /v1/skills.
    const bundle = await getTenantBundle(tenant.tenantId);
    const fallbackSkill = bundle.skills.list()[0]?.name;
    const requestedSkills = skillNames && skillNames.length > 0
      ? skillNames
      : fallbackSkill
        ? [fallbackSkill]
        : [];
    const skillDefs = bundle.skills.resolve(requestedSkills);
    const skillIds = skillDefs.map((s) => s.name);
    const connectorSource = tenantConnectorSource(bundle);

    // Ensure the session row exists before inserting messages that FK into it.
    const sessionId = await ensureSession(tenant.tenantId, sessionKey, skillIds);

    const ac = new AbortController();
    c.req.raw.signal.addEventListener("abort", () => ac.abort());

    const runId = ids.run();
    const startedAt = new Date();

    if (stream) {
      return streamSSE(c, async (sse) => {
        const send = async (event: AgentEvent) => {
          await sse.writeSSE({ event: event.type, data: JSON.stringify(event) });
        };
        let result;
        try {
          result = await runAgent(
            { tenantId: tenant.tenantId, sessionId, runId, prompt, skills: skillDefs, modelKey },
            { providers, tools, context, connectors: connectorSource, logger: log, emit: send },
            ac.signal,
          );
          await sse.writeSSE({ event: "text", data: JSON.stringify({ text: result.text }) });
        } catch (err) {
          const message = err instanceof Error ? err.message : "agent_failed";
          await sse.writeSSE({ event: "error", data: JSON.stringify({ message }) });
          persistFailedRun({ tenantId: tenant.tenantId, sessionId, prompt, skillIds, startedAt, error: message })
            .catch((e) => log.error(e, "persist_failed_run_error"));
          return;
        }
        // Fire-and-forget — response is already streaming, don't block it
        const resolvedModel = modelKey ?? "routed";
        persistTurn({
          tenantId: tenant.tenantId,
          sessionId,
          prompt,
          responseText: result.text,
          toolCalls: result.toolCalls,
          usage: result.usage,
          modelKey: resolvedModel,
          skillIds,
          steps: result.steps,
          finishReason: result.finishReason,
          startedAt,
        })
          .then(() => invalidateUsageCache(tenant.tenantId))
          .catch((e) => log.error(e, "persist_turn_failed"));
      });
    }

    let result;
    try {
      result = await runAgent(
        { tenantId: tenant.tenantId, sessionId, runId, prompt, skills: skillDefs, modelKey },
        { providers, tools, context, connectors: connectorSource, logger: log },
        ac.signal,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "agent_failed";
      persistFailedRun({ tenantId: tenant.tenantId, sessionId, prompt, skillIds, startedAt, error: message })
        .catch((e) => log.error(e, "persist_failed_run_error"));
      throw errors.internal(message);
    }

    if (!result) throw errors.internal("agent_returned_no_result");

    const resolvedModel = modelKey ?? "unknown";
    // Fire-and-forget — return the JSON response without waiting for DB writes
    persistTurn({
      tenantId: tenant.tenantId,
      sessionId,
      prompt,
      responseText: result.text,
      toolCalls: result.toolCalls,
      usage: result.usage,
      modelKey: resolvedModel,
      skillIds,
      steps: result.steps,
      finishReason: result.finishReason,
      startedAt,
    })
      .then(() => invalidateUsageCache(tenant.tenantId))
      .catch((e) => log.error(e, "persist_turn_failed"));

    return c.json({
      id: ids.message(),
      session_id: sessionKey,
      role: "assistant" as const,
      content: [{ type: "text" as const, text: result.text }],
      usage: result.usage,
      finish_reason: result.finishReason,
      tool_calls: result.toolCalls,
      context: { sources: result.context.items.map((i) => i.source) },
    });
  });
