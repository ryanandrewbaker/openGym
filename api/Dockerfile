FROM node:24.22.1-alpine
WORKDIR /app
COPY api/package.json api/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY api/server.js ./
COPY api/integrations ./integrations
COPY api/lib ./lib
COPY frontend/src/lib/exercises-data.js ./lib/exercises-data.js
COPY frontend/src/lib/equipment-core.js ./lib/equipment-core.js
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
