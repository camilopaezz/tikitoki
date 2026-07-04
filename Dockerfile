FROM node:22-alpine

# Install ffmpeg and dependencies required by yt-dlp.
RUN apk add --no-cache ffmpeg ca-certificates curl python3 py3-mutagen

# Install the latest yt-dlp release into /usr/local/bin.
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

RUN corepack enable pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY dist ./dist

USER node

CMD ["node", "dist/index.js"]
