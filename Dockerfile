FROM node:22-alpine AS build

# Install dependencies required to build (TypeScript lives in devDependencies).
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm xrender:fonts \
 && pnpm build \
 && pnpm prune --prod \
 && rm -rf /root/.cache /root/.local

FROM node:22-alpine

# ffmpeg + yt-dlp; chromium-headless-shell for /xrender feed-card screenshots.
# curl_cffi gives yt-dlp browser TLS impersonation (required for TikTok).
# Alpine Chromium pulls LLVM+Mesa (~220MB) for GPU; we screenshot with SwiftShader.
RUN apk add --no-cache \
    ffmpeg \
    ca-certificates \
    curl \
    python3 \
    py3-pip \
    py3-mutagen \
    chromium-headless-shell \
    chromium-swiftshader \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    font-noto-emoji \
    tini \
 && pip3 install --no-cache-dir --break-system-packages --root-user-action=ignore 'curl_cffi>=0.10,<0.16' \
 && apk del --no-network py3-pip \
 && find /usr/lib/python3* -type d -name '__pycache__' -prune -exec rm -rf {} + \
 && rm -f /usr/lib/libLLVM.so.* /usr/lib/libLLVM-*.so /usr/lib/libgallium*.so \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /usr/local/lib/node_modules/npm /opt/yarn* \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg \
           /usr/local/bin/npm /usr/local/bin/npx \
 && rm -rf /root/.cache /tmp/*

WORKDIR /app

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets/fonts /app/assets/fonts
RUN chown -R node:node /app/assets

USER node

ENV PYTHONDONTWRITEBYTECODE=1

# Reap Chromium crashpad/zygotes if they outlive a timed-out screenshot.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
