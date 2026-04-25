import { ProviderRegistry } from "@relay-e/providers";
import {
  ContextResolver,
  SkillRegistry,
  ToolRegistry,
  defineSkill,
  defineTool,
} from "@relay-e/engine";
import { z } from "zod";
import { approxTokenCount } from "@relay-e/shared";

// Single-process registries. Per-tenant overrides come from the DB later.
export const providers = new ProviderRegistry();
export const tools = new ToolRegistry();
export const skills = new SkillRegistry();

// Example finance tools — these would normally be backed by an MCP server
// or a connector to the customer's API. Hardcoded here to demonstrate the loop.
tools.registerMany([
  defineTool({
    name: "get_balance",
    description: "Return the current balance for a user's account.",
    inputSchema: z.object({
      account_id: z.string().describe("Account identifier"),
    }),
    execute: async ({ account_id }) => ({
      account_id,
      balance_usd: 4231.55,
      currency: "USD",
      as_of: new Date().toISOString(),
    }),
  }),
  defineTool({
    name: "analyze_spending",
    description: "Summarise spending for a user across the last N days, grouped by category.",
    inputSchema: z.object({
      days: z.number().int().min(1).max(365).default(30),
    }),
    execute: async ({ days }) => ({
      window_days: days,
      total_usd: 1842.4,
      categories: [
        { name: "groceries", amount_usd: 612.18 },
        { name: "dining", amount_usd: 421.05 },
        { name: "transport", amount_usd: 318.7 },
        { name: "subscriptions", amount_usd: 184.5 },
        { name: "other", amount_usd: 305.97 },
      ],
    }),
  }),
  defineTool({
    name: "transfer_funds",
    description: "Transfer funds between two accounts. Requires human approval before executing.",
    requiresApproval: true,
    inputSchema: z.object({
      from_account: z.string(),
      to_account: z.string(),
      amount_usd: z.number().positive(),
      memo: z.string().optional(),
    }),
    execute: async (input) => ({
      transfer_id: `xfer_${Math.random().toString(36).slice(2, 10)}`,
      status: "pending_approval",
      ...input,
    }),
  }),
]);

skills.register(
  defineSkill({
    name: "financial-advisor",
    description:
      "A finance assistant that can read balances, analyse spending and propose transfers.",
    systemPrompt:
      `You are a personal finance assistant for the user. Use the tools to fetch real ` +
      `data. Never invent balances or transactions. When the user asks for an action ` +
      `with side effects (transfers), explain what you are about to do and rely on the ` +
      `approval flow before assuming it succeeded.`,
    toolNames: ["get_balance", "analyze_spending", "transfer_funds"],
    preferredTier: "balanced",
    examples: [
      {
        input: "How much did I spend on food last month?",
        output:
          "Calling analyze_spending(days=30) and reporting the dining + groceries totals back to the user.",
      },
    ],
  }),
);

// Built-in context source: skill-defined static guidance. Real deployments add
// vector search, profile fetchers, MCP-backed sources, etc.
export const context = new ContextResolver([
  {
    name: "skill_guardrails",
    priority: 100,
    fetch: async ({ skills: skillNames }) => {
      const guardrails = skillNames.map((name) => `Skill "${name}" must respect tenant-scoped data.`).join("\n");
      return [
        {
          source: "skill_guardrails",
          priority: 100,
          tokenEstimate: approxTokenCount(guardrails),
          content: guardrails,
        },
      ];
    },
  },
]);
