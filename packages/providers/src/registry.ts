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
  // --- Direct Anthropic ---
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

  // --- Direct OpenAI ---
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

  // --- OpenRouter (single key, 100+ models) ---
  // Naming convention: "openrouter:<provider>/<model>". The id passed to the
  // OpenAI-compatible adapter is everything after the colon.
  "openrouter:anthropic/claude-sonnet-4": {
    provider: "openrouter",
    id: "anthropic/claude-sonnet-4",
    modalities: ["text", "image", "document"],
    supportsTools: true,
    supportsCaching: true,
    contextWindow: 200_000,
    tier: "balanced",
  },
  "openrouter:openai/gpt-4o": {
    provider: "openrouter",
    id: "openai/gpt-4o",
    modalities: ["text", "image"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 128_000,
    tier: "balanced",
  },
  "openrouter:meta-llama/llama-3.3-70b-instruct": {
    provider: "openrouter",
    id: "meta-llama/llama-3.3-70b-instruct",
    modalities: ["text"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 131_072,
    tier: "fast",
  },

  // --- MiniMax ---
  "minimax:MiniMax-Text-01": {
    provider: "minimax",
    id: "MiniMax-Text-01",
    modalities: ["text"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 1_000_000,
    tier: "balanced",
  },
  "minimax:MiniMax-M1": {
    provider: "minimax",
    id: "MiniMax-M1",
    modalities: ["text"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 1_000_000,
    tier: "premium",
  },

  // --- Kimi (Moonshot AI) ---
  "moonshot:moonshot-v1-8k": {
    provider: "moonshot",
    id: "moonshot-v1-8k",
    modalities: ["text"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 8_000,
    tier: "fast",
  },
  "moonshot:moonshot-v1-32k": {
    provider: "moonshot",
    id: "moonshot-v1-32k",
    modalities: ["text"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 32_000,
    tier: "balanced",
  },
  "moonshot:moonshot-v1-128k": {
    provider: "moonshot",
    id: "moonshot-v1-128k",
    modalities: ["text"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 128_000,
    tier: "premium",
  },
  "moonshot:kimi-latest": {
    provider: "moonshot",
    id: "kimi-latest",
    modalities: ["text", "image"],
    supportsTools: true,
    supportsCaching: false,
    contextWindow: 128_000,
    tier: "balanced",
  },

  // --- Ollama (local, optional) ---
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
  openrouterApiKey?: string;
  ollamaBaseUrl?: string;
  minimaxApiKey?: string;
  moonshotApiKey?: string;
}

export class ProviderRegistry {
  private anthropic?: ReturnType<typeof createAnthropic>;
  private openai?: ReturnType<typeof createOpenAI>;
  private openrouter?: ReturnType<typeof createOpenAI>;
  private ollama?: ReturnType<typeof createOllama>;
  private minimax?: ReturnType<typeof createOpenAI>;
  private moonshot?: ReturnType<typeof createOpenAI>;

  constructor(opts: ProviderRegistryOptions = {}) {
    const anthropicKey = opts.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) this.anthropic = createAnthropic({ apiKey: anthropicKey });

    const openaiKey = opts.openaiApiKey ?? process.env.OPENAI_API_KEY;
    if (openaiKey) this.openai = createOpenAI({ apiKey: openaiKey });

    const openrouterKey = opts.openrouterApiKey ?? process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      // OpenRouter is OpenAI-compatible — point the OpenAI adapter at their base URL.
      this.openrouter = createOpenAI({
        apiKey: openrouterKey,
        baseURL: "https://openrouter.ai/api/v1",
        compatibility: "compatible",
      });
    }

    const ollamaBase = opts.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL;
    if (ollamaBase) this.ollama = createOllama({ baseURL: `${ollamaBase}/api` });

    const minimaxKey = opts.minimaxApiKey ?? process.env.MINIMAX_API_KEY;
    if (minimaxKey) {
      this.minimax = createOpenAI({
        apiKey: minimaxKey,
        baseURL: "https://api.minimax.chat/v1",
        compatibility: "compatible",
      });
    }

    const moonshotKey = opts.moonshotApiKey ?? process.env.MOONSHOT_API_KEY;
    if (moonshotKey) {
      this.moonshot = createOpenAI({
        apiKey: moonshotKey,
        baseURL: "https://api.moonshot.cn/v1",
        compatibility: "compatible",
      });
    }
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
      case "openrouter":
        if (!this.openrouter) throw errors.provider("OpenRouter not configured (OPENROUTER_API_KEY missing)");
        return this.openrouter;
      case "ollama":
        if (!this.ollama) throw errors.provider("Ollama not configured (OLLAMA_BASE_URL missing)");
        return this.ollama;
      case "minimax":
        if (!this.minimax) throw errors.provider("MiniMax not configured (MINIMAX_API_KEY missing)");
        return this.minimax;
      case "moonshot":
        if (!this.moonshot) throw errors.provider("Moonshot (Kimi) not configured (MOONSHOT_API_KEY missing)");
        return this.moonshot;
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
    if (this.openrouter) {
      switch (tier) {
        case "fast":
          return "openrouter:meta-llama/llama-3.3-70b-instruct";
        case "balanced":
        case "premium":
          return "openrouter:anthropic/claude-sonnet-4";
      }
    }
    if (this.openai) {
      return tier === "fast" ? "gpt-4o-mini" : "gpt-4o";
    }
    if (this.minimax) {
      return tier === "premium" ? "minimax:MiniMax-M1" : "minimax:MiniMax-Text-01";
    }
    if (this.moonshot) {
      switch (tier) {
        case "fast":    return "moonshot:moonshot-v1-8k";
        case "balanced": return "moonshot:moonshot-v1-32k";
        case "premium":  return "moonshot:moonshot-v1-128k";
      }
    }
    if (this.ollama) return "ollama:llama3.2";
    throw errors.provider(
      "No LLM providers configured — set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, MINIMAX_API_KEY, MOONSHOT_API_KEY, or OLLAMA_BASE_URL.",
    );
  }
}

let cached: ProviderRegistry | undefined;
export function getProviderRegistry(): ProviderRegistry {
  if (!cached) cached = new ProviderRegistry();
  return cached;
}
