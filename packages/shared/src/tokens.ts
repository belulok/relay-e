export interface UsageMeter {
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd: number;
}

export const ZERO_USAGE: UsageMeter = {
  tokens_in: 0,
  tokens_out: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  cost_usd: 0,
};

export function addUsage(a: UsageMeter, b: UsageMeter): UsageMeter {
  return {
    tokens_in: a.tokens_in + b.tokens_in,
    tokens_out: a.tokens_out + b.tokens_out,
    cache_read_tokens: (a.cache_read_tokens ?? 0) + (b.cache_read_tokens ?? 0),
    cache_write_tokens: (a.cache_write_tokens ?? 0) + (b.cache_write_tokens ?? 0),
    cost_usd: a.cost_usd + b.cost_usd,
  };
}

export interface ModelPricing {
  input_per_mtok_usd: number;
  output_per_mtok_usd: number;
  cache_read_per_mtok_usd?: number;
  cache_write_per_mtok_usd?: number;
}

export function priceUsage(
  pricing: ModelPricing,
  raw: { input: number; output: number; cache_read?: number; cache_write?: number },
): UsageMeter {
  const cost =
    (raw.input * pricing.input_per_mtok_usd) / 1_000_000 +
    (raw.output * pricing.output_per_mtok_usd) / 1_000_000 +
    ((raw.cache_read ?? 0) * (pricing.cache_read_per_mtok_usd ?? 0)) / 1_000_000 +
    ((raw.cache_write ?? 0) * (pricing.cache_write_per_mtok_usd ?? 0)) / 1_000_000;
  return {
    tokens_in: raw.input,
    tokens_out: raw.output,
    cache_read_tokens: raw.cache_read ?? 0,
    cache_write_tokens: raw.cache_write ?? 0,
    cost_usd: Number(cost.toFixed(6)),
  };
}

// Cheap heuristic when a provider doesn't return usage (e.g. local Ollama).
export function approxTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
