# tikitoki

**Paste a TikTok, Instagram, or X link in Telegram — get a clean MP4 back.**

No watermarks to hunt for, no “open in browser” detours. Send the bot a post URL and it downloads or renders the media so you can save it, forward it, or share it elsewhere.

---

## Features

| Platform | What you can do |
|----------|------------------|
| **TikTok** | Download videos · turn photo slideshows into MP4s |
| **Instagram** | Download reels · turn photo carousels into MP4 slideshows |
| **X (Twitter)** | Download the video **or** render a dark feed-card clip of the post |

### TikTok
- **Videos** — full post video as an MP4
- **Photo slideshows** — stitched into one video with even timing and a short crossfade

### Instagram
- **Reels** — downloaded as MP4
- **Photo carousels** — rendered as an MP4 slideshow (same idea as TikTok slides)
- Mixed photo+video carousels and single images are not supported (the bot tells you clearly)

### X / Twitter
Paste an X link and pick what you want (no commands):

- **Download video** — raw post video as MP4
- **Render post** — feed-style card (avatar, name, text) with the video playing in the media area

---

## Self-hosting

Run your own instance with Docker Compose.

### Requirements
- Docker + Docker Compose
- A bot token from [@BotFather](https://t.me/botfather)
- Optional: Netscape-format cookies for better access to restricted posts
- Chromium is included in the image (needed for X feed-card render)

### Quick start

1. Clone the repo.
2. Copy `.env.example` to `.env` and set `BOT_TOKEN`.
3. Start:

```bash
docker compose up -d --build
```

Pre-built images are published to [GHCR](https://github.com/camilopaezz/tikitoki/pkgs/container/tikitoki). Point compose at a tag instead of `build: .` when you want to pull rather than build locally:

| Tag | When |
|-----|------|
| `latest` | every push to `main` |
| `<sha>` | every image build |
| `pr-<number>` | every pull request (same-repo) |

```yaml
services:
  tikitoki:
    image: ghcr.io/camilopaezz/tikitoki:pr-12
```

Suggested layout:

```
.
├── docker-compose.yml
├── .env
└── cookies/                 # optional
    ├── cookies.txt          # TikTok
    ├── instagram.txt
    └── twitter.txt
```

Example `docker-compose.yml` environment:

```yaml
services:
  tikitoki:
    build: .
    container_name: tikitoki
    restart: unless-stopped
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - TIKTOKI_COOKIES_PATH=/app/cookies/cookies.txt
      - INSTAGRAM_COOKIES_PATH=/app/cookies/instagram.txt
      - TWITTER_COOKIES_PATH=/app/cookies/twitter.txt
      - OPERATOR_CHAT_ID=${OPERATOR_CHAT_ID:-}
      - CONCURRENCY=${CONCURRENCY:-2}
      - COOLDOWN_SECONDS=${COOLDOWN_SECONDS:-30}
      - HOURLY_CAP=${HOURLY_CAP:-60}
      - TARGET_SIZE_MB=${TARGET_SIZE_MB:-45}
      - CROSSFADE_SECONDS=${CROSSFADE_SECONDS:-0.4}
      - SILENT_SLIDE_SECONDS=${SILENT_SLIDE_SECONDS:-3}
    volumes:
      - ./cookies:/app/cookies:ro
```

### Cookies (optional but recommended)

Platforms often block anonymous downloads. Export Netscape `cookies.txt` from a browser (e.g. “Get cookies.txt LOCALLY”) while logged into a throwaway account:

| Platform | File | Env var |
|----------|------|---------|
| TikTok | `cookies/cookies.txt` | `TIKTOKI_COOKIES_PATH` |
| Instagram | `cookies/instagram.txt` | `INSTAGRAM_COOKIES_PATH` |
| X | `cookies/twitter.txt` | `TWITTER_COOKIES_PATH` |

Without cookies the bot still works for many public posts, but more links will fail.

## Development

```bash
pnpm install   # or npm install
pnpm dev       # local bot (needs .env)
pnpm test
pnpm run test:integration
pnpm typecheck
pnpm lint
```

Needs Node 20+, `ffmpeg`, `yt-dlp`, and Chromium/Chrome for X feed-card renders.

---

## Troubleshooting

| Message / issue | What to try |
|-----------------|-------------|
| “Couldn’t fetch that post right now” | Auth challenge — refresh platform cookies and restart |
| Mixed photos + videos (Instagram) | Use a photo-only carousel or a reel |
| Single images not supported | Send a carousel or reel instead |
| Video too large | Source is over `TARGET_SIZE_MB`; try another share/quality |
| Long slideshows look 720p | Automatic downscale to stay under size limits — expected |

---

## Thanks

This project relies on:

- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** — downloading video from TikTok, Instagram, and X
- **[FFmpeg](https://ffmpeg.org/)** — slideshows, feed-card composites, and encoding

Huge thanks to the maintainers and contributors of both.

---

## License

MIT
