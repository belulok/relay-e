/** SQL connectors: max rows returned per query when no rowLimit is configured. */
export const SQL_DEFAULT_ROW_LIMIT = 200;

/** MongoDB connector: max documents returned per find. */
export const MONGO_DEFAULT_ROW_LIMIT = 100;

/** MongoDB connector: number of docs sampled per collection for schema inference. */
export const MONGO_DEFAULT_SAMPLE_SIZE = 5;

/** PostgreSQL connector: statement_timeout passed to every connection. */
export const CONNECTOR_STATEMENT_TIMEOUT_MS = 30_000;

/** MySQL connector: max connections in the pool. */
export const MYSQL_CONNECTION_LIMIT = 5;

/** PostgreSQL connector: max concurrent connections. */
export const POSTGRES_MAX_CONNECTIONS = 5;

/** Tenant bundle cache TTL (overridden by TENANT_REGISTRY_TTL_MS env var). */
export const TENANT_BUNDLE_TTL_MS = 60_000;

/** HTTP connector: fetch timeout per request. */
export const HTTP_FETCH_TIMEOUT_MS = 30_000;

/** WebSearch connector: max results returned when not configured. */
export const WEBSEARCH_DEFAULT_MAX_RESULTS = 5;
