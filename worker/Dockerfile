FROM node:22-bookworm-slim

# Native tooling for rendering + tiling.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     poppler-utils \
     libvips-tools \
     ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
# Default: Redis-free polling worker. For the legacy queue mode, override the
# command with: node src/index.js (and set REDIS_URL).
CMD ["node", "src/poll.js"]
