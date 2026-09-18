FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY public ./public
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
    && python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir 'yt-dlp[default]' \
    && apt-get clean
ENV PATH="/opt/ytdlp/bin:${PATH}"
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/index.js"]
