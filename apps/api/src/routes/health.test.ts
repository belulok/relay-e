import { describe, it, expect } from "vitest";
import { healthRoutes } from "./health.js";

describe("GET /health", () => {
  it("returns 200 with status ok and a numeric uptime", async () => {
    const res = await healthRoutes.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string; uptime_s: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptime_s).toBe("number");
    expect(body.version).toBe("0.0.1");
  });
});
