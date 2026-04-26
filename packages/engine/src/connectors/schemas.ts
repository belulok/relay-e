import { z } from "zod";

/**
 * Canonical Zod schemas for every connector config type and the top-level
 * app config file. These are the single source of truth — `types.ts` derives
 * its TypeScript interfaces from here via `z.infer`, and the JSON config
 * loader in `apps/api` imports these directly instead of re-declaring them.
 */

// ---------------------------------------------------------------------------
// Per-type config schemas
// ---------------------------------------------------------------------------

export const PostgresConnectorConfigSchema = z.object({
  url: z.string().min(1),
  description: z.string().optional(),
  readOnly: z.boolean().optional(),
  maxConnections: z.number().int().positive().optional(),
  schemas: z.array(z.string()).optional(),
  tableAllowlist: z.array(z.string()).optional(),
  rowLimit: z.number().int().positive().optional(),
});

export const SqlConnectorConfigSchema = z.object({
  url: z.string().min(1),
  description: z.string().optional(),
  schemas: z.array(z.string()).optional(),
  tableAllowlist: z.array(z.string()).optional(),
  rowLimit: z.number().int().positive().optional(),
});

export const MongoConnectorConfigSchema = z.object({
  url: z.string().min(1),
  dbName: z.string().optional(),
  description: z.string().optional(),
  collectionAllowlist: z.array(z.string()).optional(),
  rowLimit: z.number().int().positive().optional(),
  sampleSize: z.number().int().positive().optional(),
});

export const HttpAuthSchema = z.object({
  type: z.enum(["bearer", "basic", "header", "none"]),
  token: z.string().optional(),                        // inline value (use when config file is gitignored)
  tokenEnv: z.string().optional(),                     // env var name (use when config is in git)
  extraHeaders: z.record(z.string()).optional(),        // additional headers sent with every request (e.g. apikey for Supabase)
  username: z.string().optional(),
  passwordEnv: z.string().optional(),
  headerName: z.string().optional(),
  headerValueEnv: z.string().optional(),
});

export const HttpConnectorConfigSchema = z.object({
  baseUrl: z.string().url(),
  description: z.string().optional(),
  auth: HttpAuthSchema.optional(),
  openApiUrl: z.string().url().optional(),
  endpoints: z
    .array(
      z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
});

export const WebSearchConnectorConfigSchema = z.object({
  provider: z.enum(["tavily", "brave", "serper"]),
  apiKeyEnv: z.string().min(1),
  maxResults: z.number().int().positive().optional(),
});

export const MCPConnectorConfigSchema = z.object({
  transport: z.enum(["stdio", "sse"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Full connector entry schemas (type + id + name + config)
// ---------------------------------------------------------------------------

const ConnectorBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export const PostgresConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("postgres"),
  config: PostgresConnectorConfigSchema,
});

export const MySqlConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("mysql"),
  config: SqlConnectorConfigSchema,
});

export const MongoConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("mongo"),
  config: MongoConnectorConfigSchema,
});

export const HttpConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("http"),
  config: HttpConnectorConfigSchema,
});

export const WebSearchConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("websearch"),
  config: WebSearchConnectorConfigSchema,
});

/** Discriminated union used to parse connector entries from JSON config / DB. */
export const ConnectorConfigSchema = z.discriminatedUnion("type", [
  PostgresConnectorSchema,
  MySqlConnectorSchema,
  MongoConnectorSchema,
  HttpConnectorSchema,
  WebSearchConnectorSchema,
]);

// ---------------------------------------------------------------------------
// Skill config schema
// ---------------------------------------------------------------------------

export const SkillConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  connectorIds: z.array(z.string()).optional(),
  toolNames: z.array(z.string()).optional(),
  preferredTier: z.enum(["fast", "balanced", "premium"]).optional(),
  examples: z.array(z.object({ input: z.string(), output: z.string() })).optional(),
});

// ---------------------------------------------------------------------------
// Top-level app config schema (relay-e.config.json)
// ---------------------------------------------------------------------------

export const AppConfigSchema = z
  .object({
    connectors: z.array(ConnectorConfigSchema).default([]),
    skills: z.array(SkillConfigSchema).default([]),
  })
  .passthrough();

export type AppConfig = z.infer<typeof AppConfigSchema>;
