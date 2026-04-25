import { describe, it, expect } from "vitest";
import { allocateBudget, buildSystemPrompt } from "./prompt.js";
import type { ContextBundle } from "../context/index.js";
import type { SkillDefinition } from "../skills/index.js";

const emptyBundle: ContextBundle = { items: [], totalTokenEstimate: 0 };

const demoSkill: SkillDefinition = {
  name: "demo",
  description: "demo",
  systemPrompt: "Be terse.",
  toolNames: [],
  examples: [{ input: "hi", output: "hello" }],
};

describe("allocateBudget", () => {
  it("reserves at least 2k tokens for the response", () => {
    const tiny = allocateBudget(8_000);
    expect(tiny.responseHeadroom).toBeGreaterThanOrEqual(2_000);
  });

  it("scales response headroom to 10% on large windows", () => {
    const big = allocateBudget(200_000);
    expect(big.responseHeadroom).toBe(20_000);
    expect(big.systemPrompt + big.context + big.history + big.responseHeadroom).toBeLessThanOrEqual(200_000);
  });

  it("budget components sum to <= contextWindow", () => {
    for (const cw of [4_000, 32_000, 128_000, 200_000]) {
      const b = allocateBudget(cw);
      expect(b.systemPrompt + b.context + b.history + b.responseHeadroom).toBeLessThanOrEqual(cw);
    }
  });
});

describe("buildSystemPrompt", () => {
  it("returns the default base prompt when no skills/context given", () => {
    const prompt = buildSystemPrompt({ skills: [], context: emptyBundle });
    expect(prompt).toContain("Relay-E");
    expect(prompt).not.toContain("# Skills");
    expect(prompt).not.toContain("# Context");
  });

  it("includes skill system prompts under # Skills", () => {
    const prompt = buildSystemPrompt({ skills: [demoSkill], context: emptyBundle });
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("## demo");
    expect(prompt).toContain("Be terse.");
  });

  it("renders examples under each skill", () => {
    const prompt = buildSystemPrompt({ skills: [demoSkill], context: emptyBundle });
    expect(prompt).toContain("### Examples");
    expect(prompt).toContain("User: hi");
    expect(prompt).toContain("Assistant: hello");
  });

  it("places context items inside <context> tags", () => {
    const prompt = buildSystemPrompt({
      skills: [],
      context: {
        items: [
          { source: "guardrails", priority: 100, tokenEstimate: 5, content: "no PII" },
        ],
        totalTokenEstimate: 5,
      },
    });
    expect(prompt).toContain("# Context");
    expect(prompt).toContain('<context source="guardrails">');
    expect(prompt).toContain("no PII");
  });
});
