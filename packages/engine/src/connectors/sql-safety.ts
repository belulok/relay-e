/**
 * Lightweight SQL safety layer for LLM-generated queries.
 *
 * The model writes SQL based on the schema we showed it. We never trust that
 * SQL — even with a read-only DB role as a backstop, we validate at the engine
 * boundary so:
 *
 *   1. Bad queries fail fast with a structured error the model can recover from.
 *   2. Misconfigured DBs (forgot to use a read-only role) don't blow up.
 *   3. We can enforce per-query LIMITs, blocking runaway scans.
 *
 * Defense in depth — pair this with a read-only DB user in production.
 */

const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "CREATE",
  "MERGE",
  "REPLACE",
  "COPY",
  "CALL",
  "EXECUTE",
  "VACUUM",
  "ANALYZE",
  "REINDEX",
  "COMMENT",
  "LOCK",
  "ATTACH",
  "DETACH",
  "PRAGMA",
];

export interface SqlSafetyOptions {
  /** Max rows the connector should ever return. Injected via LIMIT. */
  rowLimit?: number;
  /** Optional: only allow queries against these tables (table-name level allowlist). */
  tableAllowlist?: string[];
}

export interface SqlSafetyResult {
  ok: true;
  /** SQL with LIMIT enforced if needed. */
  sql: string;
}

export interface SqlSafetyError {
  ok: false;
  reason: string;
}

/**
 * Validate that `sql` is a read-only query and return either an enforced version
 * with LIMIT injected, or an error explaining why the query was rejected.
 */
export function validateSelectSql(
  rawSql: string,
  opts: SqlSafetyOptions = {},
): SqlSafetyResult | SqlSafetyError {
  const trimmed = rawSql.trim().replace(/;\s*$/, "");
  if (!trimmed) return { ok: false, reason: "empty_query" };

  // Only allow a single statement. Multi-statement payloads are a classic
  // injection vector ("SELECT 1; DROP TABLE …").
  if (/;\s*\S/.test(trimmed)) {
    return { ok: false, reason: "multiple_statements_not_allowed" };
  }

  // Strip comments before keyword-checking so "/* DELETE */ SELECT 1" doesn't
  // sneak through.
  const stripped = stripSqlComments(trimmed);

  // Must start with SELECT or WITH (read-only constructs).
  if (!/^\s*(?:SELECT|WITH)\s/i.test(stripped)) {
    return {
      ok: false,
      reason: "only_select_or_with_allowed",
    };
  }

  // No forbidden keywords anywhere as standalone tokens.
  const upper = ` ${stripped.toUpperCase()} `;
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`[^A-Z_]${kw}[^A-Z_]`).test(upper)) {
      return { ok: false, reason: `forbidden_keyword:${kw}` };
    }
  }

  // Optional: enforce a table allowlist by scanning FROM/JOIN targets.
  if (opts.tableAllowlist && opts.tableAllowlist.length > 0) {
    const tableMatches = stripped.matchAll(
      /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)/gi,
    );
    const allowed = new Set(opts.tableAllowlist.map((t) => t.toLowerCase()));
    for (const match of tableMatches) {
      const table = match[1]!.toLowerCase().split(".").pop()!;
      if (!allowed.has(table)) {
        return { ok: false, reason: `table_not_allowed:${table}` };
      }
    }
  }

  // Inject LIMIT if missing.
  const rowLimit = opts.rowLimit ?? 200;
  const hasLimit = /\bLIMIT\s+\d+/i.test(stripped);
  const sql = hasLimit ? stripped : `${stripped} LIMIT ${rowLimit}`;

  return { ok: true, sql };
}

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block comments */
    .replace(/--[^\n]*/g, " ");        // -- line comments
}
