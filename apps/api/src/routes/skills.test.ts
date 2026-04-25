import { describe, it, expect, beforeAll } from "vitest";
import { introspectionRoutes } from "./skills.js";

beforeAll(() => {
  process.env.DEV_API_KEY = "test_key";
});

describe("GET /v1/skills and /v1/tools", () => {
  // Note: the auth middleware is mounted at the server level, not on these
  // sub-routers. These tests therefore exercise the route logic only.

  interface SkillRow { name: string; tools: string[]; preferred_tier: string | null }
  interface ToolRow { name: string; description: string; requires_approval: boolean }

  it("/v1/skills lists registered skills with the public shape", async () => {
    const res = await introspectionRoutes.fetch(new Request("http://localhost/v1/skills"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SkillRow[] };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const sample = body.data[0];
    expect(sample).toHaveProperty("name");
    expect(sample).toHaveProperty("tools");
    expect(sample).toHaveProperty("preferred_tier");
  });

  it("/v1/tools lists tools with requires_approval flag", async () => {
    const res = await introspectionRoutes.fetch(new Request("http://localhost/v1/tools"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ToolRow[] };
    expect(Array.isArray(body.data)).toBe(true);
    const transferTool = body.data.find((t) => t.name === "transfer_funds");
    expect(transferTool).toBeDefined();
    expect(transferTool?.requires_approval).toBe(true);
  });
});
