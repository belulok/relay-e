import type { LanguageModel, EmbeddingModel } from "ai";
import type { Modality } from "@relay-e/shared";

export type ProviderId = "anthropic" | "openai" | "openrouter" | "ollama" | "voyage" | "minimax" | "moonshot";

export interface ChatModelDescriptor {
  provider: ProviderId;
  id: string;
  alias?: string;
  modalities: Modality[];
  supportsTools: boolean;
  supportsCaching: boolean;
  contextWindow: number;
  tier: "fast" | "balanced" | "premium";
}

export interface EmbeddingModelDescriptor {
  provider: ProviderId;
  id: string;
  alias?: string;
  dimensions: number;
}

export interface ResolvedChatModel {
  descriptor: ChatModelDescriptor;
  model: LanguageModel;
}

export interface ResolvedEmbeddingModel {
  descriptor: EmbeddingModelDescriptor;
  model: EmbeddingModel<string>;
}
