<p align="center">
  <img src="./docs/relay-e.png" alt="Relay-E" width="320" />
</p>

<h1 align="center">Relay-E</h1>

<p align="center">
  <em>Multi-tenant context-aware AI orchestration engine. Skills, tools, and a context resolver in front of any LLM — Anthropic, OpenAI, OpenRouter, or local Ollama.</em>
</p>

<p align="center">
  <a href="https://github.com/belulok/relay-e/actions/workflows/ci.yml"><img src="https://github.com/belulok/relay-e/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/belulok/relay-e/actions/workflows/release.yml"><img src="https://github.com/belulok/relay-e/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="https://github.com/belulok/relay-e/pkgs/container/relay-e"><img src="https://img.shields.io/badge/ghcr.io-relay--e-blue?logo=docker" alt="Container"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="./.nvmrc"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node"></a>
  <a href="./tsconfig.base.json"><img src="https://img.shields.io/badge/TypeScript-strict-3178C6.svg" alt="TypeScript"></a>
</p>

The engine sits between an LLM and a customer's data, dynamically pulling
relevant context before each turn and routing between "just respond" and
"trigger a multi-step agent." It runs fully locally for development
(Postgres + pgvector + Redis + Ollama) and ships the same image to
production.

## Features

- **Provider-agnostic LLM layer** — Anthropic / OpenAI / **OpenRouter** (single key for 100+ models) / Ollama (offline) via the Vercel AI SDK; tier-based router (`fast` / `balanced` / `premium`) picks the cheapest model that fits the task.
- **Skills + Tools registries** — composable units of behaviour. Tools have Zod-validated input schemas; tools that mutate state can be flagged `requiresApproval` for human-in-the-loop gating.
- **Context Resolver** — pluggable sources (vector search, profile lookups, MCP connectors) fetched in parallel and trimmed to a token budget.
- **Multi-tenant from day one** — `tenant_id` flows through every layer; Postgres schema is RLS-ready.
- **Auto-generated OpenAPI 3.1** — single source of truth is the Zod schema; `/openapi.json` and the Scalar `/docs` UI update on the next request when you add a route. No JSDoc, no codegen step.
- **SSE streaming** — typed event channel: `thinking`, `context_resolved`, `tool_call`, `tool_result`, `usage`, `text`, `done`.
- **Cost & token accounting** — every LLM call records tokens in/out, cache hits, and USD into `usage_events`.
- **Local-first dev** — `docker compose up -d` boots Postgres + Redis. Add `--profile local-llm` for an optional Ollama container if you want fully-offline LLMs; otherwise just set `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` and you're running.
- **Durable runs (BullMQ)** — long agent runs and background jobs (embedding, summarisation, scheduled triggers) run on a Redis-backed queue, not in the HTTP request path.

## Quick start

```bash
nvm use                                  # Node 22 (see .nvmrc)
npm install
cp .env.example .env

# Boot Postgres + pgvector + Redis (add Ollama with --profile local-llm)
npm run stack:up

# Apply the schema
npm run db:generate
npm run db:migrate

# Run the API
npm run dev
```

API listens on `http://localhost:3001`.

- **Interactive docs (Scalar)**: <http://localhost:3001/docs>
- **OpenAPI 3.1 spec**: <http://localhost:3001/openapi.json>
- **Health**: <http://localhost:3001/health>

In a second terminal, start the queue worker (it runs as its own process so HTTP stays snappy):

```bash
npm run worker
```

### Try it

```bash
# Discover available skills + tools
curl -s http://localhost:3001/v1/skills \
  -H "Authorization: Bearer $DEV_API_KEY"

# Sync chat
curl -s -X POST http://localhost:3001/v1/sessions/demo/messages \
  -H "Authorization: Bearer $DEV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"How much did I spend on food last month?","skills":["financial-advisor"]}'

# Stream chat (SSE)
curl -N -X POST http://localhost:3001/v1/sessions/demo/messages \
  -H "Authorization: Bearer $DEV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Show my balance and top spending categories.","skills":["financial-advisor"],"stream":true}'
```

### LLM provider options

You only need **one** of these to run end-to-end:

| Provider | Why pick it | `.env` |
|---|---|---|
| **OpenRouter** | One key, 100+ models (Anthropic, OpenAI, Llama, Mistral, …), unified billing | `OPENROUTER_API_KEY=sk-or-...` |
| **Anthropic** | Direct, lowest latency for Claude, supports prompt caching | `ANTHROPIC_API_KEY=sk-ant-...` |
| **OpenAI** | Direct, fallback / GPT-specific features | `OPENAI_API_KEY=sk-...` |
| **Ollama** (offline) | No cloud at all — pulls models locally | `OLLAMA_BASE_URL=http://localhost:11434` |

For Ollama-only mode:

```bash
docker compose --profile local-llm up -d
docker exec relay-e-ollama ollama pull llama3.2
```

## Architecture

```
Client ─► /v1/sessions/{id}/messages
            │
            ▼
   [auth + tenant + request_id]
            │
            ▼
   ┌─────────────────────────────┐
   │ Engine (packages/engine)    │
   │  - SkillRegistry            │
   │  - ToolRegistry             │
   │  - ContextResolver (║)      │   ║ = parallel
   │  - PromptBuilder + budget   │
   │  - Agent loop (max steps N) │
   └──────────┬──────────────────┘
              │
   ┌──────────▼──────────┐  ┌─────────────┐  ┌─────────────┐
   │ ProviderRegistry    │  │ Postgres    │  │ Redis       │
   │ Anthropic / OpenAI  │  │ + pgvector  │  │ cache/rate  │
   │ / Ollama            │  └─────────────┘  └─────────────┘
   └─────────────────────┘
```

## Project layout

```
apps/
  api/                Hono + OpenAPIHono server, /v1 endpoints, SSE streaming
packages/
  shared/             types, errors, logger, content blocks, ids, pricing
  db/                 Drizzle schema, migrations
  providers/          LLM provider abstraction + tier routing (Anthropic / OpenAI / OpenRouter / Ollama)
  engine/             skills, tools, context resolver, agent loop
  queue/              BullMQ queues + worker template (agent runs, embeddings)
docker/               postgres init scripts (vector, pg_trgm, uuid-ossp)
docker-compose.yml    local stack (Postgres+pgvector, Redis; Ollama behind --profile local-llm)
docs/                 README assets (logo, diagrams)
.github/workflows/    CI (typecheck on push/PR)
```

## Adding a new API route

1. Drop a file under `apps/api/src/routes/<name>.ts`:

   ```ts
   import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
   import { bearerAuth, errorResponses } from "../openapi/schemas.js";

   const route = createRoute({
     method: "get",
     path: "/v1/things",
     tags: ["Things"],
     security: bearerAuth,
     responses: {
       200: { description: "ok", content: { "application/json": { schema: z.object({ ok: z.boolean() }) } } },
       ...errorResponses,
     },
   });

   export const thingsRoutes = new OpenAPIHono().openapi(route, (c) => c.json({ ok: true }));
   ```

2. Register it in [`apps/api/src/routes/index.ts`](apps/api/src/routes/index.ts):

   ```ts
   { name: "things", basePath: "/", app: thingsRoutes, requiresAuth: true },
   ```

That's it — `/openapi.json` and `/docs` pick it up on the next request. The Zod schema is the single source of truth: validation, response typing, and OpenAPI shape all derive from it. **Do not** add JSDoc OpenAPI annotations on top — they drift, aren't type-checked, and duplicate the schema.

## Testing

Tests run on [Vitest](https://vitest.dev/) — native ESM, fast, Jest-compatible API.

```bash
npm test                # run all tests once
npm run test:watch      # watch mode
npm run test:cov        # coverage (text + html + lcov)
npm run test:db         # also run database tests (requires test DB up)
```

Layers:

| Layer | Where | What it covers |
|---|---|---|
| **Unit** | `packages/*/src/**/*.test.ts` | Pure functions: token math, errors, ids, registries, prompt builder. |
| **Integration** | `packages/engine/src/**/*.test.ts` | Context Resolver across multiple sources; agent loop with `MockLanguageModelV1` from `ai/test`. |
| **API** | `apps/api/src/**/*.test.ts` | Routes via `app.fetch(new Request(...))` — no port binding, no network. |
| **Database** | `packages/db/src/**/*.test.ts` | Real Postgres + transaction rollback per test. Auto-skipped unless `RELAY_E_TEST_DB=1` and a test DB is reachable. |

DB tests assume a separate test database. Quickest local setup:

```bash
docker exec relay-e-postgres psql -U postgres -c "CREATE DATABASE relay_e_test;"
DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/relay_e_test \
  npm run db:migrate
npm run test:db
```

## Postman / Bruno / Insomnia

The OpenAPI spec is auto-generated at `/openapi.json`, so importing into any HTTP client is a single click — no codegen, no export step.

**Postman**: `Import → Link → http://localhost:3001/openapi.json` → "Generate collection." Postman creates a collection with every endpoint, request body, and example. Re-import any time the API changes.

**Bruno / Insomnia / Hoppscotch**: same pattern — they all import OpenAPI 3 directly.

If you need an offline snapshot (CI artefact, sharing without running the server):

```bash
npm run dev                     # one terminal
npm run openapi:export          # other terminal — writes docs/openapi.json
```

## Versioning

Semantic Versioning ([SemVer 2.0](https://semver.org/spec/v2.0.0.html)):

- **Patch** `0.0.x` — bug fixes, internal changes that don't affect the public API.
- **Minor** `0.x.0` — backwards-compatible feature additions.
- **Major** `x.0.0` — breaking changes to the HTTP API, SDK surface, or persisted data shape.

While the project is pre-`1.0`, breaking changes may land in minor releases — they will always be called out in [`CHANGELOG.md`](./CHANGELOG.md) under a **BREAKING** entry.

All workspace packages stay in lockstep with the root version for now (single version across the monorepo). When the project graduates to `1.x` we'll likely move to [Changesets](https://github.com/changesets/changesets) for per-package versioning.

### Releasing

The release flow is automated. To cut a new version:

1. Move `[Unreleased]` items in [`CHANGELOG.md`](./CHANGELOG.md) to a dated `[X.Y.Z]` section.
2. Bump `version` in root [`package.json`](./package.json).
3. Commit: `git commit -am "chore: release vX.Y.Z"`.
4. Tag and push:
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin master --tags
   ```

The [`release.yml`](.github/workflows/release.yml) workflow then automatically:

- Builds a multi-arch (`amd64` + `arm64`) Docker image.
- Pushes it to **`ghcr.io/belulok/relay-e`** with tags `vX.Y.Z`, `X.Y`, `X.Y.Z`, and `latest`.
- Creates a [GitHub Release](https://github.com/belulok/relay-e/releases) on the tag with auto-generated notes from merged PRs since the previous tag.

Pre-release suffixes (`-rc`, `-alpha`, `-beta`) are detected and the release is marked as a pre-release automatically.

To roll back: `docker pull ghcr.io/belulok/relay-e:<previous-version>` and redeploy. Tags are immutable on ghcr.io, so older versions remain available indefinitely unless you delete them from the [Packages page](https://github.com/belulok/relay-e/pkgs/container/relay-e).

## Packages

What we publish, where, and on what cadence:

| Artefact | Where | When | How to consume |
|---|---|---|---|
| **`relay-e` Docker image** | [GitHub Container Registry](https://github.com/belulok/relay-e/pkgs/container/relay-e) (`ghcr.io/belulok/relay-e`) | On every `v*` tag | `docker pull ghcr.io/belulok/relay-e:latest` |
| **Workspace npm packages** (`@relay-e/shared`, `db`, `engine`, `providers`, `queue`) | Not published — `"private": true` | — | Source-only, internal to this repo |

### Running the published image

```bash
docker run --rm -p 3001:3001 \
  -e DEV_API_KEY=sk_dev_change_me \
  -e DATABASE_URL=postgres://postgres:postgres@host.docker.internal:5432/relay_e \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  ghcr.io/belulok/relay-e:latest
```

The same image runs the queue worker — override `CMD`:

```bash
docker run --rm \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  ghcr.io/belulok/relay-e:latest \
  npm run worker
```

### Why we don't publish workspace npm packages

The `@relay-e/*` packages are internal building blocks of the engine — not a public SDK. They share types and utilities across the monorepo and are versioned in lockstep with the root. Publishing them as separate npm packages would imply a public API surface we don't yet want to commit to.

When we ship a customer-facing SDK (`@relay-e/sdk-ts`, `@relay-e/sdk-py`), it'll go to the **public npm registry** with its own versioning and release notes — not GitHub Packages. Public npm gives broader reach and avoids forcing customers to authenticate with ghcr.io to install an SDK.

## Roadmap

- Wire `@relay-e/queue` BullMQ runs into `POST /v1/runs` (queued) alongside the existing sync `/messages` path
- Persist sessions / messages / usage_events to Postgres on every turn
- Memory compaction + embedding-based history retrieval
- HITL approval gating using the queue (pause runs at `requiresApproval` tools, resume on `/v1/runs/:id/approve`)
- MCP connector adapter (so customers plug in any data source)
- Multi-modal input pipeline (audio → transcript, files → chunked text)
- Eval harness (`npm run eval`) tracking quality / cost / latency per change
- TypeScript SDK (`packages/sdk-ts`) and Python SDK (`packages/sdk-py`)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs should pass `npm run typecheck` and update `CHANGELOG.md` for any user-visible change.

## License

[MIT](./LICENSE) © 2026 Sebastian Belulok
