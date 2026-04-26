import { describe, it, expect, beforeAll } from "vitest";
import { introspectionRoutes } from "./skills.js";

beforeAll(() => {
  process.env.DEV_API_KEY = "test_key";
});

describe("GET /v1/skills and /v1/tools", () => {
  // Note: the auth middleware is mounted at the server level, not on these
  // sub-routers. These tests therefore exercise the route logic only.

  interface SkillRow { name: string; tools: string[]; connectors: string[]; preferred_tier: string | null }
  interface ToolRow { name: string; description: string; requires_approval: boolean }

  it("/v1/skills returns the public shape (may be empty in tests)", async () => {
    const res = await introspectionRoutes.fetch(new Request("http://localhost/v1/skills"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SkillRow[] };
    expect(Array.isArray(body.data)).toBe(true);
    // Skills are config-driven now — test bootstrap doesn't run in unit tests.
    // Just verify the response shape is correct when entries exist.
    for (const s of body.data) {
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("tools");
      expect(s).toHaveProperty("connectors");
      expect(s).toHaveProperty("preferred_tier");
    }
  });

  it("/v1/tools returns the public shape (may be empty in tests)", async () => {
    const res = await introspectionRoutes.fetch(new Request("http://localhost/v1/tools"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: ToolRow[] };
    expect(Array.isArray(body.data)).toBe(true);
    for (const t of body.data) {
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("description");
      expect(t).toHaveProperty("requires_approval");
    }
  });
});
