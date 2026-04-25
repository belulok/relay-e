import type { UsageMeter } from "@relay-e/shared";

export type AgentEvent =
  | { type: "thinking"; step: string }
  | { type: "context_resolved"; sources: string[]; tokenEstimate: number }
  | { type: "tool_call"; tool_call_id: string; name: string; input: unknown }
  | { type: "tool_awaiting_approval"; tool_call_id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_call_id: string; name: string; output: unknown; is_error?: boolean }
  | { type: "text_delta"; delta: string }
  | { type: "usage"; usage: UsageMeter; model: string }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; usage: UsageMeter; finish_reason: string };

export type AgentEventEmitter = (event: AgentEvent) => void | Promise<void>;
