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

CMD ["node", "server/index.js"]
