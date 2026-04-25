import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider";
import { errors } from "@relay-e/shared";
import type {
  ChatModelDescriptor,
  EmbeddingModelDescriptor,
  ProviderId,
  ResolvedChatModel,
  ResolvedEmbeddingModel,
} from "./types.js";

export const CHAT_MODELS: Record<string, ChatModelDescriptor> = {
  "claude-opus-4-7": {
    provider: "anthropic",
    id: "claude-opus-4-7",
    alias: "premium",
    modalities: ["text", "image", "document"],
    supportsTools: true,
    supportsCaching: true,
    contextWindow: 200_000,
    tier: "premium",
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    id: "claude-sonnet-4-6",
    alias: "balanced",
    modalities: ["text", "image", "document"],
    supportsTools: true,
    supportsCaching: true,
    contextWindow: 200_000,
    tier: "balanced",
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic",
    id: "claude-haiku-4-5-20251001",
    alias: "fast",
    modalities: ["text", "image"],
    supportsTools: true,
    supportsCaching: true,
    contextWindow: 200_000,
    tier: "fast",
  },
  "gpt-4o": {
    provider: "openai",
    id: "gpt-4o",
    modalities: ["text", "image", "audio"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 128_000,
    tier: "balanced",
  },
  "gpt-4o-mini": {
    provider: "openai",
    id: "gpt-4o-mini",
    modalities: ["text", "image"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 128_000,
    tier: "fast",
  },
  "ollama:llama3.2": {
    provider: "ollama",
    id: "llama3.2",
    modalities: ["text"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 128_000,
    tier: "fast",
  },
};

export const EMBED_MODELS: Record<string, EmbeddingModelDescriptor> = {
  "voyage-3": { provider: "voyage", id: "voyage-3", dimensions: 1024 },
  "text-embedding-3-small": { provider: "openai", id: "text-embedding-3-small", dimensions: 1536 },
  "text-embedding-3-large": { provider: "openai", id: "text-embedding-3-large", dimensions: 3072 },
  "ollama:nomic-embed-text": {
    provider: "ollama",
    id: "nomic-embed-text",
    dimensions: 768,
  },
};

export interface ProviderRegistryOptions {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
}

export class ProviderRegistry {
  private anthropic?: ReturnType<typeof createAnthropic>;
  private openai?: ReturnType<typeof createOpenAI>;
  private ollama?: ReturnType<typeof createOllama>;

  constructor(opts: ProviderRegistryOptions = {}) {
    const anthropicKey = opts.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) this.anthropic = createAnthropic({ apiKey: anthropicKey });

    const openaiKey = opts.openaiApiKey ?? process.env.OPENAI_API_KEY;
    if (openaiKey) this.openai = createOpenAI({ apiKey: openaiKey });

    const ollamaBase = opts.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL;
    if (ollamaBase) this.ollama = createOllama({ baseURL: `${ollamaBase}/api` });
  }

  chat(key: string): ResolvedChatModel {
    const descriptor = CHAT_MODELS[key];
    if (!descriptor) {
      throw errors.invalidRequest("unknown_model", `Unknown chat model "${key}"`);
    }
    const provider = this.providerFor(descriptor.provider);
    const model = (provider as (id: string) => unknown)(descriptor.id) as ResolvedChatModel["model"];
    return { descriptor, model };
  }

  embedding(key: string): ResolvedEmbeddingModel {
    const descriptor = EMBED_MODELS[key];
    if (!descriptor) {
      throw errors.invalidRequest("unknown_model", `Unknown embedding model "${key}"`);
    }
    if (descriptor.provider === "openai") {
      if (!this.openai) throw errors.provider("OpenAI not configured");
      return { descriptor, model: this.openai.embedding(descriptor.id) };
    }
    if (descriptor.provider === "ollama") {
      if (!this.ollama) throw errors.provider("Ollama not configured");
      return { descriptor, model: this.ollama.embedding(descriptor.id) };
    }
    throw errors.provider(
      `Embedding provider "${descriptor.provider}" not yet supported in the local adapter — set up a Voyage adapter for production.`,
    );
  }

  private providerFor(id: ProviderId) {
    switch (id) {
      case "anthropic":
        if (!this.anthropic) throw errors.provider("Anthropic not configured (ANTHROPIC_API_KEY missing)");
        return this.anthropic;
      case "openai":
        if (!this.openai) throw errors.provider("OpenAI not configured (OPENAI_API_KEY missing)");
        return this.openai;
      case "ollama":
        if (!this.ollama) throw errors.provider("Ollama not configured (OLLAMA_BASE_URL missing)");
        return this.ollama;
      default:
        throw errors.provider(`Provider "${id}" not yet supported`);
    }
  }

  routeBy(tier: "fast" | "balanced" | "premium"): string {
    if (this.anthropic) {
      switch (tier) {
        case "fast":
          return "claude-haiku-4-5-20251001";
        case "balanced":
          return "claude-sonnet-4-6";
        case "premium":
          return "claude-opus-4-7";
      }
    }
    if (this.openai) {
      return tier === "fast" ? "gpt-4o-mini" : "gpt-4o";
    }
    if (this.ollama) return "ollama:llama3.2";
    throw errors.provider("No LLM providers configured");
  }
}

let cached: ProviderRegistry | undefined;
export function getProviderRegistry(): ProviderRegistry {
  if (!cached) cached = new ProviderRegistry();
  return cached;
}
