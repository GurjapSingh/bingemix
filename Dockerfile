# Step 1: Build the Next.js app
FROM node:24-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Copy package files first (better for caching)
COPY package*.json ./

# Build tooling for native addons (e.g. better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install dependencies
RUN npm ci

# Copy the rest of the app
COPY . .

# Build the Next.js app
RUN npm run build

# Step 2: Run the app with a slim runtime image
FROM node:24-alpine AS runner

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production

# Persistent state directory (mounted via docker-compose volume)
RUN mkdir -p /app/data

# Expose the port
EXPOSE 6767

# Start Next.js
CMD ["sh", "-c", "npm start"]