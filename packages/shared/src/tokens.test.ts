import { describe, it, expect } from "vitest";
import {
  ZERO_USAGE,
  addUsage,
  approxTokenCount,
  priceUsage,
} from "./tokens.js";

describe("addUsage", () => {
  it("sums tokens and costs", () => {
    const a = { tokens_in: 10, tokens_out: 20, cost_usd: 0.01 };
    const b = { tokens_in: 5, tokens_out: 7, cost_usd: 0.005 };
    const result = addUsage(a, b);
    expect(result.tokens_in).toBe(15);
    expect(result.tokens_out).toBe(27);
    expect(result.cost_usd).toBeCloseTo(0.015);
  });

  it("treats missing cache fields as zero", () => {
    const result = addUsage(ZERO_USAGE, ZERO_USAGE);
    expect(result.cache_read_tokens).toBe(0);
    expect(result.cache_write_tokens).toBe(0);
  });
});

describe("priceUsage", () => {
  const pricing = {
    input_per_mtok_usd: 3,
    output_per_mtok_usd: 15,
    cache_read_per_mtok_usd: 0.3,
    cache_write_per_mtok_usd: 3.75,
  };

  it("computes USD cost from token counts", () => {
    const usage = priceUsage(pricing, { input: 1_000_000, output: 500_000 });
    expect(usage.cost_usd).toBeCloseTo(3 + 7.5);
    expect(usage.tokens_in).toBe(1_000_000);
    expect(usage.tokens_out).toBe(500_000);
  });

  it("includes cache costs when provided", () => {
    const usage = priceUsage(pricing, {
      input: 100,
      output: 100,
      cache_read: 1_000_000,
      cache_write: 0,
    });
    // 100 * 3 / 1M = 0.0003, 100 * 15 / 1M = 0.0015, 1M * 0.3 / 1M = 0.3
    expect(usage.cost_usd).toBeCloseTo(0.3018, 3);
  });

  it("uses zero pricing for unknown models gracefully", () => {
    const usage = priceUsage(
      { input_per_mtok_usd: 0, output_per_mtok_usd: 0 },
      { input: 1000, output: 500 },
    );
    expect(usage.cost_usd).toBe(0);
  });
});

describe("approxTokenCount", () => {
  it("uses ~4 chars/token heuristic", () => {
    expect(approxTokenCount("")).toBe(0);
    expect(approxTokenCount("hello world")).toBe(Math.ceil(11 / 4));
  });
});
