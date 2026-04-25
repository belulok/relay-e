import { describe, it, expect } from "vitest";
import { defineSkill, SkillRegistry } from "./index.js";
import { EngineError } from "@relay-e/shared";

const fixture = defineSkill({
  name: "demo",
  description: "demo skill",
  systemPrompt: "be helpful",
  toolNames: ["echo"],
});

describe("SkillRegistry", () => {
  it("registers and retrieves skills", () => {
    const reg = new SkillRegistry();
    reg.register(fixture);
    expect(reg.get("demo")).toBe(fixture);
    expect(reg.list()).toHaveLength(1);
  });

  it("throws on duplicate names", () => {
    const reg = new SkillRegistry();
    reg.register(fixture);
    expect(() => reg.register(fixture)).toThrow(EngineError);
  });

  it("get() throws not_found for unknown skills", () => {
    const reg = new SkillRegistry();
    expect(() => reg.get("missing")).toThrow(/not found/);
  });

  it("resolve() returns [] when names is undefined", () => {
    const reg = new SkillRegistry();
    expect(reg.resolve()).toEqual([]);
    expect(reg.resolve([])).toEqual([]);
  });

  it("resolve() returns skills in input order", () => {
    const reg = new SkillRegistry();
    const a = defineSkill({ name: "a", description: "", systemPrompt: "", toolNames: [] });
    const b = defineSkill({ name: "b", description: "", systemPrompt: "", toolNames: [] });
    reg.registerMany([a, b]);
    expect(reg.resolve(["b", "a"])).toEqual([b, a]);
  });
});
