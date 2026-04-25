# syntax=docker/dockerfile:1.7
# Multi-stage build for the Relay-E API. The same image runs the worker too —
# override CMD with ["npm","run","worker"] (or use a worker-specific service).

# ---- deps stage: install all workspace deps with the lockfile ----
FROM node:22-alpine AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/providers/package.json packages/providers/
COPY packages/engine/package.json packages/engine/
COPY packages/queue/package.json packages/queue/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspaces --include-workspace-root

# ---- runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001

# Copy resolved deps + workspace symlinks from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy source. Tests, docs, and other dev cruft are excluded via .dockerignore.
COPY . .

# Run as a non-root user (image already ships with `node` user).
USER node

EXPOSE 3001

# Lightweight HTTP healthcheck — no curl/wget needed in alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.API_PORT||3001) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Default to the API. Override with `npm run worker` for the queue worker.
CMD ["npm", "start", "-w", "@relay-e/api"]
