import postgres, { type Sql } from "postgres";
import { z } from "zod";
import { errors } from "@relay-e/shared";
import { defineTool, type AnyToolDefinition } from "../tools/index.js";
import { resolveEnvString } from "./env.js";
import { validateSelectSql } from "./sql-safety.js";
import type { Connector, PostgresConnectorConfig } from "./types.js";

interface SchemaTable {
  schema: string;
  table: string;
  columns: { name: string; type: string; nullable: boolean }[];
}

/**
 * Postgres connector. On creation:
 *
 *   1. Connects with a (recommended) read-only role.
 *   2. Introspects information_schema for tables + columns.
 *   3. Caches the schema for prompt injection.
 *
 * Exposes one tool: `query_database`. The LLM writes SQL against the schema
 * we surface in the system prompt; we validate (read-only, no multi-statement,
 * LIMIT enforced) before executing.
 */
export class PostgresConnector implements Connector {
  readonly type = "postgres" as const;
  readonly id: string;
  readonly name: string;
  readonly description?: string;

  private readonly cfg: PostgresConnectorConfig;
  private readonly sql: Sql;
  private schemaCache?: SchemaTable[];

  constructor(id: string, name: string, cfg: PostgresConnectorConfig) {
    this.id = id;
    this.name = name;
    this.description = cfg.description;
    this.cfg = cfg;

    const url = resolveEnvString(cfg.url);
    if (!url) {
      throw errors.invalidRequest(
        "connector_misconfigured",
        `Postgres connector "${id}" has no resolvable URL (check env vars in config.url)`,
      );
    }

    this.sql = postgres(url, {
      max: cfg.maxConnections ?? 5,
      prepare: false,
      // Default statement timeout protects against runaway model-written queries.
      connection: { statement_timeout: 30_000 },
      onnotice: () => {},
    });
  }

  /** Discover tables + columns. Cached after the first call. */
  async getSchema(): Promise<SchemaTable[]> {
    if (this.schemaCache) return this.schemaCache;

    const schemas = this.cfg.schemas ?? ["public"];
    const allowlist = this.cfg.tableAllowlist;

    type Row = {
      table_schema: string;
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
      ordinal_position: number;
    };

    const rows = await this.sql<Row[]>`
      SELECT table_schema, table_name, column_name, data_type, is_nullable, ordinal_position
        FROM information_schema.columns
       WHERE table_schema = ANY(${schemas})
       ORDER BY table_schema, table_name, ordinal_position
    `;

    const byTable = new Map<string, SchemaTable>();
    for (const r of rows) {
      if (allowlist && !allowlist.includes(r.table_name)) continue;
      const key = `${r.table_schema}.${r.table_name}`;
      let entry = byTable.get(key);
      if (!entry) {
        entry = { schema: r.table_schema, table: r.table_name, columns: [] };
        byTable.set(key, entry);
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
    let schema: SchemaTable[] = [];
    try {
      schema = await this.getSchema();
    } catch (err) {
      // Don't take down the whole prompt if introspection fails — just note it.
      return [
        `### Database connector: \`${this.id}\` (${this.name})`,
        this.description ? `_${this.description}_` : "",
        `> Schema introspection failed (${(err as Error).message}). Tool calls may still work but you'll be operating blind.`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    const tableList = schema
      .map((t) => {
        const cols = t.columns
          .map((c) => `${c.name} ${c.type}${c.nullable ? "?" : ""}`)
          .join(", ");
        return `  - \`${t.schema}.${t.table}\`(${cols})`;
      })
      .join("\n");

    return [
      `### Database connector: \`${this.id}\` (${this.name})`,
      this.description ? `_${this.description}_` : "",
      `Available tables (read-only). Use \`query_database\` with the connector_id "${this.id}":`,
      tableList || "  _(no tables found in the configured schemas)_",
      `**Hard rules**: SELECT/WITH only; one statement; LIMIT auto-injected at ${this.cfg.rowLimit ?? 200} rows. ` +
        `INSERT/UPDATE/DELETE/DROP and friends are rejected.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async tools(): Promise<AnyToolDefinition[]> {
    const safety = {
      rowLimit: this.cfg.rowLimit,
      tableAllowlist: this.cfg.tableAllowlist,
    };

    return [
      defineTool({
        name: `query_${this.id}`,
        description:
          `Run a read-only SQL query against the "${this.name}" Postgres database. ` +
          (this.description ? `${this.description} ` : "") +
          `Returns up to ${this.cfg.rowLimit ?? 200} rows. ` +
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
          ctx.logger.info(
            { connector: this.id, sql: checked.sql },
            "postgres_query",
          );
          try {
            const rows = await this.sql.unsafe(checked.sql);
            return { rows: rows as unknown[], count: rows.length };
          } catch (err) {
            return { error: (err as Error).message, sql: checked.sql };
          }
        },
      }),
    ];
  }

  async dispose(): Promise<void> {
    await this.sql.end({ timeout: 1 }).catch(() => {});
  }
}
