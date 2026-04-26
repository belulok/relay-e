import type { AnyToolDefinition } from "../tools/index.js";

export type ConnectorType =
  | "postgres"
  | "mysql"
  | "sqlite"   // roadmap — pattern in mysql.ts works as a template
  | "mssql"    // roadmap
  | "mongo"    // roadmap (different schema-discovery — use sample docs)
  | "http"
  | "websearch"
  | "mcp";

/**
 * Configuration shapes for each connector type. Loaded from JSON / DB,
 * validated at registration time. Secrets reference env vars (never inline).
 */
export interface PostgresConnectorConfig {
  url: string;            // postgres://user:pass@host:port/db — supports ${ENV_VAR} substitution
  readOnly?: boolean;     // recommended: true (relies on a read-only DB role)
  maxConnections?: number;
  schemas?: string[];     // schemas to introspect (default: ["public"])
  tableAllowlist?: string[]; // optional: limit which tables the LLM can see
  rowLimit?: number;      // hard cap injected into queries (default: 200)
  description?: string;   // human-readable summary, prepended to schema in prompt
}

export interface HttpConnectorConfig {
  baseUrl: string;
  description?: string;
  auth?: {
    type: "bearer" | "basic" | "header" | "none";
    tokenEnv?: string;     // for bearer: env var holding the token
    username?: string;
    passwordEnv?: string;
    headerName?: string;
    headerValueEnv?: string;
  };
  // Optional: load this OpenAPI spec on boot to inject endpoint surface into prompts
  openApiUrl?: string;
  // Optional: explicit endpoint allowlist (keeps the model on rails)
  endpoints?: Array<{
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;          // e.g. "/users/{id}/orders"
    summary?: string;
  }>;
}

export interface WebSearchConnectorConfig {
  provider: "tavily" | "brave" | "serper";
  apiKeyEnv: string;       // env var holding the provider's API key
  maxResults?: number;     // default 5
}

export interface MCPConnectorConfig {
  // Roadmap — interface only for now.
  transport: "stdio" | "sse";
  command?: string;        // for stdio
  args?: string[];
  url?: string;            // for sse
}

export interface SqlConnectorConfig {
  /** Connection string. Supports `${ENV_VAR}` substitution. */
  url: string;
  description?: string;
  schemas?: string[];
  tableAllowlist?: string[];
  rowLimit?: number;
}

export type ConnectorConfig =
  | { type: "postgres"; id: string; name: string; config: PostgresConnectorConfig }
  | { type: "mysql"; id: string; name: string; config: SqlConnectorConfig }
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
