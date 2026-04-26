import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const EMBED_DIM = 1536;

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  apiKeyHashes: jsonb("api_key_hashes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  tokenQuotaMonthly: bigint("token_quota_monthly", { mode: "number" }).notNull().default(1_000_000),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_tenant_external_idx").on(t.tenantId, t.externalId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    skillIds: jsonb("skill_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    title: text("title"),
    summary: text("summary"),
    tokenCount: integer("token_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sessions_tenant_idx").on(t.tenantId, t.lastActiveAt.desc()),
    index("sessions_user_idx").on(t.userId, t.lastActiveAt.desc()),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: jsonb("content").$type<unknown[]>().notNull(),
    toolCalls: jsonb("tool_calls").$type<unknown[]>(),
    embedding: vector("embedding", { dimensions: EMBED_DIM }),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    model: text("model"),
    provider: text("provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("messages_session_idx").on(t.sessionId, t.createdAt),
    index("messages_tenant_idx").on(t.tenantId, t.createdAt.desc()),
    index("messages_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    steps: jsonb("steps").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    totalTokensIn: integer("total_tokens_in").notNull().default(0),
    totalTokensOut: integer("total_tokens_out").notNull().default(0),
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    error: jsonb("error").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("runs_tenant_idx").on(t.tenantId, t.createdAt.desc()),
    index("runs_status_idx").on(t.status, t.createdAt.desc()),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),
    toolIds: jsonb("tool_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    examples: jsonb("examples").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("skills_tenant_name_idx").on(t.tenantId, t.name)],
);

export const tools = pgTable(
  "tools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>().notNull(),
    connectorId: uuid("connector_id"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    rateLimit: jsonb("rate_limit").$type<Record<string, unknown>>(),
    handler: jsonb("handler").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("tools_tenant_name_idx").on(t.tenantId, t.name)],
);

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    credentialsRef: text("credentials_ref"),
    status: text("status").notNull().default("active"),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("connectors_tenant_idx").on(t.tenantId)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id"),
    uri: text("uri"),
    title: text("title"),
    contentType: text("content_type"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("documents_tenant_idx").on(t.tenantId, t.createdAt.desc())],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBED_DIM }),
    embeddingModel: text("embedding_model"),
    tokenCount: integer("token_count").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("chunks_tenant_idx").on(t.tenantId),
    index("chunks_document_idx").on(t.documentId),
    index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    storageUri: text("storage_uri").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    parsedContent: jsonb("parsed_content").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("uploaded"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("files_tenant_idx").on(t.tenantId, t.createdAt.desc())],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    sessionId: uuid("session_id"),
    eventType: text("event_type").notNull(),
    provider: text("provider"),
    model: text("model"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("usage_tenant_idx").on(t.tenantId, t.createdAt.desc()),
    index("usage_session_idx").on(t.sessionId, t.createdAt.desc()),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("default"),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_idx").on(t.keyHash),
    index("api_keys_tenant_idx").on(t.tenantId),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type Tool = typeof tools.$inferSelect;
export type Connector = typeof connectors.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type File = typeof files.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
