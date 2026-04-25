import { describe, it, expect } from "vitest";
import { EngineError, errors } from "./errors.js";

describe("EngineError", () => {
  it("serialises to the canonical Stripe-like shape", () => {
    const err = errors.invalidRequest("bad_field", "Field x is invalid", { field: "x" });
    const payload = err.toJSON("req_123");
    expect(payload.error.type).toBe("invalid_request_error");
    expect(payload.error.code).toBe("bad_field");
    expect(payload.error.message).toBe("Field x is invalid");
    expect(payload.error.request_id).toBe("req_123");
    expect(payload.error.details).toEqual({ field: "x" });
  });

  it("maps each error type to a sane HTTP status by default", () => {
    expect(errors.unauthorized().status).toBe(401);
    expect(errors.notFound("session").status).toBe(404);
    expect(errors.rateLimit().status).toBe(429);
    expect(errors.quota().status).toBe(429);
    expect(errors.provider("boom").status).toBe(502);
    expect(errors.internal().status).toBe(500);
  });

  it("derives tool error messages with the tool name prefix", () => {
    const err = errors.tool("get_balance", "timeout");
    expect(err.message).toContain("get_balance");
    expect(err.message).toContain("timeout");
    expect(err.code).toBe("tool_failed");
  });

  it("is a real Error subclass — instanceof works", () => {
    const err = errors.internal();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EngineError);
  });
});
