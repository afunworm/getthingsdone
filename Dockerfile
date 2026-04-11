# ── Stage 1: Build Angular client ─────────────────────────────────────────────
FROM node:22-alpine AS client-build
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build -- --configuration production

# ── Stage 2: Build NestJS server ──────────────────────────────────────────────
FROM node:22-alpine AS server-build
WORKDIR /build/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS production
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Server production deps
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy built artifacts
COPY --from=server-build /build/server/dist ./server/dist
COPY --from=client-build /build/client/dist ./client/dist

# Copy migrations (needed at runtime)
COPY server/src/database/migrations ./server/dist/database/migrations

# Data and uploads volumes
RUN mkdir -p /app/server/data /app/server/uploads

# The server reads db from ./data/db.sqlite relative to cwd
WORKDIR /app/server

EXPOSE 3000

VOLUME ["/app/server/data", "/app/server/uploads"]

CMD ["node", "dist/main"]
