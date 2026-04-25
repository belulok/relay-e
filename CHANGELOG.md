# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/OWNER/REPO/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/OWNER/REPO/releases/tag/v0.0.1
