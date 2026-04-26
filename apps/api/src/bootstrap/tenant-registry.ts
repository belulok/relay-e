import { ConnectorRegistry, SkillRegistry, defineSkill, TENANT_BUNDLE_TTL_MS } from "@relay-e/engine";
import type { Connector, ConnectorConfig, SkillDefinition } from "@relay-e/engine";
import { logger } from "@relay-e/shared";
import {
  listConnectorsForTenant,
  rowToConnectorConfig,
} from "./connector-repo.js";
import { listSkillsForTenant, rowToSkillDefinition } from "./skill-repo.js";
import { connectors as globalConnectors, skills as globalSkills } from "./registries.js";

interface TenantBundle {
  /** Connector instances scoped to this tenant — unions globals + tenant rows. */
  connectors: ConnectorRegistry;
  /** Skill registry — unions globals + tenant rows. */
  skills: SkillRegistry;
  /** Connectors created from DB rows; we own their lifecycle and dispose on eviction. */
  ownedConnectors: Connector[];
  /** ms timestamp; used by the cache TTL. */
  loadedAt: number;
}

const TTL_MS = Number(process.env.TENANT_REGISTRY_TTL_MS ?? TENANT_BUNDLE_TTL_MS);
const cache = new Map<string, TenantBundle>();

/**
 * Build (or return a cached) per-request connector + skill registry for the
 * given tenant.
 *
 * @param tenantId - The tenant's **UUID** (from TenantContext set by auth middleware).
 *
 * The result combines:
 *   1. **Global** connectors + skills loaded once at boot from
 *      `relay-e.config.json` (typically your built-in / shared resources).
 *   2. **Tenant-scoped** connectors + skills stored in Postgres and managed
 *      via `/v1/connectors` + `/v1/skills` CRUD endpoints — each customer
 *      registers their own DB / API / web search keys without forking.
 *
 * Cached for `TENANT_BUNDLE_TTL_MS` (default 60 s). Calling
 * `invalidateTenantBundle()` after a write forces a reload on the next request.
 */
export async function getTenantBundle(tenantId: string): Promise<TenantBundle> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached;

  // Evict the previous bundle's owned connectors before reloading.
  if (cached) await disposeBundle(cached);

  const connectorReg = new ConnectorRegistry();
  const skillReg = new SkillRegistry();
  const owned: Connector[] = [];

  // 1. Globals first — shared instances, no per-tenant lifetime.
  for (const s of globalSkills.list()) {
    try {
      skillReg.register(s);
    } catch {
      // name collision handled below when tenant skills are loaded
    }
  }

  // 2. Tenant rows.
  const connectorRows = await listConnectorsForTenant(tenantId);
  for (const row of connectorRows) {
    try {
      const cfg: ConnectorConfig = rowToConnectorConfig(row);
      const c = connectorReg.register(cfg);
      owned.push(c);
    } catch (err) {
      logger.error({ tenantId, connectorId: row.name, err }, "tenant_connector_load_failed");
    }
  }

  const skillRows = await listSkillsForTenant(tenantId);
  for (const row of skillRows) {
    try {
      const sd: SkillDefinition = rowToSkillDefinition(row);
      try {
        skillReg.register(defineSkill(sd));
      } catch {
        // Tenant skill overrides global with same name — re-register.
        logger.warn({ name: sd.name }, "tenant_skill_overrides_global");
      }
    } catch (err) {
      logger.error({ tenantId, skillName: row.name, err }, "tenant_skill_load_failed");
    }
  }

  const bundle: TenantBundle = {
    connectors: connectorReg,
    skills: skillReg,
    ownedConnectors: owned,
    loadedAt: Date.now(),
  };
  cache.set(tenantId, bundle);
  return bundle;
}

/**
 * Tools and prompt context are aggregated from BOTH the global registry
 * (system-wide, JSON-config-loaded) and the per-tenant registry (DB rows).
 *
 * Use these helpers from the agent loop instead of calling either registry
 * directly — they hide the union and dedupe overlapping connector ids
 * (tenant wins).
 */
export async function aggregatedToolsFor(
  bundle: TenantBundle,
  ids: string[],
): ReturnType<ConnectorRegistry["toolsFor"]> {
  const tenantTools = await bundle.connectors.toolsFor(ids);
  const tenantIds = new Set(bundle.connectors.list().map((c) => c.id));
  const globalIdsToFetch = ids.filter((i) => !tenantIds.has(i));
  const globalTools = await globalConnectors.toolsFor(globalIdsToFetch);
  return [...tenantTools, ...globalTools];
}

export async function aggregatedPromptContextFor(
  bundle: TenantBundle,
  ids: string[],
): Promise<string> {
  const tenantPart = await bundle.connectors.promptContextFor(ids);
  const tenantIds = new Set(bundle.connectors.list().map((c) => c.id));
  const globalIdsToFetch = ids.filter((i) => !tenantIds.has(i));
  const globalPart = await globalConnectors.promptContextFor(globalIdsToFetch);
  return [tenantPart, globalPart].filter(Boolean).join("\n\n---\n\n");
}

/**
 * Build a `ConnectorSource` adapter the agent loop can use directly. Hides
 * the global+tenant union behind the same two-method surface the engine expects.
 */
export function tenantConnectorSource(bundle: TenantBundle) {
  return {
    toolsFor: (ids: string[]) => aggregatedToolsFor(bundle, ids),
    promptContextFor: (ids: string[]) => aggregatedPromptContextFor(bundle, ids),
  };
}

export async function invalidateTenantBundle(tenantId: string): Promise<void> {
  const cached = cache.get(tenantId);
  if (cached) {
    cache.delete(tenantId);
    await disposeBundle(cached);
  }
}

async function disposeBundle(b: TenantBundle): Promise<void> {
  await Promise.all(b.ownedConnectors.map((c) => c.dispose().catch(() => {})));
}
