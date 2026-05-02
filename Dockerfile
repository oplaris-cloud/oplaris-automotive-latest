# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────────────────
# Oplaris Automotive — production image (Dokploy)
#
# Multi-stage: deps → builder → runner. Runner carries only the Next.js
# standalone bundle (server.js + pruned node_modules) + public assets +
# static chunks. Runs as non-root uid 1001.
#
# Target size: < 300 MB. Expected layer count: ≤ 10.
# ──────────────────────────────────────────────────────────────────────────

# ─── Stage 1: deps ────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy just the lockfile + manifest so this layer caches on source-only
# edits. The legacy (non-BuildKit) Docker builder errors out when a
# `COPY .npmrc* ./` glob matches zero files, so we omit it — the repo
# has never shipped an `.npmrc`. If we ever need one (private registry,
# CI auth), add it as a tracked file and re-introduce the COPY without
# a glob.
COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
 && corepack prepare pnpm@10.33.0 --activate \
 && pnpm install --frozen-lockfile --prod=false

# ─── Stage 2: builder ─────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* are inlined into the client bundle at build time — Dokploy
# cannot override them at runtime. The deploy pipeline passes real values
# via `--build-arg`; defaults here keep local smoke-builds working. Never
# ship secrets through this channel (ARG values show up in `docker history`).
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_STATUS_URL=http://localhost:3000/status
ARG NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder-anon-key
ARG NEXT_PUBLIC_HCAPTCHA_SITE_KEY=10000000-ffff-ffff-ffff-000000000001

# Server-only placeholders — only needed so `serverEnv()`'s zod gate passes
# during prerender. Dokploy injects real values at runtime into the runner
# stage (fresh `FROM` below), which discards every ENV set here.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_STATUS_URL=$NEXT_PUBLIC_STATUS_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$NEXT_PUBLIC_HCAPTCHA_SITE_KEY \
    SUPABASE_SERVICE_ROLE_KEY=build-time-placeholder \
    SUPABASE_JWT_SECRET=build-time-placeholder \
    APPROVAL_HMAC_SECRET=build-time-placeholder-32-bytes-padding \
    STATUS_PHONE_PEPPER=build-time-placeholder-32-bytes-padding \
    KIOSK_PAIRING_SECRET=build-time-placeholder-32-bytes-padding \
    SUPER_ADMIN_COOKIE_SECRET=build-time-placeholder-64-bytes-padding-for-zod-nonempty-gate \
    SMTP_ENCRYPTION_KEY=build-time-placeholder-32-bytes-padding \
    STATUS_DEV_BYPASS_SMS=false

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable \
 && corepack prepare pnpm@10.33.0 --activate \
 && pnpm build

# ─── Stage 3: runner ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user — defence-in-depth in case of RCE + container escape.
RUN addgroup -S nodejs -g 1001 \
 && adduser  -S nextjs -u 1001 -G nodejs

# Bundle layout: public/ at /app/public, standalone server at /app/server.js,
# static chunks at /app/.next/static. Dokploy does not need the source tree
# or node_modules beyond what `.next/standalone` already carries.
COPY --from=builder --chown=nextjs:nodejs /app/public        ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static  ./.next/static

USER nextjs
EXPOSE 3000

# Probes /api/health every 30s. Fails fast on boot (20s grace).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
