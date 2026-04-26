import { z } from "zod";
import { errors } from "@relay-e/shared";
import { defineTool, type AnyToolDefinition } from "../tools/index.js";
import { resolveEnvString } from "./env.js";
import { validateSelectSql } from "./sql-safety.js";
import type { Connector, SqlConnectorConfig } from "./types.js";

// `mysql2` is an OPTIONAL peer dep (we don't ship it; users install on demand).
// We can't import its types statically without forcing the install — these
// are local aliases so the file typechecks regardless.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mysql2Pool = any;

/**
 * Reference implementation of a customer-DB connector for **MySQL / MariaDB**.
 *
 * This is intentionally a peer of `PostgresConnector` — same `Connector`
 * interface, different driver, different schema introspection query. The
 * point: customers connect to whatever DB engine they actually use; the
 * engine's only hard dep on Postgres is its OWN internal storage (sessions,
 * usage_events, vector index).
 *
 * The `mysql2` package is loaded lazily so that:
 *   - You don't pay for the dep if no MySQL connector is registered.
 *   - The build doesn't require `mysql2` to exist.
 *
 * To enable, install once at the workspace root:
 *
 *   ```bash
 *   npm install mysql2 -w @relay-e/engine
 *   ```
 *
 * Then add a connector to your config:
 *
 *   ```json
 *   {
 *     "type": "mysql",
 *     "id": "shop_db",
 *     "name": "Shop MySQL",
 *     "config": { "url": "mysql://user:pass@host/shop", "rowLimit": 200 }
 *   }
 *   ```
 *
 * Same shape works for SQLite (`better-sqlite3`), MS SQL (`mssql`),
 * BigQuery (`@google-cloud/bigquery`), Snowflake (`snowflake-sdk`), etc.
 * Copy this file, swap the driver and the schema-introspection SQL.
 */
export class MySQLConnector implements Connector {
  readonly type = "mysql" as const;
  readonly id: string;
  readonly name: string;
  readonly description?: string;

  private readonly cfg: SqlConnectorConfig;
  private pool?: Mysql2Pool;
  private schemaCache?: { table: string; columns: { name: string; type: string; nullable: boolean }[] }[];

  constructor(id: string, name: string, cfg: SqlConnectorConfig) {
    this.id = id;
    this.name = name;
    this.description = cfg.description;
    this.cfg = cfg;

    if (!resolveEnvString(cfg.url)) {
      throw errors.invalidRequest(
        "connector_misconfigured",
        `MySQL connector "${id}" has no resolvable URL`,
      );
    }
  }

  private async getPool(): Promise<Mysql2Pool> {
    if (this.pool) return this.pool;
    let mod: { createPool: (opts: Record<string, unknown>) => Mysql2Pool };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mod = (await import("mysql2/promise" as any)) as typeof mod;
    } catch {
      throw errors.invalidRequest(
        "connector_dependency_missing",
        `MySQL connector requires the 'mysql2' package. Install with:\n  npm install mysql2 -w @relay-e/engine`,
      );
    }
    this.pool = mod.createPool({
      uri: resolveEnvString(this.cfg.url)!,
      connectionLimit: 5,
      multipleStatements: false,
    });
    return this.pool;
  }

  private async getSchema() {
    if (this.schemaCache) return this.schemaCache;
    const pool = await this.getPool();
    const [rows] = (await pool.query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name, ordinal_position`,
    )) as [Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>, unknown];

    const allowlist = this.cfg.tableAllowlist;
    const byTable = new Map<string, { table: string; columns: { name: string; type: string; nullable: boolean }[] }>();
    for (const r of rows) {
      if (allowlist && !allowlist.includes(r.table_name)) continue;
      let entry = byTable.get(r.table_name);
      if (!entry) {
        entry = { table: r.table_name, columns: [] };
        byTable.set(r.table_name, entry);
      }
      entry.columns.push({
        name: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable === "YES",
      });
    }
    this.schemaCache = [...byTable.values()];
    return this.schemaCache;
  }

  async getPromptContext(): Promise<string> {
    let schema: { table: string; columns: { name: string; type: string; nullable: boolean }[] }[] = [];
    try {
      schema = await this.getSchema();
    } catch (err) {
      return [
        `### MySQL connector: \`${this.id}\` (${this.name})`,
        `> Schema introspection failed: ${(err as Error).message}`,
      ].join("\n\n");
    }
    const tableList = schema
      .map((t) => {
        const cols = t.columns.map((c) => `${c.name} ${c.type}${c.nullable ? "?" : ""}`).join(", ");
        return `  - \`${t.table}\`(${cols})`;
      })
      .join("\n");
    return [
      `### MySQL connector: \`${this.id}\` (${this.name})`,
      this.description ? `_${this.description}_` : "",
      `Available tables (read-only). Use \`query_${this.id}\`:`,
      tableList || "  _(no tables visible)_",
      `**Hard rules**: SELECT/WITH only; one statement; LIMIT auto-injected at ${this.cfg.rowLimit ?? 200} rows.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async tools(): Promise<AnyToolDefinition[]> {
    const safety = { rowLimit: this.cfg.rowLimit, tableAllowlist: this.cfg.tableAllowlist };
    return [
      defineTool({
        name: `query_${this.id}`,
        description:
          `Run a read-only SQL query against the "${this.name}" MySQL database. ` +
          (this.description ? `${this.description} ` : "") +
          `Returns up to ${this.cfg.rowLimit ?? 200} rows.`,
        inputSchema: z.object({
          sql: z.string().min(1).describe("A single SELECT or WITH ... SELECT statement."),
        }),
        execute: async ({ sql }, ctx) => {
          const checked = validateSelectSql(sql, safety);
          if (!checked.ok) return { error: `sql_rejected: ${checked.reason}` };
          ctx.logger.info({ connector: this.id, sql: checked.sql }, "mysql_query");
          try {
            const pool = await this.getPool();
            const [rows] = await pool.query(checked.sql);
            return { rows, count: Array.isArray(rows) ? rows.length : 0 };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
    ];
  }

  async dispose(): Promise<void> {
    await this.pool?.end().catch(() => {});
  }
}
