import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { logger } from "@relay-e/shared";
import { AppConfigSchema } from "@relay-e/engine";

export type { AppConfig } from "@relay-e/engine";

/**
 * Declarative config — loaded from `relay-e.config.json` at the repo root,
 * or from a path set in `RELAY_E_CONFIG`. Connector + skill Zod schemas live
 * in `@relay-e/engine` so this file is the single place that knows about the
 * filesystem; the engine package stays runtime-only.
 */

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
export async function loadAppConfig(cwd = process.cwd()) {
  const explicit = process.env.RELAY_E_CONFIG;
  const candidates = explicit
    ? [resolve(cwd, explicit), ...climbingCandidates(cwd, DEFAULT_NAMES)]
    : climbingCandidates(cwd, DEFAULT_NAMES);

  for (const path of candidates) {
    try {
      const raw = await readFile(path, "utf8");
      // Strip `_comment` keys (and any other `_` prefixed metadata) so
      // Zod's strict schema doesn't choke on them.
      const json = JSON.parse(raw);
      const stripped = stripUnderscoreKeys(json);
      const parsed = AppConfigSchema.parse(stripped);
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
  return AppConfigSchema.parse({ connectors: [], skills: [] });
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
