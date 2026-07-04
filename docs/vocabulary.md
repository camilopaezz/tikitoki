# Vocabulary

Shared terms used across the tikitoki codebase, docs, and conversations.
Use these exact words in code identifiers, log messages, and commit messages
so searchability stays one-to-one.

## TikTok domain

- **TikTok post** — any shareable item on TikTok. Has a unique URL and an
  `id`. Two kinds matter to us: *video posts* and *slideshow posts*.
- **Video post** — a TikTok that is already a single encoded video file.
  We handle it via *passthrough*: yt-dlp downloads the MP4, we send it as-is.
- **Slideshow post** (a.k.a. **image post**, **photo post**) — a TikTok made
  of an ordered list of images plus one background audio track. TikTok plays
  it as a timed image sequence; the platform does **not** ship a real video
  file for these. This project's reason for existing.
- **Slide** — a single image inside a slideshow, with a position (0-indexed)
  in the sequence.
- **ImagePost** — TikTok's internal metadata structure describing a
  slideshow. yt-dlp surfaces pieces of it via `--dump-json`. We do not rely
  on its per-slide fields (we use *even split* instead).
- **Background audio** — the single audio track attached to a slideshow.
  Drives the rendered video's total duration when present.
- **Burner cookies** — a `cookies.txt` (Netscape format) exported from a
  dedicated throwaway TikTok account, used to authenticate yt-dlp against
  TikTok's anti-bot. Path provided via env, gitignored. When absent, the bot
  degrades to public-only content.
- **Passthrough** — the code path for video posts: `yt-dlp -o out.mp4 <url>`
  then send, no rendering.
- **Slideshow render** — the code path for slideshow posts: fetch images +
  audio, build an ffmpeg filtergraph, produce an MP4.

## Fetch layer (yt-dlp)

- **yt-dlp** — the external CLI we shell out to for all TikTok fetching.
  Pinned version in the Docker image.
- **`--dump-json` / `-j`** — yt-dlp mode that prints the post's metadata as
  one JSON object to stdout without downloading media. We use it first to
  branch on slideshow-vs-video and to read image/audio URLs + durations.
- **Fetch** — the stage of a *job* where we run yt-dlp to pull metadata and
  download raw assets (images, audio, or a passthrough MP4).
- **Auth failure** — yt-dlp exit / stderr indicating TikTok blocked us
  (notably the "Sign in to confirm you're not a bot" string). Surfaced to the
  operator as a re-export-cookies alert, not a generic crash.

## Render layer (ffmpeg)

- **Canvas** — the output video's frame dimensions. For a slideshow, set to
  the *largest slide's* exact width x height (by pixel area), rounded up to
  even numbers. Every other slide is *contained* inside it.
- **Contain + letterbox** — fitting a slide into the canvas preserving its
  aspect ratio, filling empty space with black bars. (We chose black bars,
  not blurred-backdrop, for v1.)
- **Even split** — timing strategy: each slide displays for
  `audio_duration / slide_count`. Guarantees rendered video length equals
  audio length.
- **Silent-track fallback** — when a slideshow has no audio, each slide shows
  for a fixed default (`3s`) and we add a silent AAC track so every output is
  structurally a normal video.
- **Crossfade** — the only transition we apply: a short
  (default `0.4s`) fade between consecutive slides via ffmpeg's `xfade`
  filter. Hard cuts and TikTok-transition replication are out of scope for v1.
- **Filtergraph** — the single ffmpeg `-filter_complex` string that wires
  per-slide `scale`+`pad`, `concat`, and `xfade` into one video stream.
  Built by small, testable builder functions.
- **concat demuxer** — ffmpeg's image-sequence concatenation input. We write
  a `concat.txt` listing the slide files in the *per-job temp dir*.
- **Bitrate budget** — size-cap strategy: before encoding, compute the video
  bitrate as `target_size / duration` (target ~45 MB, under Telegram's 50 MB
  upload cap) and run a **two-pass** H.264 encode at that bitrate.
- **Two-pass encode** — ffmpeg `-pass 1` then `-pass 2` at the budgeted
  bitrate. Predictable output size, better quality than single-pass CBR.
- **720p downscale retry** — if the budget at full resolution would drop
  below a quality floor, re-encode downscaled to 1280x720 (preserving aspect)
  to stay under the cap.
- **`yuv420p`** — the pixel format we force, required for broad player /
  Telegram compatibility.
- **`+faststart`** — MP4 muxer flag (`-movflags +faststart`) putting the
  `moov` atom at the front so Telegram can stream/preview immediately.
- **`runFfmpeg(args)`** — our thin `child_process` wrapper that spawns
  ffmpeg with a `string[]` of args, returns a Promise, rejects on non-zero
  exit, and logs the full command + tail of stderr on failure.
- **`fluent-ffmpeg`** — explicitly *not* used; our filtergraph is too custom
  for its convenience layer.

## Job lifecycle

- **Job** — one end-to-end user request: receive URL -> fetch -> (render |
  passthrough) -> send. Identified by a `jobId` (UUID).
- **Job slot** — a unit of concurrency. Fetch and render share the same slot,
  so "concurrency 2" means at most 2 yt-dlp *or* ffmpeg processes at once.
- **Per-job temp dir** — `os.tmpdir()/tikitoki/<jobId>/` holding `images/`,
  `audio.*`, `out.mp4`, and `concat.txt`. Deleted on successful send.
- **Startup sweep** — on boot, delete any `os.tmpdir()/tikitoki/*` dir older
  than 1 hour to recover from past crashes.
- **Stage** — a labeled phase of a job shown to the user via *stage updates*:
  `Fetching`, `Rendering` (slideshow only), `Uploading`.
- **Stage update** — progress UX: send a placeholder message, edit it as
  stages change, then send the final video as a new message. Edits capped at
  <=1/sec to respect Telegram's limits.

## Concurrency & limits

- **Bounded concurrency** — at most 2 jobs running simultaneously, enforced
  via `p-queue`.
- **Per-user cooldown** — a single user may submit at most 1 job per 30s.
- **Global hourly cap** — at most 60 jobs/hour across all users, to protect
  the bot's IP from TikTok bans.
- **Cloud Bot API** — Telegram's hosted API, 50 MB upload cap. What we
  target by default.
- **Local Bot API** — a self-hosted `telegram-bot-api` binary that lifts the
  upload cap to 2 GB. Explicitly *deferred*; revisit if the 720p retry bites
  too often.

## Telegram / bot surface

- **grammY** — the Telegram bot framework we use (native TypeScript, polling
  by default). Its `session` and `conversations` plugins back per-user
  cooldown state.
- **Placeholder message** — the "Processing your TikTok..." text message a
  job sends immediately and edits through *stages*.
- **Final video message** — the `sendVideo` containing `out.mp4`, sent as a
  new message when the job succeeds; the placeholder is then edited to done
  or deleted.
- **Bot token** — `BOT_TOKEN` env var. The only mandatory secret.
- **Cookies path** — `TIKTOKI_COOKIES_PATH` env var pointing at
  `cookies.txt`. Optional; when unset we run public-only.

## Deployment

- **Docker image** — `node:20-alpine` base + `apk add ffmpeg` + a pinned
  `yt-dlp` binary. One reproducible artifact.
- **compose** — `docker-compose.yml` mounting `cookies.txt` and a `data/`
  volume, passing `BOT_TOKEN` / `TIKTOKI_COOKIES_PATH` / concurrency limits
  as env. The intended way to run the bot on a VPS.
