import { createHash } from "node:crypto";
import { getDb, sessions, messages, runs, usageEvents } from "@relay-e/db";
import type { UsageMeter } from "@relay-e/shared";
import { logger } from "@relay-e/shared";

/**
 * Derive a deterministic UUID from a (tenantId, sessionKey) pair so clients
 * can use any free-form string as a session identifier while the DB stays
 * UUID-typed. The same inputs always produce the same UUID — subsequent
 * turns in the same session resolve to the same row without a lookup.
 */
function deriveSessionId(tenantId: string, sessionKey: string): string {
  const hex = createHash("sha256")
    .update(`relay-e:session:${tenantId}:${sessionKey}`)
    .digest("hex");
  // Format as a UUID v4 variant (version=4, variant=10xx)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

// In-process cache so we don't hit the DB on every message in a hot session.
const sessionCache = new Map<string, string>(); // `${tenantId}:${key}` → sessions.id

/**
 * Upsert a session row for the given tenant + session key, returning its UUID.
 * Safe to call on every request — it's idempotent and cached.
 */
export async function ensureSession(
  tenantId: string,
  sessionKey: string,
  skillIds: string[],
): Promise<string> {
  const cacheKey = `${tenantId}:${sessionKey}`;
  const cached = sessionCache.get(cacheKey);
  if (cached) return cached;

  const sessionId = deriveSessionId(tenantId, sessionKey);
  const db = getDb();

  await db
    .insert(sessions)
    .values({ id: sessionId, tenantId, skillIds, lastActiveAt: new Date() })
    .onConflictDoUpdate({
      target: sessions.id,
      set: { lastActiveAt: new Date(), skillIds },
    });

  sessionCache.set(cacheKey, sessionId);
  return sessionId;
}

export interface PersistTurnInput {
  tenantId: string;
  sessionId: string;    // sessions.id UUID (from ensureSession)
  prompt: string;
  responseText: string;
  toolCalls: unknown[];
  usage: UsageMeter;
  modelKey: string;
  skillIds: string[];
  steps: number;
  finishReason: string;
  startedAt: Date;
}

/**
 * Persist a completed agent turn: user message, assistant message, run record,
 * and usage event — all in parallel. Called fire-and-forget from the messages
 * route so it never blocks the HTTP response.
 */
export async function persistTurn(input: PersistTurnInput): Promise<void> {
  const {
    tenantId,
    sessionId,
    prompt,
    responseText,
    toolCalls,
    usage,
    modelKey,
    skillIds,
    steps,
    finishReason,
    startedAt,
  } = input;

  const db = getDb();
  const cost = usage.cost_usd.toFixed(6);
  const now = new Date();

  await Promise.all([
    db.insert(messages).values({
      tenantId,
      sessionId,
      role: "user",
      content: [{ type: "text", text: prompt }],
    }),

    db.insert(messages).values({
      tenantId,
      sessionId,
      role: "assistant",
      content: [{ type: "text", text: responseText }],
      toolCalls: toolCalls as unknown[],
      tokensIn: usage.tokens_in,
      tokensOut: usage.tokens_out,
      costUsd: cost,
      model: modelKey,
    }),

    db.insert(runs).values({
      tenantId,
      sessionId,
      status: "completed",
      input: { prompt, skillIds } as Record<string, unknown>,
      output: { text: responseText, finishReason, steps } as Record<string, unknown>,
      steps: toolCalls as unknown[],
      totalTokensIn: usage.tokens_in,
      totalTokensOut: usage.tokens_out,
      totalCostUsd: cost,
      startedAt,
      completedAt: now,
    }),

    db.insert(usageEvents).values({
      tenantId,
      sessionId,
      eventType: "agent_turn",
      model: modelKey,
      tokensIn: usage.tokens_in,
      tokensOut: usage.tokens_out,
      cacheReadTokens: usage.cache_read_tokens ?? 0,
      cacheWriteTokens: usage.cache_write_tokens ?? 0,
      costUsd: cost,
    }),
  ]);

  logger.debug({ tenantId, sessionId, modelKey, ...usage }, "turn_persisted");
}

/**
 * Mark a run as failed — called from the error path in the messages route.
 * Best-effort; does not throw.
 */
export async function persistFailedRun(opts: {
  tenantId: string;
  sessionId: string;
  prompt: string;
  skillIds: string[];
  startedAt: Date;
  error: string;
}): Promise<void> {
  const db = getDb();
  await db.insert(runs).values({
    tenantId: opts.tenantId,
    sessionId: opts.sessionId,
    status: "failed",
    input: { prompt: opts.prompt, skillIds: opts.skillIds } as Record<string, unknown>,
    error: { message: opts.error } as Record<string, unknown>,
    startedAt: opts.startedAt,
    completedAt: new Date(),
  });
}
