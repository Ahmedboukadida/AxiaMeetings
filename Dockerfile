# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# AxiaMeetings - production image (Next.js 16 + custom server.mjs + Socket.IO)
#
# Targets:
#   migrate  -> one-shot `prisma migrate deploy` (needs the Prisma schema engine)
#   runner   -> the app (default, last stage)
#
# Usage (see docker-compose.yml):
#   docker compose --env-file .env.docker up -d --build
#
# Secrets are NEVER passed as build args. Only public NEXT_PUBLIC_* values are
# build args, because Next.js inlines them into the browser bundle.
# ─────────────────────────────────────────────────────────────────────────────

ARG NODE_IMAGE=node:22-bookworm-slim

# ── base: OS packages shared by every stage ─────────────────────────────────
FROM ${NODE_IMAGE} AS base
# apt package versions follow the Debian bookworm base image.
# hadolint ignore=DL3008
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1

# ── deps: full dependency tree (install scripts ON so Prisma fetches engines) ─
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ── migrate: one-shot `prisma migrate deploy` ───────────────────────────────
# Slim on purpose: only the Prisma CLI (+ dotenv for prisma.config.js), at the exact
# versions pinned in package-lock.json — NOT the full 1.6 GB node_modules. Exporting
# the full tree for this one-shot image made every rebuild take an extra ~1 hour on
# Docker Desktop and could fail with "lease does not exist".
FROM base AS migrate
COPY package-lock.json /tmp/package-lock.json
RUN --mount=type=cache,target=/root/.npm \
    PRISMA_V="$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version")" \
 && DOTENV_V="$(node -p "require('/tmp/package-lock.json').packages['node_modules/dotenv'].version")" \
 && echo '{"name":"axiameetings-migrate","private":true}' > package.json \
 && npm install --no-audit --no-fund --no-package-lock "prisma@${PRISMA_V}" "dotenv@${DOTENV_V}" \
 && rm /tmp/package-lock.json
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.js ./prisma.config.js
# Fail the build early if the Prisma schema engine is missing.
RUN npx --no-install prisma --version
USER node
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# ── builder: prisma generate + next build, then drop dev dependencies ───────
FROM deps AS builder
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3002
ARG NEXT_PUBLIC_LIVEKIT_URL=
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_LIVEKIT_URL=${NEXT_PUBLIC_LIVEKIT_URL}
COPY . .
# DATABASE_URL / JWT_SECRET below are throwaway placeholders scoped to this RUN:
# modules read them at import time while Next collects page data. They are not
# persisted as ENV and real values are only provided at run time.
RUN --mount=type=cache,target=/app/.next/cache \
    DATABASE_URL="postgresql://b:b@localhost:5432/b" npx prisma generate \
 && DATABASE_URL="postgresql://b:b@localhost:5432/b" JWT_SECRET="build-time-placeholder" npx next build
RUN npm prune --omit=dev --no-audit --no-fund

# ── runner: minimal runtime image ───────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3002 \
    BIND_HOST=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    TZ=Africa/Tunis

# Upload volume mount point (owned by node so the named volume inherits it).
# Existing volumes keep their old owner: after copying files in, run
#   docker compose run --rm --user root --no-deps app chown -R node:node /data/uploads
RUN mkdir -p /data/uploads/meetings /data/uploads/pvs \
 && chown -R node:node /data

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/server.mjs ./server.mjs
COPY --from=builder /app/public ./public
# .next owned by node: Next writes its image/ISR cache under .next/cache at run time.
COPY --from=builder --chown=node:node /app/.next ./.next

RUN mkdir -p public/uploads/meetings public/uploads/pvs \
 && chown -R node:node public/uploads

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server.mjs"]
