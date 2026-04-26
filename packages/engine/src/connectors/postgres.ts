import postgres, { type Sql } from "postgres";
import { errors } from "@relay-e/shared";
import { resolveEnvString } from "./env.js";
import { SqlConnectorBase, type SchemaTable } from "./sql-base.js";
import type { PostgresConnectorConfig } from "./types.js";
import { POSTGRES_MAX_CONNECTIONS, SQL_DEFAULT_ROW_LIMIT, CONNECTOR_STATEMENT_TIMEOUT_MS } from "../constants.js";

/**
 * Postgres connector. On creation:
 *
 *   1. Connects with a (recommended) read-only role.
 *   2. Introspects information_schema for tables + columns on first query.
 *   3. Caches the schema for prompt injection.
 *
 * Exposes one tool: `query_{id}`. The LLM writes SQL against the schema
 * we surface in the system prompt; we validate (read-only, no multi-statement,
 * LIMIT enforced) before executing.
 */
export class PostgresConnector extends SqlConnectorBase {
  readonly type = "postgres" as const;

  private readonly sql: Sql;
  private readonly cfg: PostgresConnectorConfig;

  constructor(id: string, name: string, cfg: PostgresConnectorConfig) {
    super(
      id,
      name,
      cfg.description,
      cfg.rowLimit ?? SQL_DEFAULT_ROW_LIMIT,
      cfg.tableAllowlist,
    );
    this.cfg = cfg;

    const url = resolveEnvString(cfg.url);
    if (!url) {
      throw errors.invalidRequest(
        "connector_misconfigured",
        `Postgres connector "${id}" has no resolvable URL (check env vars in config.url)`,
      );
    }

    this.sql = postgres(url, {
      max: cfg.maxConnections ?? POSTGRES_MAX_CONNECTIONS,
      prepare: false,
      connection: { statement_timeout: CONNECTOR_STATEMENT_TIMEOUT_MS },
      onnotice: () => {},
    });
  }

  protected async introspectSchema(): Promise<SchemaTable[]> {
    const schemas = this.cfg.schemas ?? ["public"];

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

    return [...byTable.values()];
  }

  protected async runQuery(sql: string): Promise<unknown[]> {
    const rows = await this.sql.unsafe(sql);
    return rows as unknown[];
  }

  async dispose(): Promise<void> {
    await this.sql.end({ timeout: 1 }).catch(() => {});
  }
}
