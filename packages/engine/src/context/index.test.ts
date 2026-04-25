import { describe, it, expect } from "vitest";
import { ContextResolver, type ContextSource } from "./index.js";
import { logger } from "@relay-e/shared";

function makeRequest() {
  return {
    tenantId: "t1",
    query: "what is my balance",
    skills: ["financial"],
    logger,
    signal: new AbortController().signal,
  };
}

function staticSource(name: string, items: { content: string; priority: number; tokenEstimate: number }[]): ContextSource {
  return {
    name,
    priority: 0,
    fetch: async () =>
      items.map((i) => ({ source: name, priority: i.priority, tokenEstimate: i.tokenEstimate, content: i.content })),
  };
}

describe("ContextResolver", () => {
  it("merges items from multiple sources, sorted by priority desc", async () => {
    const resolver = new ContextResolver([
      staticSource("a", [{ content: "low", priority: 1, tokenEstimate: 10 }]),
      staticSource("b", [{ content: "high", priority: 100, tokenEstimate: 10 }]),
    ]);
    const bundle = await resolver.resolve(makeRequest(), 1000);
    expect(bundle.items.map((i) => i.source)).toEqual(["b", "a"]);
  });

  it("trims to the token budget by dropping low-priority items first", async () => {
    const resolver = new ContextResolver([
      staticSource("hi", [{ content: "x", priority: 100, tokenEstimate: 60 }]),
      staticSource("lo", [{ content: "y", priority: 1, tokenEstimate: 60 }]),
    ]);
    const bundle = await resolver.resolve(makeRequest(), 100);
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0]?.source).toBe("hi");
    expect(bundle.totalTokenEstimate).toBe(60);
  });

  it("survives a source that throws", async () => {
    const broken: ContextSource = {
      name: "broken",
      priority: 0,
      fetch: async () => {
        throw new Error("boom");
      },
    };
    const resolver = new ContextResolver([
      broken,
      staticSource("ok", [{ content: "x", priority: 50, tokenEstimate: 10 }]),
    ]);
    const bundle = await resolver.resolve(makeRequest(), 1000);
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0]?.source).toBe("ok");
  });

  it("calls every source in parallel (resolves in ~max single-source time)", async () => {
    const slow: ContextSource = {
      name: "slow",
      priority: 0,
      fetch: async () => {
        await new Promise((r) => setTimeout(r, 80));
        return [{ source: "slow", priority: 10, tokenEstimate: 5, content: "s" }];
      },
    };
    const resolver = new ContextResolver([slow, slow, slow]);
    const t0 = Date.now();
    await resolver.resolve(makeRequest(), 1000);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(200); // sequential would be ~240ms
  });
});
