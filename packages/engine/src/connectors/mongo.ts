import { z } from "zod";
import { errors } from "@relay-e/shared";
import { defineTool, type AnyToolDefinition } from "../tools/index.js";
import { resolveEnvString } from "./env.js";
import type { Connector } from "./types.js";

// `mongodb` is an OPTIONAL peer dep — install on demand. Local aliases keep
// this file typecheckable without forcing the install.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MongoClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MongoDb = any;

export interface MongoConnectorConfig {
  url: string;
  dbName?: string;       // overrides the DB name parsed from the URL
  description?: string;
  collectionAllowlist?: string[];
  rowLimit?: number;     // hard cap on returned docs (default 100)
  sampleSize?: number;   // # of docs to sample per collection for schema inference (default 5)
}

interface InferredCollection {
  name: string;
  fieldShape: { path: string; types: string[] }[];
  count?: number;
}

/**
 * MongoDB connector. Mongo doesn't have an `information_schema`, so the
 * "schema" the LLM sees is inferred by sampling N docs per collection and
 * coalescing the observed field paths and BSON types. It's a best-effort
 * sketch, not a guarantee — but it's enough for the model to write sane
 * filters without inventing field names.
 *
 * Exposes one tool: `query_<id>` that runs `collection.find(filter, ...)` —
 * read-only by construction (no `update*` / `delete*` paths). For richer
 * pipelines we'd add a separate `aggregate_<id>` tool with a `$out`/`$merge`
 * blocker; keeping v1 to plain find keeps the safety story tight.
 */
export class MongoConnector implements Connector {
  readonly type = "mongo" as const;
  readonly id: string;
  readonly name: string;
  readonly description?: string;

  private readonly cfg: MongoConnectorConfig;
  private client?: MongoClient;
  private db?: MongoDb;
  private schemaCache?: InferredCollection[];

  constructor(id: string, name: string, cfg: MongoConnectorConfig) {
    this.id = id;
    this.name = name;
    this.description = cfg.description;
    this.cfg = cfg;

    if (!resolveEnvString(cfg.url)) {
      throw errors.invalidRequest(
        "connector_misconfigured",
        `Mongo connector "${id}" has no resolvable URL`,
      );
    }
  }

  private async getDb(): Promise<MongoDb> {
    if (this.db) return this.db;
    let mod: { MongoClient: new (url: string) => MongoClient };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mod = (await import("mongodb" as any)) as typeof mod;
    } catch {
      throw errors.invalidRequest(
        "connector_dependency_missing",
        `Mongo connector requires the 'mongodb' package. Install with:\n  npm install mongodb -w @relay-e/engine`,
      );
    }
    this.client = new mod.MongoClient(resolveEnvString(this.cfg.url)!);
    await this.client.connect();
    // dbName from config wins; fall back to whatever the URL specifies; final fallback "test".
    this.db = this.client.db(this.cfg.dbName);
    return this.db;
  }

  private async getSchema(): Promise<InferredCollection[]> {
    if (this.schemaCache) return this.schemaCache;
    const db = await this.getDb();
    const sampleSize = this.cfg.sampleSize ?? 5;
    const allowlist = this.cfg.collectionAllowlist;

    const collections = (await db.listCollections({}, { nameOnly: true }).toArray()) as Array<{ name: string }>;

    const out: InferredCollection[] = [];
    for (const { name } of collections) {
      if (allowlist && !allowlist.includes(name)) continue;
      // System collections are noise.
      if (name.startsWith("system.")) continue;

      try {
        const docs = await db
          .collection(name)
          .aggregate([{ $sample: { size: sampleSize } }])
          .toArray();
        const fieldShape = inferShape(docs as Record<string, unknown>[]);
        out.push({ name, fieldShape });
      } catch {
        out.push({ name, fieldShape: [] });
      }
    }
    this.schemaCache = out;
    return out;
  }

  async getPromptContext(): Promise<string> {
    let schema: InferredCollection[] = [];
    try {
      schema = await this.getSchema();
    } catch (err) {
      return [
        `### Mongo connector: \`${this.id}\` (${this.name})`,
        `> Schema introspection failed: ${(err as Error).message}`,
      ].join("\n\n");
    }

    const collectionList = schema
      .map((c) => {
        if (c.fieldShape.length === 0) {
          return `  - \`${c.name}\` _(empty sample)_`;
        }
        const fields = c.fieldShape
          .slice(0, 30)
          .map((f) => `${f.path}: ${f.types.join("|")}`)
          .join(", ");
        return `  - \`${c.name}\` { ${fields} }`;
      })
      .join("\n");

    return [
      `### Mongo connector: \`${this.id}\` (${this.name})`,
      this.description ? `_${this.description}_` : "",
      `Collections (schema inferred from sampled documents — fields not listed may still exist). Use \`query_${this.id}\`:`,
      collectionList || "  _(no collections visible)_",
      `**Hard rules**: read-only \`find\` only — no aggregation, no write ops. ` +
        `Limit auto-injected at ${this.cfg.rowLimit ?? 100} docs.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async tools(): Promise<AnyToolDefinition[]> {
    const rowLimit = this.cfg.rowLimit ?? 100;
    return [
      defineTool({
        name: `query_${this.id}`,
        description:
          `Run a read-only \`find\` against the "${this.name}" Mongo database. ` +
          (this.description ? `${this.description} ` : "") +
          `Returns up to ${rowLimit} documents.`,
        inputSchema: z.object({
          collection: z.string().min(1).describe("Collection name."),
          filter: z
            .record(z.unknown())
            .optional()
            .describe(
              "Mongo find filter (the same shape you'd pass to db.collection.find()).",
            ),
          projection: z
            .record(z.union([z.literal(0), z.literal(1)]))
            .optional()
            .describe('Projection: { field: 1 } to include, { field: 0 } to exclude.'),
          sort: z
            .record(z.union([z.literal(1), z.literal(-1)]))
            .optional()
            .describe('Sort: { field: 1 } asc, { field: -1 } desc.'),
          limit: z.number().int().positive().max(1000).optional(),
        }),
        execute: async ({ collection, filter, projection, sort, limit }, ctx) => {
          if (this.cfg.collectionAllowlist && !this.cfg.collectionAllowlist.includes(collection)) {
            return { error: `collection_not_allowed:${collection}` };
          }
          if (filter && containsForbiddenOperator(filter)) {
            return { error: "forbidden_operator: $where / $function / $accumulator are blocked" };
          }
          const cap = Math.min(limit ?? rowLimit, rowLimit);
          ctx.logger.info(
            { connector: this.id, collection, filter, limit: cap },
            "mongo_query",
          );
          try {
            const db = await this.getDb();
            const cursor = db.collection(collection).find(filter ?? {});
            if (projection) cursor.project(projection);
            if (sort) cursor.sort(sort);
            cursor.limit(cap);
            const docs = await cursor.toArray();
            return { count: docs.length, docs };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      }),
    ];
  }

  async dispose(): Promise<void> {
    await this.client?.close().catch(() => {});
  }
}

/**
 * Walk sample documents and produce a list of `{ path, types[] }` describing
 * the observed shape. Top-level only for v1 — nested objects show up as
 * `parent` with type `object`. We can deepen this later with field-of-field
 * sampling if needed.
 */
function inferShape(docs: Record<string, unknown>[]): { path: string; types: string[] }[] {
  const map = new Map<string, Set<string>>();
  for (const doc of docs) {
    for (const [k, v] of Object.entries(doc)) {
      const t = bsonTypeOf(v);
      if (!map.has(k)) map.set(k, new Set());
      map.get(k)!.add(t);
    }
  }
  return [...map.entries()].map(([path, types]) => ({
    path,
    types: [...types].sort(),
  }));
}

function bsonTypeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof Date) return "date";
  if (typeof v === "object") {
    // ObjectId from `mongodb` driver has _bsontype === "ObjectId" — duck-type
    const candidate = v as { _bsontype?: unknown };
    if (typeof candidate._bsontype === "string") return candidate._bsontype.toLowerCase();
    return "object";
  }
  return typeof v;
}

const FORBIDDEN_OPERATORS = ["$where", "$function", "$accumulator"];

function containsForbiddenOperator(value: unknown): boolean {
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_OPERATORS.includes(k)) return true;
      if (containsForbiddenOperator(v)) return true;
    }
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenOperator);
  }
  return false;
}
