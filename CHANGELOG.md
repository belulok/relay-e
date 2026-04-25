# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Multi-stage `Dockerfile` for the API (Node 22 alpine, non-root, HTTP
  healthcheck, ~1 image runs both the API and the queue worker via
  CMD override).
- `.github/workflows/release.yml` — tag-triggered release pipeline that
  builds a multi-arch (`amd64` + `arm64`) image, pushes to
  `ghcr.io/belulok/relay-e` with semver + `latest` tags, and creates a
  GitHub Release with auto-generated notes.
- README sections covering the Releases flow and what we publish to
  GitHub Packages (the Docker image only — workspace npm packages stay
  `private`).
- Vitest test suite covering four layers: unit (`@relay-e/shared`,
  registries, prompt builder), integration (Context Resolver, agent loop
  with `MockLanguageModelV1` from `ai/test`), API (Hono routes via
  `app.fetch(new Request(...))` — no port binding), and database
  (transaction-rollback pattern, opt-in via `RELAY_E_TEST_DB=1`). Total
  37 tests pass in ~500ms.
- CI test job with a `pgvector/pgvector:pg16` service container so DB
  tests run on every PR.
- `npm run openapi:export` — writes the live spec to `docs/openapi.json`
  for offline Postman / Bruno / Insomnia imports.
- `@relay-e/queue` package — BullMQ queues (`agent-runs`, `embeddings`,
  `scheduled`) with a separate worker process (`npm run worker`). Job
  processors are stubs; deeper wiring with the agent loop lands with the
  `/v1/runs` endpoint.
- OpenRouter provider via the OpenAI-compatible base URL — single key for
  100+ models (Anthropic, OpenAI, Llama, Mistral, …). Tier router falls
  back to OpenRouter when Anthropic/OpenAI keys are absent.
- README hero image at `docs/relay-e.png` plus updated badges.

### Changed

- CI now watches `master` (matching the GitHub default branch).
- Ollama is no longer the default offline-LLM story in the docs — it stays
  available behind `docker compose --profile local-llm up -d` for anyone
  who wants fully-offline dev. The recommended cloud path is OpenRouter
  (single key) or Anthropic direct.

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
