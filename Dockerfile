FROM node:22-alpine
WORKDIR /app

# curl is used by the Ultimate Guitar source provider (see server/sources).
RUN apk add --no-cache curl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV OPENTABS_DB=/data/opentabs.db
VOLUME /data
EXPOSE 3000

# Fails the container if the process is up but the database is unreachable,
# which is what a missing /data volume mount looks like from outside.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["node", "server/index.js"]
