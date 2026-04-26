import { logger, approxTokenCount } from "@relay-e/shared";
import { ProviderRegistry } from "@relay-e/providers";
import {
  ConnectorRegistry,
  ContextResolver,
  SkillRegistry,
  ToolRegistry,
  defineSkill,
} from "@relay-e/engine";
import { loadAppConfig } from "./config.js";

/**
 * Bootstrap the in-process registries from `relay-e.config.json`.
 *
 * The engine is domain-agnostic: zero hardcoded skills, zero hardcoded tools.
 * Customers point Relay-E at their data via connectors (Postgres, MySQL,
 * HTTP APIs, web search, ...), and skills compose those connectors with
 * a system prompt. Everything is declarative and reload-safe.
 *
 * Roadmap: move config from JSON to Postgres so customers manage skills
 * via API/UI without redeploying.
 */

export const providers = new ProviderRegistry();
export const tools = new ToolRegistry();
export const skills = new SkillRegistry();
export const connectors = new ConnectorRegistry();

let bootstrapped = false;

export async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  const cfg = await loadAppConfig();

  // 1. Connectors first — skills reference them by id.
  for (const c of cfg.connectors) {
    try {
      // The discriminated union in the schema and the registry's switch
      // line up by `type`; the cast is a TS limitation, not a runtime risk.
      connectors.register(c as Parameters<typeof connectors.register>[0]);
    } catch (err) {
      logger.error({ id: c.id, type: c.type, err }, "connector_registration_failed");
    }
  }

  // 2. Skills. No tools registered statically anymore — connectors generate
  //    the tools the skill needs at runtime, based on its `connectorIds`.
  for (const s of cfg.skills) {
    try {
      skills.register(
        defineSkill({
          name: s.name,
          description: s.description,
          systemPrompt: s.systemPrompt,
          toolNames: s.toolNames,
          connectorIds: s.connectorIds,
          examples: s.examples,
          preferredTier: s.preferredTier,
        }),
      );
    } catch (err) {
      logger.error({ name: s.name, err }, "skill_registration_failed");
    }
  }
}

// Always-on context source: a small guardrail block so the model knows
// what behaviours are non-negotiable regardless of skill. Domain-specific
// context belongs in connectors, not here.
export const context = new ContextResolver([
  {
    name: "core_guardrails",
    priority: 100,
    fetch: async () => {
      const text =
        "Hard rules:\n" +
        "- For database connectors, write SQL only against the schema you were shown.\n" +
        "- For HTTP connectors, only call paths described in the connector context.\n" +
        "- Cite sources when you use web_search.\n" +
        "- If a tool returns no useful data, tell the user — never invent.";
      return [
        {
          source: "core_guardrails",
          priority: 100,
          tokenEstimate: approxTokenCount(text),
          content: text,
        },
      ];
    },
  },
]);
