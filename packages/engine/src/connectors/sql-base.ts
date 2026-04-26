import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../tools/index.js";
import { validateSelectSql } from "./sql-safety.js";
import type { Connector, ConnectorType } from "./types.js";
import { SQL_DEFAULT_ROW_LIMIT } from "../constants.js";

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface SchemaTable {
  schema?: string;
  table: string;
  columns: SchemaColumn[];
}

/**
 * Shared implementation for every SQL-family connector (Postgres, MySQL,
 * SQLite, MSSQL, BigQuery, …).
 *
 * Subclasses implement three primitives:
 *   - `introspectSchema()` — run the driver-specific information_schema query
 *   - `runQuery(sql)` — execute a validated SELECT and return rows as unknown[]
 *   - `dispose()` — best-effort cleanup of the connection / pool
 *
 * Everything else — caching, allowlist filtering, prompt context formatting,
 * and the `query_{id}` tool — lives here so new SQL connectors are ~30 lines.
 */
export abstract class SqlConnectorBase implements Connector {
  abstract readonly type: ConnectorType;

  readonly id: string;
  readonly name: string;
  readonly description?: string;

  protected readonly rowLimit: number;
  protected readonly tableAllowlist?: string[];

  private schemaCache?: SchemaTable[];

  constructor(
    id: string,
    name: string,
    description: string | undefined,
    rowLimit: number,
    tableAllowlist?: string[],
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.rowLimit = rowLimit;
    this.tableAllowlist = tableAllowlist;
  }

  /** Driver-specific: return raw rows from information_schema (no allowlist). */
  protected abstract introspectSchema(): Promise<SchemaTable[]>;

  /** Driver-specific: execute a pre-validated SELECT and return rows. */
  protected abstract runQuery(sql: string): Promise<unknown[]>;

  abstract dispose(): Promise<void>;

  protected async getSchema(): Promise<SchemaTable[]> {
    if (this.schemaCache) return this.schemaCache;
    const raw = await this.introspectSchema();
    this.schemaCache = this.tableAllowlist
      ? raw.filter((t) => this.tableAllowlist!.includes(t.table))
      : raw;
    return this.schemaCache;
  }

  async getPromptContext(): Promise<string> {
    let schema: SchemaTable[] = [];
    try {
      schema = await this.getSchema();
    } catch (err) {
      return [
        `### SQL connector: \`${this.id}\` (${this.name})`,
        this.description ? `_${this.description}_` : "",
        `> Schema introspection failed (${(err as Error).message}). Tool calls may still work but you'll be operating blind.`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    const tableList = schema
      .map((t) => {
        const fqn = t.schema ? `${t.schema}.${t.table}` : t.table;
        const cols = t.columns
          .map((c) => `${c.name} ${c.type}${c.nullable ? "?" : ""}`)
          .join(", ");
        return `  - \`${fqn}\`(${cols})`;
      })
      .join("\n");

    return [
      `### SQL connector: \`${this.id}\` (${this.name})`,
      this.description ? `_${this.description}_` : "",
      `Available tables (read-only). Use \`query_${this.id}\`:`,
      tableList || "  _(no tables found in the configured schemas)_",
      `**Hard rules**: SELECT/WITH only; one statement; LIMIT auto-injected at ${this.rowLimit} rows. ` +
        `INSERT/UPDATE/DELETE/DROP and friends are rejected.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async tools(): Promise<AnyToolDefinition[]> {
    const safety = {
      rowLimit: this.rowLimit,
      tableAllowlist: this.tableAllowlist,
    };

    return [
      defineTool({
        name: `query_${this.id}`,
        description:
          `Run a read-only SQL query against the "${this.name}" database. ` +
          (this.description ? `${this.description} ` : "") +
          `Returns up to ${this.rowLimit} rows. ` +
          `Use the schema shown in the system prompt — only SELECT/WITH queries are allowed.`,
        inputSchema: z.object({
          sql: z
            .string()
            .min(1)
            .describe("A single SELECT or WITH ... SELECT statement."),
        }),
        execute: async ({ sql: rawSql }, ctx) => {
          const checked = validateSelectSql(rawSql, safety);
          if (!checked.ok) {
            return { error: `sql_rejected: ${checked.reason}`, sql_attempted: rawSql };
          }
          ctx.logger.info({ connector: this.id, sql: checked.sql }, "sql_query");
          try {
            const rows = await this.runQuery(checked.sql);
            return { rows, count: rows.length };
          } catch (err) {
            return { error: (err as Error).message, sql: checked.sql };
          }
        },
      }),
    ];
  }
}
