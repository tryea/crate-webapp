# syntax=docker/dockerfile:1.7

# --- deps stage: install with frozen lockfile ---------------------------
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- builder stage: produce Next.js standalone output ------------------
FROM oven/bun:1.3 AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next.config sets output: "standalone" — see config patch in same commit.
RUN bun run build

# --- runner stage: minimal runtime -------------------------------------
FROM oven/bun:1.3-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user. The bun base image ships one but call it out explicitly.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid 1001 --create-home nextjs

# Copy the standalone bundle (server.js + node_modules subset) + public + .next/static.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["bun", "server.js"]
