import { z } from "zod";
import type { Logger } from "@relay-e/shared";
import { errors } from "@relay-e/shared";

export interface ToolContext<TConfig = Record<string, unknown>> {
  tenantId: string;
  userId?: string;
  sessionId?: string;
  runId?: string;
  config: TConfig;
  logger: Logger;
  signal: AbortSignal;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  requiresApproval?: boolean;
  // Returns a value the LLM will see as the tool result.
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

// `any` here is intentional — registries store heterogeneous tool definitions
// whose I/O types are only known at register/execute time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any, any>;
export type ToolMap = Map<string, AnyToolDefinition>;

export class ToolRegistry {
  private tools: ToolMap = new Map();

  register<I, O>(tool: ToolDefinition<I, O>): this {
    if (this.tools.has(tool.name)) {
      throw errors.invalidRequest("duplicate_tool", `Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool as AnyToolDefinition);
    return this;
  }

  registerMany(tools: AnyToolDefinition[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): AnyToolDefinition[] {
    return [...this.tools.values()];
  }

  pick(names: string[]): AnyToolDefinition[] {
    return names
      .map((n) => this.tools.get(n))
      .filter((t): t is AnyToolDefinition => Boolean(t));
  }
}

export function defineTool<I, O>(tool: ToolDefinition<I, O>): ToolDefinition<I, O> {
  return tool;
}
