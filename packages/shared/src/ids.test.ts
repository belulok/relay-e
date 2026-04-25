import { describe, it, expect } from "vitest";
import { ids, newId } from "./ids.js";

describe("ids", () => {
  it("uses the documented prefix per kind", () => {
    expect(ids.request()).toMatch(/^req_/);
    expect(ids.session()).toMatch(/^ses_/);
    expect(ids.message()).toMatch(/^msg_/);
    expect(ids.run()).toMatch(/^run_/);
    expect(ids.toolCall()).toMatch(/^tc_/);
  });

  it("newId returns base64url with no padding", () => {
    const id = newId("xyz");
    expect(id).toMatch(/^xyz_[A-Za-z0-9_-]+$/);
  });

  it("returns unique IDs across many calls", () => {
    const set = new Set(Array.from({ length: 1000 }, () => ids.run()));
    expect(set.size).toBe(1000);
  });
});
