# Step 1: Build the Next.js app (dev dependencies and compilers stay in this stage)
FROM node:24-alpine AS builder

WORKDIR /app

# Build tooling for native addons (e.g. better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install dependencies (copied first for better layer caching)
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Step 2: Slim runtime image. `output: 'standalone'` gives us a server.js plus
# only the node_modules it traces as needed, so no dev tools and no compilers.
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=6767 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Persistent state (data) and the generated encryption key (secrets), mounted as volumes
RUN mkdir -p /app/data /app/secrets

EXPOSE 6767

CMD ["node", "server.js"]
