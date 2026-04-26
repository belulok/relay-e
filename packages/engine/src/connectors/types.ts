import type { AnyToolDefinition } from "../tools/index.js";
import type {
  PostgresConnectorConfigSchema,
  SqlConnectorConfigSchema,
  MongoConnectorConfigSchema,
  HttpConnectorConfigSchema,
  WebSearchConnectorConfigSchema,
  MCPConnectorConfigSchema,
} from "./schemas.js";
import type { z } from "zod";

export type ConnectorType =
  | "postgres"
  | "mysql"
  | "sqlite"   // roadmap — pattern in mysql.ts works as a template
  | "mssql"    // roadmap
  | "mongo"
  | "http"
  | "websearch"
  | "mcp";

/**
 * Config types are derived directly from the canonical Zod schemas in
 * `schemas.ts` — no hand-maintained duplication.
 */
export type PostgresConnectorConfig = z.infer<typeof PostgresConnectorConfigSchema>;
export type SqlConnectorConfig = z.infer<typeof SqlConnectorConfigSchema>;
export type MongoConnectorConfig = z.infer<typeof MongoConnectorConfigSchema>;
export type HttpConnectorConfig = z.infer<typeof HttpConnectorConfigSchema>;
export type WebSearchConnectorConfig = z.infer<typeof WebSearchConnectorConfigSchema>;
export type MCPConnectorConfig = z.infer<typeof MCPConnectorConfigSchema>;

export type ConnectorConfig =
  | { type: "postgres"; id: string; name: string; config: PostgresConnectorConfig }
  | { type: "mysql"; id: string; name: string; config: SqlConnectorConfig }
  | { type: "mongo"; id: string; name: string; config: MongoConnectorConfig }
  | { type: "http"; id: string; name: string; config: HttpConnectorConfig }
  | { type: "websearch"; id: string; name: string; config: WebSearchConnectorConfig }
  | { type: "mcp"; id: string; name: string; config: MCPConnectorConfig };

/**
 * Runtime connector — what the registry returns. Each connector exposes:
 *
 * - `tools`: generic tools the LLM can call (e.g. `query_database`, `call_api`).
 * - `getPromptContext()`: schema/API summary injected into the system prompt
 *   when this connector is active for a skill, so the LLM knows what's queryable
 *   without us hardcoding domain logic.
 * - `dispose()`: clean up connections on shutdown.
 */
export interface Connector {
  readonly id: string;
  readonly type: ConnectorType;
  readonly name: string;
  readonly description?: string;
  /** Tools this connector contributes to the registry. */
  tools(): Promise<AnyToolDefinition[]>;
  /** Markdown describing what the LLM can do with this connector. */
  getPromptContext(): Promise<string>;
  /** Best-effort cleanup. */
  dispose(): Promise<void>;
}
