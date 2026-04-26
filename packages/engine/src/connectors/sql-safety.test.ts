import { describe, it, expect } from "vitest";
import { validateSelectSql } from "./sql-safety.js";

describe("validateSelectSql", () => {
  it("accepts a plain SELECT and injects LIMIT", () => {
    const r = validateSelectSql("SELECT * FROM users");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toBe("SELECT * FROM users LIMIT 200");
  });

  it("respects an existing LIMIT", () => {
    const r = validateSelectSql("SELECT * FROM users LIMIT 5");
    if (r.ok) expect(r.sql).toBe("SELECT * FROM users LIMIT 5");
  });

  it("respects a custom rowLimit when LIMIT missing", () => {
    const r = validateSelectSql("SELECT 1", { rowLimit: 10 });
    if (r.ok) expect(r.sql).toBe("SELECT 1 LIMIT 10");
  });

  it("accepts a CTE", () => {
    const r = validateSelectSql("WITH x AS (SELECT 1) SELECT * FROM x");
    expect(r.ok).toBe(true);
  });

  it("rejects empty input", () => {
    const r = validateSelectSql("");
    expect(r.ok).toBe(false);
  });

  it("rejects multi-statement payloads", () => {
    const r = validateSelectSql("SELECT 1; DROP TABLE users");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("multiple_statements_not_allowed");
  });

  it.each([
    "INSERT INTO users (id) VALUES (1)",
    "UPDATE users SET name = 'x'",
    "DELETE FROM users",
    "DROP TABLE users",
    "ALTER TABLE users ADD COLUMN x int",
    "TRUNCATE users",
    "GRANT SELECT ON users TO public",
    "CREATE TABLE foo (x int)",
    "merge into target USING source ON target.id = source.id WHEN MATCHED THEN UPDATE SET x = 1",
  ])("rejects non-read-only statement: %s", (sql) => {
    const r = validateSelectSql(sql);
    expect(r.ok).toBe(false);
  });

  it("rejects forbidden keywords hidden in comments", () => {
    const r = validateSelectSql("SELECT 1 /* DROP TABLE users */; DELETE FROM users");
    expect(r.ok).toBe(false);
  });

  it("treats forbidden words inside string literals as SQL keywords (defensive)", () => {
    // Defensive false-positive — better to reject than risk an injection bypass.
    const r = validateSelectSql("SELECT 'INSERT' FROM users");
    expect(r.ok).toBe(false);
  });

  it("enforces table allowlist", () => {
    const r = validateSelectSql("SELECT * FROM secrets", {
      tableAllowlist: ["users", "orders"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^table_not_allowed:/);
  });

  it("permits allowlisted tables", () => {
    const r = validateSelectSql("SELECT * FROM users JOIN orders ON 1=1", {
      tableAllowlist: ["users", "orders"],
    });
    expect(r.ok).toBe(true);
  });

  it("strips trailing semicolons", () => {
    const r = validateSelectSql("SELECT 1;");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sql).toBe("SELECT 1 LIMIT 200");
  });
});
