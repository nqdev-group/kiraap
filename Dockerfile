# syntax=docker/dockerfile:1

# ---- deps: install production dependencies only ----
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime: minimal image with app code + prod deps ----
FROM node:18-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

# Ensure upload directories exist even if bind-mounted volumes are empty
RUN mkdir -p public/uploads/images public/uploads/videos public/uploads/audios public/uploads/temp \
    && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server/app.js"]
