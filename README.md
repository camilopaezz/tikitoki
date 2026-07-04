# tikitoki

A Telegram bot that downloads TikTok video posts and renders TikTok slideshow
posts as MP4 files, staying under Telegram's upload limits.

## What it does

- Paste a TikTok link in a chat with the bot.
- The bot fetches the post.
- **Video posts** are sent as-is.
- **Slideshow posts** are rendered into an MP4 with black letterboxing,
  even slide timing, and a short crossfade.
- The bot updates a placeholder message through `Fetching` → `Rendering`
  (slideshows only) → `Uploading`.

## Requirements

- Node.js 20+ (for local development)
- `ffmpeg` and `yt-dlp` installed (the Docker image includes both)
- A Telegram bot token from [@BotFather](https://t.me/botfather)

## Quick start with Docker Compose

1. Clone the repo.
2. Copy `.env.example` to `.env` and fill in `BOT_TOKEN`.
3. Run:

```bash
docker compose up -d --build
```

Example `docker-compose.yml`:

```yaml
services:
  tikitoki:
    build: .
    container_name: tikitoki
    restart: unless-stopped
    environment:
      - BOT_TOKEN=${BOT_TOKEN}                   # from @BotFather
      - TIKTOKI_COOKIES_PATH=/app/cookies/cookies.txt
      - OPERATOR_CHAT_ID=${OPERATOR_CHAT_ID:-}   # alerts on auth failures
      - CONCURRENCY=${CONCURRENCY:-2}
      - COOLDOWN_SECONDS=${COOLDOWN_SECONDS:-30}
      - HOURLY_CAP=${HOURLY_CAP:-60}
      - TARGET_SIZE_MB=${TARGET_SIZE_MB:-45}
      - CROSSFADE_SECONDS=${CROSSFADE_SECONDS:-0.4}
      - SILENT_SLIDE_SECONDS=${SILENT_SLIDE_SECONDS:-3}
    volumes:
      - ./data:/app/data
      - ./cookies:/app/cookies:ro    # optional, for authenticated TikTok access
```

Expected directory layout:

```
.
├── docker-compose.yml
├── .env
├── cookies/
│   └── cookies.txt      # Netscape-format cookies (optional)
└── data/                 # created at runtime
```

The bot starts polling Telegram. Send it a TikTok link to try it out.

## Cookies for private/restricted TikToks

TikTok aggressively blocks unauthenticated requests. For best results, export
cookies from a dedicated throwaway account:

1. Install a browser extension that exports Netscape-format `cookies.txt`
   (e.g., "Get cookies.txt LOCALLY").
2. Log in to TikTok in that browser.
3. Export cookies to `cookies/cookies.txt` in the project root.
4. Set `TIKTOKI_COOKIES_PATH=/app/cookies/cookies.txt` in `.env`.

Without cookies, the bot runs in public-only mode and may fail on many posts.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | yes | — | Telegram bot token |
| `TIKTOKI_COOKIES_PATH` | no | — | Path to `cookies.txt` inside the container |
| `OPERATOR_CHAT_ID` | no | — | Telegram chat ID to alert on auth failures |
| `CONCURRENCY` | no | 2 | Max simultaneous jobs |
| `COOLDOWN_SECONDS` | no | 30 | Per-user submission cooldown |
| `HOURLY_CAP` | no | 60 | Global jobs per hour |
| `TARGET_SIZE_MB` | no | 45 | Target output size (under Telegram's 50 MB cap) |
| `CROSSFADE_SECONDS` | no | 0.4 | Slide transition duration |
| `SILENT_SLIDE_SECONDS` | no | 3 | Slide duration when a slideshow has no audio |

## Development

```bash
npm install
npm run dev          # tsx src/index.ts
npm test             # unit tests
npm run test:integration  # CLI/network integration tests
npm run typecheck
npm run lint
```

## Troubleshooting

- **"Couldn't fetch that TikTok right now"** — Usually means TikTok served an
  auth challenge. If `OPERATOR_CHAT_ID` is set, the operator receives an alert.
  Re-export `cookies.txt` and restart the bot.
- **Video too large** — The passthrough MP4 exceeded `TARGET_SIZE_MB`. The bot
  does not re-encode video posts; try a lower-resolution TikTok share.
- **720p retry** — Very long slideshows at full resolution may be downscaled to
  720p to stay under the size cap. This is normal.

## License

MIT
