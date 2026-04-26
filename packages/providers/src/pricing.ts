import type { ModelPricing } from "@relay-e/shared";

// Indicative pricing — keep in one place so cost tracking is centralised.
// Update when providers change rates.
export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": {
    input_per_mtok_usd: 15,
    output_per_mtok_usd: 75,
    cache_read_per_mtok_usd: 1.5,
    cache_write_per_mtok_usd: 18.75,
  },
  "claude-sonnet-4-6": {
    input_per_mtok_usd: 3,
    output_per_mtok_usd: 15,
    cache_read_per_mtok_usd: 0.3,
    cache_write_per_mtok_usd: 3.75,
  },
  "claude-haiku-4-5-20251001": {
    input_per_mtok_usd: 0.8,
    output_per_mtok_usd: 4,
    cache_read_per_mtok_usd: 0.08,
    cache_write_per_mtok_usd: 1,
  },
  "gpt-4o": { input_per_mtok_usd: 2.5, output_per_mtok_usd: 10 },
  "gpt-4o-mini": { input_per_mtok_usd: 0.15, output_per_mtok_usd: 0.6 },
  // MiniMax (indicative — verify at minimax.chat/pricing)
  "minimax:MiniMax-Text-01": { input_per_mtok_usd: 0.2, output_per_mtok_usd: 1.1 },
  "minimax:MiniMax-M1": { input_per_mtok_usd: 0.3, output_per_mtok_usd: 3.3 },

  // Kimi / Moonshot AI (indicative — verify at platform.moonshot.cn/docs/pricing)
  // Priced per context tier: longer context = higher rate per token.
  "moonshot:moonshot-v1-8k": { input_per_mtok_usd: 1.66, output_per_mtok_usd: 1.66 },
  "moonshot:moonshot-v1-32k": { input_per_mtok_usd: 3.31, output_per_mtok_usd: 3.31 },
  "moonshot:moonshot-v1-128k": { input_per_mtok_usd: 8.22, output_per_mtok_usd: 8.22 },
  "moonshot:kimi-latest": { input_per_mtok_usd: 3.31, output_per_mtok_usd: 3.31 },

  // Local models — free.
  "ollama:llama3.2": { input_per_mtok_usd: 0, output_per_mtok_usd: 0 },
  "ollama:qwen2.5": { input_per_mtok_usd: 0, output_per_mtok_usd: 0 },
};

export function pricingFor(modelKey: string): ModelPricing {
  return PRICING[modelKey] ?? { input_per_mtok_usd: 0, output_per_mtok_usd: 0 };
}
