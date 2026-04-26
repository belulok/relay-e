# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Per-tenant API keys** — `POST /v1/api-keys`, `GET /v1/api-keys`,
  `DELETE /v1/api-keys/{id}`. Keys are prefixed `rle-`, SHA-256 hashed at
  rest, scoped per tenant. Raw value returned once on creation. `DEV_API_KEY`
  remains as a local-dev fallback resolved to an internal `dev-tenant`. New
  Drizzle migration: `api_keys` table with `key_hash` (unique), `key_prefix`,
  `name`, `revoked_at`, and `last_used_at`.
- **Message + usage persistence** (`apps/api/src/bootstrap/run-repo.ts`) —
  every agent turn now writes user message, assistant message, run record, and
  `usage_events` row to Postgres in parallel, fire-and-forget after the HTTP
  response. Sessions are upserted on first use via a deterministic UUID derived
  from SHA-256 of `relay-e:session:{tenantId}:{sessionKey}`.
- **Per-tenant monthly token quota** (`apps/api/src/middleware/quota.ts`) —
  `quotaMiddleware` runs before every message handler. Reads `token_quota_monthly`
  from the tenants table (cached 10 min), sums `usage_events` for the current
  month (cached 5 min), and returns `429` with a clear error message when
  `used >= limit`. Quota 0 = unlimited. Cache is evicted after each successful
  `persistTurn`.
- **Unified skills endpoint** — `GET /v1/skills`, `POST /v1/skills`,
  `DELETE /v1/skills/{id}` in a single route. Response includes `id` (null for
  global/boot-registered skills), `source` (`"global"` | `"tenant"`),
  `systemPrompt`, `toolNames`, and `connectorIds`. Replaces the split
  `/v1/skills` + `/v1/tenant-skills` pattern.
- **`SqlConnectorBase` abstract class** (`packages/engine/src/connectors/sql-base.ts`)
  — shared SQL safety layer, schema introspection with per-instance caching,
  `getPromptContext()` markdown formatter, and `query_{id}` tool generation.
  `PostgresConnector` and `MySQLConnector` each down to ~80 lines by extending it.
- **`packages/engine/src/constants.ts`** — single source for `SQL_DEFAULT_ROW_LIMIT`,
  `MONGO_DEFAULT_ROW_LIMIT`, `CONNECTOR_STATEMENT_TIMEOUT_MS`,
  `POSTGRES_MAX_CONNECTIONS`, `MYSQL_CONNECTION_LIMIT`, `TENANT_BUNDLE_TTL_MS`.
- **Single Zod schema source** (`packages/engine/src/connectors/schemas.ts`) —
  `AppConfigSchema` and all connector config schemas now live in the engine
  package; `apps/api/src/bootstrap/config.ts` imports from there instead of
  re-declaring. TypeScript types in `types.ts` use `z.infer<>` to eliminate
  drift.
- Integration tests for `connector-repo`, `skill-repo`, and `tenant-registry`
  (gated on `RELAY_E_TEST_DB=1`), covering upsert, cache hit/miss, invalidation,
  and round-trip config.
- Multi-stage `Dockerfile` for the API (Node 22 alpine, non-root, HTTP
  healthcheck; same image runs both API and queue worker via CMD override).
- `.github/workflows/release.yml` — tag-triggered release pipeline that builds
  an amd64 Docker image, pushes to `ghcr.io/belulok/relay-e` with semver +
  `latest` tags, and creates a GitHub Release with auto-generated notes.
- Vitest test suite — unit, integration, API, and database layers. 37+ tests
  pass in ~500ms. CI runs DB tests against a `pgvector/pgvector:pg16` service
  container.
- `npm run openapi:export` — writes the live spec to `docs/openapi.json`.
- `@relay-e/queue` — BullMQ queues with a separate worker process
  (`npm run worker`). Job processors are stubs pending `/v1/runs`.
- OpenRouter provider — single key for 100+ models; tier router falls back to
  OpenRouter when direct provider keys are absent.

### Changed

- Auth middleware (`apps/api/src/middleware/auth.ts`) — DB lookup first, then
  `DEV_API_KEY` fallback. `tenant.tenantId` is now always a real UUID (was
  previously the tenant name string in dev mode).
- `getTenantBundle` now accepts a UUID directly — no internal `resolveTenant`
  call; all routes use `c.get("tenant").tenantId` without re-resolving.
- CI now watches `master`.
- Ollama is behind `--profile local-llm` (not the default offline story).

## [0.0.1] - 2026-04-26

### Added

- Turborepo + npm workspaces monorepo (`apps/api` + 4 internal packages).
- `@relay-e/shared` — typed errors, structured logger, content blocks, ID
  generation, token / cost utilities.
- `@relay-e/db` — Drizzle schema covering tenants, users, sessions, messages,
  runs, skills, tools, connectors, documents (+ chunks with pgvector HNSW
  indexes), files, and usage events. Migration script via `drizzle-kit`.
- `@relay-e/providers` — provider abstraction with adapters for Anthropic,
  OpenAI, and Ollama via the Vercel AI SDK; pricing table; tier-based router.
- `@relay-e/engine` — Skill registry, Tool registry, Context Resolver
  (parallel fetch + token-budget trim), prompt builder, and the agent loop
  with usage accounting and a typed event emitter.
- `apps/api` — Hono server with auth, request-id, error handler, and
  introspection endpoints. SSE streaming on `POST /v1/sessions/{id}/messages`.
- OpenAPI 3.1 spec auto-generated from Zod schemas at `/openapi.json`,
  served as an interactive Scalar UI at `/docs`.
- Docker Compose stack for local-first dev (Postgres + pgvector, Redis,
  optional Ollama profile for fully offline LLM/embeddings).
- Example finance skill with three tools (`get_balance`, `analyze_spending`,
  `transfer_funds` with `requiresApproval` flag).

## [0.0.1] - 2026-04-26

### Added

- Turborepo + npm workspaces monorepo (`apps/api` + 4 internal packages).
- `@relay-e/shared` — typed errors, structured logger, content blocks, ID
  generation, token / cost utilities.
- `@relay-e/db` — Drizzle schema covering tenants, users, sessions, messages,
  runs, skills, tools, connectors, documents (+ chunks with pgvector HNSW
  indexes), files, and usage events. Migration script via `drizzle-kit`.
- `@relay-e/providers` — provider abstraction with adapters for Anthropic,
  OpenAI, and Ollama via the Vercel AI SDK; pricing table; tier-based router.
- `@relay-e/engine` — Skill registry, Tool registry, Context Resolver
  (parallel fetch + token-budget trim), prompt builder, and the agent loop
  with usage accounting and a typed event emitter.
- `apps/api` — Hono server with auth, request-id, error handler, and
  introspection endpoints. SSE streaming on `POST /v1/sessions/{id}/messages`.
- OpenAPI 3.1 spec auto-generated from Zod schemas at `/openapi.json`,
  served as an interactive Scalar UI at `/docs`.
- Docker Compose stack for local-first dev (Postgres + pgvector, Redis,
  optional Ollama profile for fully offline LLM/embeddings).
- Example finance skill with three tools (`get_balance`, `analyze_spending`,
  `transfer_funds` with `requiresApproval` flag).

[Unreleased]: https://github.com/belulok/relay-e/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/belulok/relay-e/releases/tag/v0.0.1
