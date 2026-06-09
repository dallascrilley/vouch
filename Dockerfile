# syntax=docker/dockerfile:1

# ---- builder: install all deps and compile TS -> JS ----
# node:sqlite (used for the local runtime) is available without a flag on
# Node 24, so the runtime image is pinned to the 24 line.
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build:js

# ---- runner: production deps + compiled output only ----
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    RUNTIME_SQLITE_PATH=/data/local-runtime.sqlite \
    PROVIDER_SQLITE_PATH=/data/provider-state.sqlite \
    RUNTIME_ARTIFACT_ROOT=/data/artifacts
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Writable data dir for the SQLite runtime + artifacts, owned by the non-root user.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
VOLUME ["/data"]

# Uses Node's global fetch (no curl in the slim image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# API server is the default. Run the worker with:
#   docker run --entrypoint node <image> dist/workers/index.js
CMD ["node", "dist/api/server.js"]
