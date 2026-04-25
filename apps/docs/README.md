# Relay-E docs site

Built with [Fumadocs](https://fumadocs.dev) (Next.js 15 + Tailwind v4 + MDX).

## Local dev

```bash
# From the repo root
npm install
npm run dev -w @relay-e/docs
```

The site is at <http://localhost:3002>.

## Deploy to Vercel

1. **Vercel dashboard → Add New Project → Import** the `belulok/relay-e` repo.
2. **Configure → Root Directory** → set to `apps/docs`.
3. **Framework Preset** → Next.js (auto-detected).
4. **Build & Output**:
   - Install Command: `npm install` (default — Vercel handles npm workspaces from the repo root).
   - Build Command: `next build` (default).
   - Output Directory: `.next` (default).
5. **Environment Variables**: none required for the docs site itself.
6. **Deploy**.

After the first deploy, every push to `master` triggers a new production deploy; PRs get preview deploys.

## Adding a page

```bash
content/docs/your-section/your-page.mdx   # the page (MDX)
content/docs/your-section/meta.json       # sidebar order (if a new section)
```

The site rebuilds; the page appears in the sidebar.

## Components

Default Fumadocs MDX components are wired (`Cards`, `Card`, callouts, code blocks). For custom components, edit `app/docs/[[...slug]]/page.tsx` and pass them via the `components` prop.

## Search

Search is built-in via the `/api/search` route (`fumadocs-core/search`). It indexes all MDX content automatically.
