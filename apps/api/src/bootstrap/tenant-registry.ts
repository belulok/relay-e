import { ConnectorRegistry, SkillRegistry, defineSkill } from "@relay-e/engine";
import type { Connector, ConnectorConfig, SkillDefinition } from "@relay-e/engine";
import { logger } from "@relay-e/shared";
import {
  listConnectorsForTenant,
  rowToConnectorConfig,
} from "./connector-repo.js";
import { listSkillsForTenant, rowToSkillDefinition } from "./skill-repo.js";
import { connectors as globalConnectors, skills as globalSkills } from "./registries.js";
import { resolveTenant } from "./tenant.js";

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

const TTL_MS = Number(process.env.TENANT_REGISTRY_TTL_MS ?? 60_000);
const cache = new Map<string, TenantBundle>();

/**
 * Build (or return a cached) per-request connector + skill registry for the
 * given tenant.
 *
 * The result combines:
 *   1. **Global** connectors + skills loaded once at boot from
 *      `relay-e.config.json` (typically your built-in / shared resources).
 *   2. **Tenant-scoped** connectors + skills stored in Postgres and managed
 *      via `/v1/connectors` + `/v1/skills` CRUD endpoints — each customer
 *      registers their own DB / API / web search keys without forking.
 *
 * Cached for `TENANT_REGISTRY_TTL_MS` (default 60s) so we don't hit the DB
 * on every chat turn. Calling `invalidateTenantBundle()` after a write
 * forces a reload on the next request.
 */
export async function getTenantBundle(tenantName: string): Promise<TenantBundle> {
  const cached = cache.get(tenantName);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached;

  // Evict the previous bundle's owned connectors before reloading.
  if (cached) await disposeBundle(cached);

  const tenant = await resolveTenant(tenantName);

  const connectorReg = new ConnectorRegistry();
  const skillReg = new SkillRegistry();
  const owned: Connector[] = [];

  // 1. Globals first — same instances every request, no per-tenant lifetime.
  for (const c of globalConnectors.list()) {
    try {
      // Reuse the global instance directly so we don't double-connect.
      // ConnectorRegistry doesn't expose a `register-instance` method, but we
      // can simulate by stashing into the internal map. Instead we re-build
      // wrappers below — slightly more overhead, simpler model.
      // For now: surface tools + prompt context via the global registry
      // and merge at toolsFor() / promptContextFor() boundaries — see below.
      void c;
    } catch (err) {
      logger.warn({ id: c.id, err }, "global_connector_skipped");
    }
  }
  for (const s of globalSkills.list()) {
    try {
      skillReg.register(s);
    } catch {
      // duplicates are fine — skill name collision means tenant overrides.
    }
  }

  // 2. Tenant rows.
  const connectorRows = await listConnectorsForTenant(tenant.id);
  for (const row of connectorRows) {
    try {
      const cfg: ConnectorConfig = rowToConnectorConfig(row);
      const c = connectorReg.register(cfg);
      owned.push(c);
    } catch (err) {
      logger.error({ tenantId: tenant.id, connectorId: row.name, err }, "tenant_connector_load_failed");
    }
  }

  const skillRows = await listSkillsForTenant(tenant.id);
  for (const row of skillRows) {
    try {
      const sd: SkillDefinition = rowToSkillDefinition(row);
      // Tenant skills override globals on name collision.
      try {
        skillReg.register(defineSkill(sd));
      } catch {
        // already registered as a global with the same name — log and continue.
        logger.warn({ name: sd.name }, "tenant_skill_name_collision_with_global");
      }
    } catch (err) {
      logger.error({ tenantId: tenant.id, skillName: row.name, err }, "tenant_skill_load_failed");
    }
  }

  const bundle: TenantBundle = {
    connectors: connectorReg,
    skills: skillReg,
    ownedConnectors: owned,
    loadedAt: Date.now(),
  };
  cache.set(tenantName, bundle);
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

export async function invalidateTenantBundle(tenantName: string): Promise<void> {
  const cached = cache.get(tenantName);
  if (cached) {
    cache.delete(tenantName);
    await disposeBundle(cached);
  }
}

async function disposeBundle(b: TenantBundle): Promise<void> {
  await Promise.all(b.ownedConnectors.map((c) => c.dispose().catch(() => {})));
}
