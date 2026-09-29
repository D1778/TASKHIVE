FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first so this layer is cached between code changes.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src

# Run as the unprivileged "node" user; /app/logs is mounted as a named volume.
RUN mkdir -p /app/logs && chown -R node:node /app
USER node

EXPOSE 5000
CMD ["node", "src/server.js"]
