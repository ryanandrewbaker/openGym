FROM node:22-alpine
WORKDIR /app
COPY api/package.json api/package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY api/server.js ./
COPY api/integrations ./integrations
COPY api/lib ./lib
COPY frontend/src/lib/exercises-data.js ./lib/exercises-data.js
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
