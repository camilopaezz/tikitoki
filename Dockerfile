FROM node:22-alpine AS build

# Install dependencies required to build (TypeScript lives in devDependencies).
WORKDIR /app
RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN pnpm xrender:fonts
RUN pnpm build

FROM node:22-alpine

# ffmpeg + yt-dlp deps; chromium for /xrender feed-card chrome screenshots.
# curl_cffi gives yt-dlp browser TLS impersonation (required for TikTok).
RUN apk add --no-cache \
    ffmpeg \
    ca-certificates \
    curl \
    python3 \
    py3-pip \
    py3-mutagen \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    font-noto-emoji \
    tini \
 && pip3 install --no-cache-dir --break-system-packages 'curl_cffi>=0.10,<0.16'

# Install the latest yt-dlp release into /usr/local/bin.
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/assets/fonts /app/assets/fonts
RUN chown -R node:node /app/assets

USER node

# Reap Chromium crashpad/zygotes if they outlive a timed-out screenshot.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
