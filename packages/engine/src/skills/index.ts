import { errors } from "@relay-e/shared";
import type { Modality } from "@relay-e/shared";

export interface SkillExample {
  input: string;
  output: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  /**
   * Tools the skill can call. Usually empty when `connectorIds` are set —
   * the engine auto-derives tools from connectors. Use this only for
   * one-off in-process tools registered manually.
   */
  toolNames?: string[];
  /**
   * Connectors this skill has access to. Each connector contributes
   * tools (e.g. `query_<id>`, `call_<id>`, `web_search`) AND a prompt
   * context block (DB schema, API surface) that the engine injects into
   * the system prompt at request time. This is how the skill stays
   * domain-agnostic — connectors do the domain plumbing.
   */
  connectorIds?: string[];
  examples?: SkillExample[];
  // Routing hint: which model tier the skill prefers.
  preferredTier?: "fast" | "balanced" | "premium";
  // Required modalities the input must support (e.g. ["text", "image"]).
  requiredModalities?: Modality[];
  // Skill-level config the tools can read via ctx.config.
  config?: Record<string, unknown>;
}

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition): this {
    if (this.skills.has(skill.name)) {
      throw errors.invalidRequest("duplicate_skill", `Skill "${skill.name}" already registered`);
    }
    this.skills.set(skill.name, skill);
    return this;
  }

  registerMany(skills: SkillDefinition[]): this {
    for (const s of skills) this.register(s);
    return this;
  }

  get(name: string): SkillDefinition {
    const skill = this.skills.get(name);
    if (!skill) {
      throw errors.notFound(`skill:${name}`);
    }
    return skill;
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  resolve(names?: string[]): SkillDefinition[] {
    if (!names || names.length === 0) return [];
    return names.map((n) => this.get(n));
  }
}

export function defineSkill(skill: SkillDefinition): SkillDefinition {
  return skill;
}
