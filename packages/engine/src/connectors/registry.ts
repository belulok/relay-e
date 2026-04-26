import { childLogger, errors, type Logger } from "@relay-e/shared";
import type { AnyToolDefinition } from "../tools/index.js";
import { HttpConnector } from "./http.js";
import { MongoConnector } from "./mongo.js";
import { MySQLConnector } from "./mysql.js";
import { PostgresConnector } from "./postgres.js";
import { WebSearchConnector } from "./websearch.js";
import type { Connector, ConnectorConfig, ConnectorType } from "./types.js";

/**
 * Registry of live connectors. Holds construction logic per connector type
 * and lets the bootstrap code register from JSON / DB / env without each
 * caller importing every concrete class.
 *
 * To add a new connector type (Mongo, MSSQL, BigQuery, Snowflake, MCP, ...):
 *
 *   1. Implement `Connector` (see `./types.ts`). For SQL DBs, copy
 *      `mysql.ts` as a template — only the driver import and the
 *      `information_schema` query change.
 *   2. Add a case to the switch in `register()` below.
 *   3. Add the type tag to `ConnectorType` and `ConnectorConfig`.
 *   4. Done — no other layer changes; tools and prompt context are
 *      auto-derived from the new connector instance.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();
  private readonly log: Logger;

  constructor(logger?: Logger) {
    this.log = (logger ?? childLogger({})).child({ component: "ConnectorRegistry" });
  }

  /** Register a connector from its declarative config. */
  register(cfg: ConnectorConfig): Connector {
    if (this.connectors.has(cfg.id)) {
      throw errors.invalidRequest(
        "duplicate_connector",
        `Connector with id "${cfg.id}" is already registered`,
      );
    }

    let connector: Connector;
    switch (cfg.type) {
      case "postgres":
        connector = new PostgresConnector(cfg.id, cfg.name, cfg.config);
        break;
      case "mysql":
        // mysql2 is loaded lazily by the connector — install on demand.
        connector = new MySQLConnector(cfg.id, cfg.name, cfg.config);
        break;
      case "mongo":
        // mongodb is loaded lazily — install on demand.
        connector = new MongoConnector(cfg.id, cfg.name, cfg.config);
        break;
      case "http":
        connector = new HttpConnector(cfg.id, cfg.name, cfg.config);
        break;
      case "websearch":
        connector = new WebSearchConnector(cfg.id, cfg.name, cfg.config);
        break;
      case "mcp":
        throw errors.invalidRequest(
          "connector_not_implemented",
          "MCP connector is on the roadmap — see docs/concepts/connectors",
        );
    }

    this.connectors.set(cfg.id, connector);
    this.log.info({ id: cfg.id, type: cfg.type, name: cfg.name }, "connector_registered");
    return connector;
  }

  get(id: string): Connector {
    const c = this.connectors.get(id);
    if (!c) throw errors.notFound(`connector:${id}`);
    return c;
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }

  /** Resolve `ids` (silently drops unknown). */
  pick(ids: string[]): Connector[] {
    return ids.map((id) => this.connectors.get(id)).filter((c): c is Connector => Boolean(c));
  }

  /**
   * Aggregate every tool from every connector in `ids`. Skill bootstrap calls
   * this so a skill's tool list is auto-derived from its connector list — no
   * hardcoded `toolNames` per skill in the common case.
   */
  async toolsFor(ids: string[]): Promise<AnyToolDefinition[]> {
    const out: AnyToolDefinition[] = [];
    for (const c of this.pick(ids)) {
      out.push(...(await c.tools()));
    }
    return out;
  }

  /**
   * Aggregate prompt-context blocks for the given connectors. Returned string
   * goes into the system prompt under "# Connectors" so the LLM sees what's
   * queryable (DB schemas, API surfaces, search availability) at request time.
   */
  async promptContextFor(ids: string[]): Promise<string> {
    const blocks: string[] = [];
    for (const c of this.pick(ids)) {
      try {
        blocks.push(await c.getPromptContext());
      } catch (err) {
        this.log.warn({ id: c.id, err }, "connector_prompt_context_failed");
      }
    }
    return blocks.join("\n\n---\n\n");
  }

  async dispose(): Promise<void> {
    await Promise.all(this.list().map((c) => c.dispose().catch(() => {})));
    this.connectors.clear();
  }

  /** Type guard helper for the bootstrap layer. */
  static isKnownType(type: string): type is ConnectorType {
    return ["postgres", "mysql", "sqlite", "mssql", "mongo", "http", "websearch", "mcp"].includes(type);
  }
}
