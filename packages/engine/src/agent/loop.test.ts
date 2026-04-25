import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { MockLanguageModelV1 } from "ai/test";
import { runAgent } from "./loop.js";
import { ContextResolver } from "../context/index.js";
import { SkillRegistry, defineSkill } from "../skills/index.js";
import { ToolRegistry, defineTool } from "../tools/index.js";
import type { ProviderRegistry } from "@relay-e/providers";

// A minimal ProviderRegistry stand-in that just returns a mock model.
function makeProviders(model: MockLanguageModelV1): ProviderRegistry {
  return {
    chat: () => ({
      descriptor: {
        provider: "anthropic",
        id: "mock",
        modalities: ["text"],
        supportsTools: true,
        supportsCaching: false,
        contextWindow: 100_000,
        tier: "balanced",
      },
      model,
    }),
    routeBy: () => "mock",
  } as unknown as ProviderRegistry;
}

const skills = new SkillRegistry().register(
  defineSkill({
    name: "demo",
    description: "demo",
    systemPrompt: "Be terse.",
    toolNames: ["echo"],
  }),
);

const tools = new ToolRegistry().register(
  defineTool({
    name: "echo",
    description: "echo",
    inputSchema: z.object({ text: z.string() }),
    execute: async (input) => ({ echoed: input.text }),
  }),
);

const context = new ContextResolver([]);

describe("runAgent (integration with MockLanguageModelV1)", () => {
  it("returns the model text and accounts usage when there are no tool calls", async () => {
    const model = new MockLanguageModelV1({
      defaultObjectGenerationMode: "json",
      doGenerate: async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: "stop",
        usage: { promptTokens: 100, completionTokens: 50 },
        text: "Hello, world.",
      }),
    });
    const providers = makeProviders(model);
    const result = await runAgent(
      {
        tenantId: "t1",
        prompt: "hi",
        skills: skills.resolve(["demo"]),
      },
      { providers, tools, context },
    );
    expect(result.text).toBe("Hello, world.");
    expect(result.finishReason).toBe("stop");
    expect(result.usage.tokens_in).toBe(100);
    expect(result.usage.tokens_out).toBe(50);
    expect(result.toolCalls).toHaveLength(0);
  });

  it("emits agent events to the provided emitter", async () => {
    const model = new MockLanguageModelV1({
      doGenerate: async () => ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5 },
        text: "ok",
      }),
    });
    const providers = makeProviders(model);
    const emit = vi.fn();
    await runAgent(
      { tenantId: "t1", prompt: "hi", skills: skills.resolve(["demo"]) },
      { providers, tools, context, emit },
    );
    const types = emit.mock.calls.map((c) => c[0].type);
    expect(types).toContain("thinking");
    expect(types).toContain("context_resolved");
    expect(types).toContain("usage");
    expect(types).toContain("done");
  });
});
