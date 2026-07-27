# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

RUN npm ci --ignore-scripts

# Copy tsconfig and source code
COPY tsconfig.json ./
COPY src ./src

# Build the TypeScript project
RUN npm run build

# Prune devDependencies to keep only production dependencies
RUN npm prune --production --ignore-scripts

# ==========================================
# Stage 2: Production stage
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built application and node_modules from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Expose container port 8000 for OAuth authentication callback server
EXPOSE 8000

# Default entrypoint runs the stdio MCP server
CMD ["node", "dist/index.js"]
