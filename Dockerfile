# One image, two entrypoints. The API and the worker share every package in the
# workspace, so building them separately would build the same graph twice; which
# process runs is decided by the compose command, not by a second Dockerfile.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH

# Prisma's query engine links against OpenSSL and node:22-slim does not ship it.
# Without this Prisma warns that it cannot detect the libssl version, guesses
# openssl-1.1.x, and can fail to load the engine at runtime.
#
# Cache mounts keep the package lists out of the image layer, so no cleanup step
# is needed.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates

RUN corepack enable
WORKDIR /app

# ---- dependencies ---------------------------------------------------------
# Only manifests are copied here, so a source-only change does not re-resolve
# the dependency graph.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json      apps/api/
COPY apps/worker/package.json   apps/worker/
COPY apps/web/package.json      apps/web/
COPY packages/ai/package.json       packages/ai/
COPY packages/db/package.json       packages/db/
COPY packages/email/package.json    packages/email/
COPY packages/keypool/package.json  packages/keypool/
COPY packages/metrics/package.json  packages/metrics/
COPY packages/payment/package.json  packages/payment/
COPY packages/queue/package.json    packages/queue/
COPY packages/session/package.json  packages/session/
COPY packages/storage/package.json  packages/storage/
COPY packages/whatsapp/package.json packages/whatsapp/

# @autmn/db runs `prisma generate` on postinstall, so the schema has to be
# present before install rather than arriving with the rest of the source.
COPY packages/db/prisma packages/db/prisma

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------
FROM deps AS build
COPY . .
# The Prisma client is generated from the schema, so it must exist before any
# package that imports it is compiled.
RUN pnpm --filter @autmn/db generate && pnpm build

# ---- runtime --------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# Unprivileged: neither process needs root. node:22-slim already ships a `node`
# user, so no group juggling is needed.
COPY --from=build --chown=node:node /app /app
# Mount point for the local storage driver's shared volume, owned by the
# runtime user so the first write does not need root.
RUN mkdir -p /data/storage && chown node:node /data/storage
USER node

EXPOSE 3000

# Overridden by compose for the worker.
CMD ["node", "apps/api/dist/index.js"]
