import type { SkillDefinition } from "../skills/index.js";
import type { ContextBundle } from "../context/index.js";
import { renderContext } from "../context/index.js";

export interface PromptInput {
  skills: SkillDefinition[];
  context: ContextBundle;
  basePrompt?: string;
}

export function buildSystemPrompt(input: PromptInput): string {
  const parts: string[] = [];

  parts.push(
    input.basePrompt ??
      `You are an AI assistant powered by Relay-E. Be helpful, accurate, and concise. ` +
        `When you need information you do not have, call the available tools rather than guessing.`,
  );

  if (input.skills.length > 0) {
    parts.push("# Skills");
    for (const skill of input.skills) {
      parts.push(`## ${skill.name}\n${skill.systemPrompt}`);
      if (skill.examples?.length) {
        parts.push("### Examples");
        for (const ex of skill.examples) {
          parts.push(`User: ${ex.input}\nAssistant: ${ex.output}`);
        }
      }
    }
  }

  const ctx = renderContext(input.context);
  if (ctx) {
    parts.push("# Context");
    parts.push(ctx);
  }

  return parts.join("\n\n");
}

export interface BudgetAllocation {
  systemPrompt: number;
  context: number;
  history: number;
  responseHeadroom: number;
}

export function allocateBudget(contextWindow: number): BudgetAllocation {
  // Conservative defaults; tuned later via evals.
  const responseHeadroom = Math.max(2_000, Math.floor(contextWindow * 0.1));
  const remaining = contextWindow - responseHeadroom;
  return {
    systemPrompt: Math.floor(remaining * 0.1),
    context: Math.floor(remaining * 0.4),
    history: Math.floor(remaining * 0.5),
    responseHeadroom,
  };
}
