# Contributing

Thanks for your interest. This project is in early development; the surface
is still moving and we're tightening conventions as we go.

## Local setup

```bash
nvm use                  # picks Node 22 from .nvmrc (or use Node ≥ 22)
npm install
cp .env.example .env
npm run stack:up         # Postgres + Redis (add --profile local-llm for Ollama)
npm run db:generate
npm run db:migrate
npm run dev              # Turbo runs apps/api in watch mode
```

Open the docs at http://localhost:3001/docs.

## Workflow

1. **Branch from `main`** with a descriptive name: `feat/<scope>`, `fix/<scope>`,
   or `chore/<scope>`.
2. **Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)**
   for commit messages: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`,
   `test:`, etc. The CHANGELOG draws from these.
3. **Run typecheck before pushing**: `npm run typecheck`.
4. **Open a PR** against `main` with:
   - A summary that explains *why* (not just *what*).
   - A short test plan (what you ran, what you saw).
   - Links to any related issues.

## Adding a new API route

See the "Adding a new API route" section of [README.md](./README.md). Routes
auto-publish to `/openapi.json` and `/docs` once registered — do not add JSDoc
OpenAPI annotations alongside the Zod schemas.

## Adding a new skill or tool

Edit [`apps/api/src/bootstrap/registries.ts`](apps/api/src/bootstrap/registries.ts):

- **Tools**: `tools.register(defineTool({ name, description, inputSchema, execute }))`.
  Use Zod for `inputSchema`; mark destructive tools with `requiresApproval: true`.
- **Skills**: `skills.register(defineSkill({ name, systemPrompt, toolNames, ... }))`.
  Pick a `preferredTier` (`fast` | `balanced` | `premium`) so the model router
  can choose appropriately.

## Versioning

We follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **Patch** (`0.0.x`) — bug fixes, internal changes that do not affect the
  public API or behaviour.
- **Minor** (`0.x.0`) — backwards-compatible feature additions.
- **Major** (`x.0.0`) — breaking changes to the public HTTP API, the SDK
  surface, or the persisted data shape.

While the project is pre-`1.0`, breaking changes may land in minor releases —
they will always be called out in [CHANGELOG.md](./CHANGELOG.md) under a
**BREAKING** entry.

## Releasing

1. Update `CHANGELOG.md`: move `[Unreleased]` items into a new dated
   `[x.y.z]` section.
2. Bump the version in the root `package.json` (the workspace packages stay
   in lockstep for now — single version across the monorepo).
3. Tag the commit: `git tag -a vX.Y.Z -m "vX.Y.Z"` and push tags.
4. Create a GitHub Release pointing at the tag with the changelog body.

When the project graduates from `0.x`, we'll likely move to
[Changesets](https://github.com/changesets/changesets) for per-package
versioning.

## License

By contributing, you agree that your contributions will be licensed under
the [MIT License](./LICENSE).
