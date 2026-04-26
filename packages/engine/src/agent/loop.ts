import { generateText, tool, type CoreMessage, type ToolSet } from "ai";
import { z } from "zod";
import {
  ZERO_USAGE,
  addUsage,
  approxTokenCount,
  childLogger,
  errors,
  ids,
  priceUsage,
  type Logger,
  type UsageMeter,
} from "@relay-e/shared";
import {
  ProviderRegistry,
  pricingFor,
  type ResolvedChatModel,
} from "@relay-e/providers";
import type { SkillDefinition } from "../skills/index.js";
import type { AnyToolDefinition, ToolRegistry } from "../tools/index.js";
import type { ContextResolver, ContextBundle } from "../context/index.js";
/**
 * Minimal surface the agent loop needs from a connector source.
 *
 * The shared `ConnectorRegistry` already implements this — but per-request
 * tenant-scoped registries (which combine JSON globals with DB rows) do too.
 * Decoupling the loop from the concrete class lets the API layer pick the
 * right source per request without leaking that into the engine.
 */
export interface ConnectorSource {
  toolsFor(ids: string[]): Promise<AnyToolDefinition[]>;
  promptContextFor(ids: string[]): Promise<string>;
}
import type { AgentEvent, AgentEventEmitter } from "./events.js";
import { allocateBudget, buildSystemPrompt } from "./prompt.js";

export interface AgentRunInput {
  tenantId: string;
  userId?: string;
  sessionId?: string;
  runId?: string;
  prompt: string;
  history?: CoreMessage[];
  skills: SkillDefinition[];
  modelKey?: string;
  maxSteps?: number;
}

export interface AgentRunResult {
  text: string;
  usage: UsageMeter;
  steps: number;
  finishReason: string;
  context: ContextBundle;
  toolCalls: { name: string; input: unknown; output: unknown; is_error?: boolean }[];
}

export interface AgentRunDeps {
  providers: ProviderRegistry;
  tools: ToolRegistry;
  context: ContextResolver;
  /**
   * Source of connectors for this run. Optional for backwards compatibility
   * with tests that don't need connectors; production wiring always passes
   * one in (typically a per-tenant adapter that merges JSON globals + DB
   * rows).
   */
  connectors?: ConnectorSource;
  logger?: Logger;
  emit?: AgentEventEmitter;
}

export async function runAgent(
  input: AgentRunInput,
  deps: AgentRunDeps,
  signal: AbortSignal = new AbortController().signal,
): Promise<AgentRunResult> {
  const baseLogger = deps.logger ?? childLogger({});
  const log = baseLogger.child({
    runId: input.runId,
    sessionId: input.sessionId,
    tenantId: input.tenantId,
  });

  const emit = deps.emit ?? (() => {});

  // 1. Pick a model based on skill preference, fall back to "balanced".
  const tier =
    input.skills.find((s) => s.preferredTier)?.preferredTier ?? "balanced";
  const modelKey = input.modelKey ?? deps.providers.routeBy(tier);
  const resolved: ResolvedChatModel = deps.providers.chat(modelKey);

  const budget = allocateBudget(resolved.descriptor.contextWindow);

  // 2. Resolve context in parallel (ports-and-adapters).
  await emit({ type: "thinking", step: "resolving_context" });
  const contextBundle = await deps.context.resolve(
    {
      tenantId: input.tenantId,
      userId: input.userId,
      sessionId: input.sessionId,
      query: input.prompt,
      skills: input.skills.map((s) => s.name),
      logger: log,
      signal,
    },
    budget.context,
  );
  await emit({
    type: "context_resolved",
    sources: contextBundle.items.map((i) => i.source),
    tokenEstimate: contextBundle.totalTokenEstimate,
  });

  // 3. Resolve connectors for the active skills — they contribute tools AND
  //    prompt context (DB schemas, API surfaces). This is what keeps the
  //    engine domain-agnostic: connectors plug in your data, the LLM sees
  //    the schema, and writes its own queries.
  const connectorIds = unique(input.skills.flatMap((s) => s.connectorIds ?? []));
  const connectorTools: AnyToolDefinition[] = deps.connectors
    ? await deps.connectors.toolsFor(connectorIds)
    : [];
  const connectorContext = deps.connectors
    ? await deps.connectors.promptContextFor(connectorIds)
    : "";

  // 4. Build the system prompt with cacheable structure (stable parts up front).
  const systemPrompt = buildSystemPrompt({
    skills: input.skills,
    context: contextBundle,
    connectorContext,
  });

  // 5. Combine connector-derived tools with any in-process tools the skills
  //    explicitly declared. Connectors are the common path; `toolNames` is
  //    a fallback for one-off tools that aren't worth a connector.
  const explicitToolNames = unique(input.skills.flatMap((s) => s.toolNames ?? []));
  const explicitTools = deps.tools.pick(explicitToolNames);
  const toolDefs: AnyToolDefinition[] = [...connectorTools, ...explicitTools];
  const toolCalls: AgentRunResult["toolCalls"] = [];

  const aiTools: ToolSet = Object.fromEntries(
    toolDefs.map((td) => [
      td.name,
      tool({
        description: td.description,
        parameters: td.inputSchema as z.ZodType,
        execute: async (rawInput: unknown) => {
          const callId = ids.toolCall();
          await emit({ type: "tool_call", tool_call_id: callId, name: td.name, input: rawInput });
          if (td.requiresApproval) {
            await emit({
              type: "tool_awaiting_approval",
              tool_call_id: callId,
              name: td.name,
              input: rawInput,
            });
            // In the synchronous loop we do not actually pause; queued runs
            // implement approval gating via the runs table + run.approve().
          }
          try {
            const output = await td.execute(rawInput as never, {
              tenantId: input.tenantId,
              userId: input.userId,
              sessionId: input.sessionId,
              runId: input.runId,
              config: {},
              logger: log.child({ tool: td.name }),
              signal,
            });
            toolCalls.push({ name: td.name, input: rawInput, output });
            await emit({ type: "tool_result", tool_call_id: callId, name: td.name, output });
            return output ?? { ok: true };
          } catch (err) {
            const message = err instanceof Error ? err.message : "tool_error";
            toolCalls.push({ name: td.name, input: rawInput, output: { error: message }, is_error: true });
            await emit({
              type: "tool_result",
              tool_call_id: callId,
              name: td.name,
              output: { error: message },
              is_error: true,
            });
            throw errors.tool(td.name, message);
          }
        },
      }),
    ]),
  );

  // 5. Run the loop. Vercel AI SDK handles the call → tool → call cycle via maxSteps.
  const messages: CoreMessage[] = [
    ...(input.history ?? []),
    { role: "user", content: input.prompt },
  ];

  const maxSteps = input.maxSteps ?? 8;

  await emit({ type: "thinking", step: "calling_model" });
  const result = await generateText({
    model: resolved.model,
    system: systemPrompt,
    messages,
    tools: aiTools,
    maxSteps,
    abortSignal: signal,
    experimental_telemetry: { isEnabled: false },
  });

  // 6. Account usage. Provider-reported counts are the source of truth; fall back to a heuristic.
  const reportedIn = result.usage?.promptTokens ?? approxTokenCount(systemPrompt + input.prompt);
  const reportedOut = result.usage?.completionTokens ?? approxTokenCount(result.text);
  const usage = priceUsage(pricingFor(modelKey), {
    input: reportedIn,
    output: reportedOut,
  });

  await emit({ type: "usage", usage, model: modelKey });
  await emit({ type: "done", usage, finish_reason: result.finishReason ?? "stop" });

  log.info(
    { steps: result.steps?.length ?? 1, modelKey, ...usage },
    "agent_run_complete",
  );

  return {
    text: result.text,
    usage,
    steps: result.steps?.length ?? 1,
    finishReason: result.finishReason ?? "stop",
    context: contextBundle,
    toolCalls,
  };
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export type { AgentEvent };
