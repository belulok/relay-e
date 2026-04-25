# Relay-E

> Multi-tenant context-aware AI orchestration engine. Skills, tools, and a context resolver in front of any LLM — Anthropic, OpenAI, or local Ollama.

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](./tsconfig.base.json)

The engine sits between an LLM and a customer's data, dynamically pulling
relevant context before each turn and routing between "just respond" and
"trigger a multi-step agent." It runs fully locally for development
(Postgres + pgvector + Redis + Ollama) and ships the same image to
production.

## Features

- **Provider-agnostic LLM layer** — Anthropic / OpenAI / Ollama via the Vercel AI SDK; tier-based router (`fast` / `balanced` / `premium`) picks the cheapest model that fits the task.
- **Skills + Tools registries** — composable units of behaviour. Tools have Zod-validated input schemas; tools that mutate state can be flagged `requiresApproval` for human-in-the-loop gating.
- **Context Resolver** — pluggable sources (vector search, profile lookups, MCP connectors) fetched in parallel and trimmed to a token budget.
- **Multi-tenant from day one** — `tenant_id` flows through every layer; Postgres schema is RLS-ready.
- **Auto-generated OpenAPI 3.1** — single source of truth is the Zod schema; `/openapi.json` and the Scalar `/docs` UI update on the next request when you add a route. No JSDoc, no codegen step.
- **SSE streaming** — typed event channel: `thinking`, `context_resolved`, `tool_call`, `tool_result`, `usage`, `text`, `done`.
- **Cost & token accounting** — every LLM call records tokens in/out, cache hits, and USD into `usage_events`.
- **Local-first dev** — `docker compose up -d` boots the entire stack; add `--profile local-llm` for an Ollama-only mode that needs zero API keys.

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

### Going fully offline (no cloud LLM)

```env
# .env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_PROVIDER=ollama
```

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
  providers/          LLM provider abstraction + tier routing
  engine/             skills, tools, context resolver, agent loop
docker/               postgres init scripts (vector, pg_trgm, uuid-ossp)
docker-compose.yml    local stack (Postgres+pgvector, Redis, Ollama profile)
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

## Versioning

Semantic Versioning ([SemVer 2.0](https://semver.org/spec/v2.0.0.html)):

- **Patch** `0.0.x` — bug fixes, internal changes that don't affect the public API.
- **Minor** `0.x.0` — backwards-compatible feature additions.
- **Major** `x.0.0` — breaking changes to the HTTP API, SDK surface, or persisted data shape.

While the project is pre-`1.0`, breaking changes may land in minor releases — they will always be called out in [`CHANGELOG.md`](./CHANGELOG.md) under a **BREAKING** entry.

All workspace packages stay in lockstep with the root version for now (single version across the monorepo). When the project graduates to `1.x` we'll likely move to [Changesets](https://github.com/changesets/changesets) for per-package versioning.

### Releasing

1. Move `[Unreleased]` items in `CHANGELOG.md` to a dated `[X.Y.Z]` section.
2. Bump the version in root `package.json`.
3. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push --tags`.
4. Create a GitHub Release on the tag with the changelog body.

## Roadmap

- Persist sessions / messages / usage_events to Postgres on every turn
- Memory compaction + embedding-based history retrieval
- Inngest for queued / long-running runs + HITL approval gating
- MCP connector adapter (so customers plug in any data source)
- Multi-modal input pipeline (audio → transcript, files → chunked text)
- Eval harness (`npm run eval`) tracking quality / cost / latency per change
- TypeScript SDK (`packages/sdk-ts`) and Python SDK (`packages/sdk-py`)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). PRs should pass `npm run typecheck` and update `CHANGELOG.md` for any user-visible change.

## License

[MIT](./LICENSE) © 2026 Sebastian Belulok
