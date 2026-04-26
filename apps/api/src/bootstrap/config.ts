import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { logger } from "@relay-e/shared";

/**
 * Declarative config — loaded from `relay-e.config.json` at the repo root,
 * or from a path set in `RELAY_E_CONFIG`. This is the source of truth for
 * skills + connectors so customers do NOT need to fork the engine.
 *
 * Roadmap: same shape moves into Postgres so customers can manage skills
 * via API/UI instead of a JSON file.
 */

const ConnectorBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const PostgresConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("postgres"),
  config: z.object({
    url: z.string().min(1),
    description: z.string().optional(),
    readOnly: z.boolean().optional(),
    maxConnections: z.number().int().positive().optional(),
    schemas: z.array(z.string()).optional(),
    tableAllowlist: z.array(z.string()).optional(),
    rowLimit: z.number().int().positive().optional(),
  }),
});

const MySqlConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("mysql"),
  config: z.object({
    url: z.string().min(1),
    description: z.string().optional(),
    schemas: z.array(z.string()).optional(),
    tableAllowlist: z.array(z.string()).optional(),
    rowLimit: z.number().int().positive().optional(),
  }),
});

const MongoConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("mongo"),
  config: z.object({
    url: z.string().min(1),
    dbName: z.string().optional(),
    description: z.string().optional(),
    collectionAllowlist: z.array(z.string()).optional(),
    rowLimit: z.number().int().positive().optional(),
    sampleSize: z.number().int().positive().optional(),
  }),
});

const HttpConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("http"),
  config: z.object({
    baseUrl: z.string().url(),
    description: z.string().optional(),
    auth: z
      .object({
        type: z.enum(["bearer", "basic", "header", "none"]),
        tokenEnv: z.string().optional(),
        username: z.string().optional(),
        passwordEnv: z.string().optional(),
        headerName: z.string().optional(),
        headerValueEnv: z.string().optional(),
      })
      .optional(),
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
  }),
});

const WebSearchConnectorSchema = ConnectorBaseSchema.extend({
  type: z.literal("websearch"),
  config: z.object({
    provider: z.enum(["tavily", "brave", "serper"]),
    apiKeyEnv: z.string().min(1),
    maxResults: z.number().int().positive().optional(),
  }),
});

const ConnectorSchema = z.discriminatedUnion("type", [
  PostgresConnectorSchema,
  MySqlConnectorSchema,
  MongoConnectorSchema,
  HttpConnectorSchema,
  WebSearchConnectorSchema,
]);

const SkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  connectorIds: z.array(z.string()).optional(),
  toolNames: z.array(z.string()).optional(),
  preferredTier: z.enum(["fast", "balanced", "premium"]).optional(),
  examples: z
    .array(z.object({ input: z.string(), output: z.string() }))
    .optional(),
});

export const ConfigSchema = z
  .object({
    connectors: z.array(ConnectorSchema).default([]),
    skills: z.array(SkillSchema).default([]),
  })
  // Allow comments / unknown extras in the JSON without failing validation.
  .passthrough();

export type AppConfig = z.infer<typeof ConfigSchema>;

const DEFAULT_NAMES = ["relay-e.config.json", "relay-e.config.example.json"];

/**
 * Walk from `start` up to the filesystem root, collecting candidate config
 * paths at each level. This makes the loader robust to where the API was
 * launched from — workspaces leave us in `apps/api/`, but the config lives
 * at the repo root.
 */
function climbingCandidates(start: string, names: string[]): string[] {
  const out: string[] = [];
  let dir = start;
  while (true) {
    for (const n of names) out.push(resolve(dir, n));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return out;
}

/**
 * Load + validate the config. Searches cwd up to filesystem root for any of:
 *   - the path in $RELAY_E_CONFIG (relative paths resolved against cwd)
 *   - relay-e.config.json
 *   - relay-e.config.example.json
 *
 * Falls back to an empty config (with a warning) if nothing matches, so a
 * fresh checkout still boots and shows a helpful "no skills" state.
 */
export async function loadAppConfig(cwd = process.cwd()): Promise<AppConfig> {
  const explicit = process.env.RELAY_E_CONFIG;
  const candidates = explicit
    ? [resolve(cwd, explicit), ...climbingCandidates(cwd, DEFAULT_NAMES)]
    : climbingCandidates(cwd, DEFAULT_NAMES);

  for (const path of candidates) {
    try {
      const raw = await readFile(path, "utf8");
      // Strip our `_comment` keys (and any other `_` prefixed metadata) so
      // Zod's strict schema doesn't choke on them.
      const json = JSON.parse(raw);
      const stripped = stripUnderscoreKeys(json);
      const parsed = ConfigSchema.parse(stripped);
      logger.info(
        { configPath: path, connectors: parsed.connectors.length, skills: parsed.skills.length },
        "config_loaded",
      );
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }

  logger.warn("no_config_found — running with empty connectors + skills");
  return ConfigSchema.parse({ connectors: [], skills: [] });
}

function stripUnderscoreKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnderscoreKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith("_")) continue;
      out[k] = stripUnderscoreKeys(v);
    }
    return out;
  }
  return value;
}
