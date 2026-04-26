import { describe, it, expect } from "vitest";
import { ConnectorRegistry } from "./registry.js";

describe("ConnectorRegistry", () => {
  it("recognises known connector type tags", () => {
    expect(ConnectorRegistry.isKnownType("postgres")).toBe(true);
    expect(ConnectorRegistry.isKnownType("mysql")).toBe(true);
    expect(ConnectorRegistry.isKnownType("http")).toBe(true);
    expect(ConnectorRegistry.isKnownType("websearch")).toBe(true);
    expect(ConnectorRegistry.isKnownType("mcp")).toBe(true);
    expect(ConnectorRegistry.isKnownType("nope")).toBe(false);
  });

  it("rejects duplicate connector ids", () => {
    process.env.TAVILY_API_KEY ??= "stub";
    const reg = new ConnectorRegistry();
    reg.register({
      type: "websearch",
      id: "web",
      name: "Web",
      config: { provider: "tavily", apiKeyEnv: "TAVILY_API_KEY" },
    });
    expect(() =>
      reg.register({
        type: "websearch",
        id: "web",
        name: "Web 2",
        config: { provider: "tavily", apiKeyEnv: "TAVILY_API_KEY" },
      }),
    ).toThrow(/already registered/);
  });

  it("aggregates tools from selected connectors", async () => {
    process.env.TAVILY_API_KEY ??= "stub";
    const reg = new ConnectorRegistry();
    reg.register({
      type: "websearch",
      id: "web2",
      name: "Web",
      config: { provider: "tavily", apiKeyEnv: "TAVILY_API_KEY" },
    });
    reg.register({
      type: "http",
      id: "stripe",
      name: "Stripe",
      config: { baseUrl: "https://api.stripe.com/v1" },
    });

    const tools = await reg.toolsFor(["web2", "stripe"]);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["call_stripe", "web_search"]);
  });

  it("returns prompt context blocks for selected connectors", async () => {
    process.env.TAVILY_API_KEY ??= "stub";
    const reg = new ConnectorRegistry();
    reg.register({
      type: "websearch",
      id: "web3",
      name: "Web",
      config: { provider: "tavily", apiKeyEnv: "TAVILY_API_KEY" },
    });
    const prompt = await reg.promptContextFor(["web3"]);
    expect(prompt).toContain("Web search connector");
    expect(prompt).toContain("`web3`");
  });

  it("silently drops unknown ids in pick/promptContextFor", async () => {
    const reg = new ConnectorRegistry();
    expect(reg.pick(["does_not_exist"])).toEqual([]);
    expect(await reg.toolsFor(["does_not_exist"])).toEqual([]);
    expect(await reg.promptContextFor(["does_not_exist"])).toBe("");
  });

  it("get() throws for unknown ids", () => {
    const reg = new ConnectorRegistry();
    expect(() => reg.get("does_not_exist")).toThrow();
  });
});
