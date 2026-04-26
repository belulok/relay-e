import { describe, it, expect, beforeAll } from "vitest";
import { introspectionRoutes } from "./skills.js";

beforeAll(() => {
  process.env.DEV_API_KEY = "test_key";
});

// These endpoints require DB + auth context (per-tenant bundle lookup).
// They're integration tests — gated on RELAY_E_TEST_DB.
const dbDescribe = process.env.RELAY_E_TEST_DB === "1" ? describe : describe.skip;

dbDescribe("GET /v1/skills and /v1/tools", () => {
  interface SkillRow {
    id: string | null;
    name: string;
    description: string | null;
    systemPrompt: string;
    toolNames: string[];
    connectorIds: string[];
    preferredTier: string | null;
    source: "global" | "tenant";
  }
  interface ToolRow { name: string; description: string; requires_approval: boolean }

  it("/v1/skills returns the public shape (may be empty in tests)", async () => {
    const res = await introspectionRoutes.fetch(new Request("http://localhost/v1/skills"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SkillRow[] };
    expect(Array.isArray(body.data)).toBe(true);
    for (const s of body.data) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("systemPrompt");
      expect(s).toHaveProperty("toolNames");
      expect(s).toHaveProperty("connectorIds");
      expect(s).toHaveProperty("preferredTier");
      expect(s).toHaveProperty("source");
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
