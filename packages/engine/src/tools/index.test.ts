import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineTool, ToolRegistry } from "./index.js";
import { EngineError } from "@relay-e/shared";

const echo = defineTool({
  name: "echo",
  description: "echoes input",
  inputSchema: z.object({ text: z.string() }),
  execute: async (input) => ({ echoed: input.text }),
});

const ping = defineTool({
  name: "ping",
  description: "ping",
  inputSchema: z.object({}),
  execute: async () => ({ ok: true }),
});

describe("ToolRegistry", () => {
  it("registers and lists tools", () => {
    const reg = new ToolRegistry();
    reg.registerMany([echo, ping]);
    const names = reg.list().map((t) => t.name).sort();
    expect(names).toEqual(["echo", "ping"]);
  });

  it("rejects duplicate registration", () => {
    const reg = new ToolRegistry();
    reg.register(echo);
    expect(() => reg.register(echo)).toThrow(EngineError);
  });

  it("pick() returns only the requested tools and silently drops unknowns", () => {
    const reg = new ToolRegistry();
    reg.registerMany([echo, ping]);
    const picked = reg.pick(["echo", "missing"]);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.name).toBe("echo");
  });
});
