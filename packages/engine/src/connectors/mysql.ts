import { errors } from "@relay-e/shared";
import { resolveEnvString } from "./env.js";
import { SqlConnectorBase, type SchemaTable } from "./sql-base.js";
import type { SqlConnectorConfig } from "./types.js";
import { MYSQL_CONNECTION_LIMIT, SQL_DEFAULT_ROW_LIMIT } from "../constants.js";

// `mysql2` is an OPTIONAL peer dep. We can't import its types statically
// without forcing the install, so we alias through `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mysql2Pool = any;

/**
 * MySQL / MariaDB connector. Same `SqlConnectorBase` contract as Postgres —
 * only the driver import and the `information_schema` query differ.
 *
 * `mysql2` is loaded lazily so you don't pay for the dep if no MySQL
 * connector is registered. Install it on demand:
 *
 *   npm install mysql2 -w @relay-e/engine
 *
 * Copy this file to add SQLite (`better-sqlite3`), MSSQL (`mssql`),
 * BigQuery, Snowflake, etc. — swap the driver and the introspection query,
 * done.
 */
export class MySQLConnector extends SqlConnectorBase {
  readonly type = "mysql" as const;

  private readonly cfg: SqlConnectorConfig;
  private pool?: Mysql2Pool;

  constructor(id: string, name: string, cfg: SqlConnectorConfig) {
    super(
      id,
      name,
      cfg.description,
      cfg.rowLimit ?? SQL_DEFAULT_ROW_LIMIT,
      cfg.tableAllowlist,
    );
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
      connectionLimit: MYSQL_CONNECTION_LIMIT,
      multipleStatements: false,
    });
    return this.pool;
  }

  protected async introspectSchema(): Promise<SchemaTable[]> {
    const pool = await this.getPool();
    const [rows] = (await pool.query(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
        ORDER BY table_name, ordinal_position`,
    )) as [Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>, unknown];

    const byTable = new Map<string, SchemaTable>();
    for (const r of rows) {
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
    return [...byTable.values()];
  }

  protected async runQuery(sql: string): Promise<unknown[]> {
    const pool = await this.getPool();
    const [rows] = await pool.query(sql);
    return Array.isArray(rows) ? rows : [];
  }

  async dispose(): Promise<void> {
    await this.pool?.end().catch(() => {});
  }
}
