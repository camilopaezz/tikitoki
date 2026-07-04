# Build plan

Implementation plan for tikitoki, derived from [`docs/vocabulary.md`](./vocabulary.md).
Read that doc first — every term below uses the exact vocabulary defined there.

The plan is **bottom-up**: each phase produces a layer that is testable in
isolation before it gets wired into the bot. Do not jump ahead; later phases
depend on earlier ones being green.

## Stack & conventions (decisions to confirm before Phase 0)

- **Runtime:** Node.js 20, TypeScript (strict). Docker base: `node:20-alpine`
  (floats to the latest 20.x patch; bump intentionally for minors).
- **Bot framework:** grammY with `session` + `conversations` plugins.
- **Concurrency:** `p-queue` for the job slot pool.
- **External CLIs:** `yt-dlp` and `ffmpeg` via thin `child_process` wrappers
  (`runYtDlp`, `runFfmpeg`). `fluent-ffmpeg` is explicitly **not** used.
  `yt-dlp` installed as the **latest** release in the Docker image (not pinned)
  so anti-bot fixes land without a rebuild of the base plan.
- **Tests:** `vitest` (selected). Separate `test:integration` script for
  network + CLI-gated tests.
- **Lint/format:** `biome` (selected).
- **Logging:** structured-ish `console`-based logger with a `jobId` field on
  every line. No external logger unless a phase demands it.

No open questions; all Phase 0 decisions locked in below.

## Non-goals for v1 (from vocabulary)

- Local Bot API (2 GB uploads) — deferred; revisit if 720p retry fires too often.
- Hard cuts, blurred-backdrop letterbox, TikTok-transition replication.
- Per-slide duration from TikTok's `ImagePost` metadata — we use **even split**.
- Persisted job history / DB — in-memory state only for v1.

---

## Phase 0 — Project scaffold

**Goal:** a runnable, lint-clean, test-running TypeScript project.

- [ ] `package.json` with `type: "module"`, scripts: `dev`, `build`, `start`,
      `test`, `test:integration`, `lint`, `typecheck`, `format`.
- [ ] `tsconfig.json` (strict, `NodeNext` module resolution, `outDir`).
- [ ] `biome.json` config (lint + format).
- [ ] Directory layout:
      `src/config/`, `src/process/`, `src/fetch/`, `src/render/`,
      `src/job/`, `src/bot/`, `src/util/`; `test/` mirroring `src/`.
- [ ] `src/config/index.ts` — read + validate env: `BOT_TOKEN` (required),
      `TIKTOKI_COOKIES_PATH` (optional), `CONCURRENCY` (default 2),
      `COOLDOWN_SECONDS` (default 30), `HOURLY_CAP` (default 60),
      `TARGET_SIZE_MB` (default 45), `CROSSFADE_SECONDS` (default 0.4),
      `SILENT_SLIDE_SECONDS` (default 3).
- [ ] `src/util/logger.ts` — log helpers that tag every line with `jobId`.
- [ ] `src/util/tmp.ts` — `perJobDir(jobId)` creating `os.tmpdir()/tikitoki/<jobId>/`
      with subdirs `images/`; `rmJobDir(jobId)`; **startup sweep** deleting
      any `os.tmpdir()/tikitoki/*` older than 1 hour.
- [ ] `.gitignore` (`node_modules/`, `dist/`, `cookies.txt`, `data/`).
- [ ] CI workflow (lint + typecheck + test on push).

**Verify:** `npm run typecheck && npm run lint && npm run test` all pass on an
empty-suite placeholder; `node` boots `src/index.ts` via `tsx` and logs a
startup line + runs the startup sweep without error.

---

## Phase 1 — Process wrappers

**Goal:** `runYtDlp` and `runFfmpeg` exist, reject on non-zero exit, log fully.

- [ ] `src/process/run.ts` — generic `runProcess(cmd, args, opts)` returning a
      Promise; captures stdout/stderr; on non-zero exit rejects with stderr tail
      and the full command string.
- [ ] `src/process/ytDlp.ts` — `runYtDlp(args)` thin wrapper.
- [ ] `src/process/ffmpeg.ts` — `runFfmpeg(args)` thin wrapper; tolerates
      ffmpeg's noisy stderr (does not treat stderr text as failure).
- [ ] Unit tests: mock `child_process.spawn`, assert reject-on-non-zero, assert
      full command + stderr tail present in the error.

**Verify:** `npm test` covers wrappers; a manual `runFfmpeg(['-version'])` and
`runYtDlp(['--version'])` print versions.

---

## Phase 2 — Fetch layer

**Goal:** given a TikTok URL, produce either a passthrough MP4 or a set of
slide images + background audio, with auth-failure detection.

- [ ] `src/fetch/dumpJson.ts` — `runYtDlp(['-j', '--no-download', url])`, parse
      the single JSON object.
- [ ] `src/fetch/classify.ts` — pure function: JSON -> `'video' | 'slideshow'`
      based on the fields yt-dlp surfaces.
- [ ] `src/fetch/downloadVideo.ts` — passthrough: `runYtDlp([-o out.mp4 url])`
      into the per-job dir; returns path to `out.mp4`.
- [ ] `src/fetch/downloadSlideshow.ts` — download all slide images into
      `images/` (ordered, zero-padded names) + background audio into `audio.*`.
- [ ] `src/fetch/authFailure.ts` — detect the "Sign in to confirm you're not a
      bot" string (and related) in yt-dlp stderr; surface a typed
      `AuthFailureError` the caller can branch on.
- [ ] Cookies: pass `--cookies <path>` when `TIKTOKI_COOKIES_PATH` is set;
      when unset, run public-only and document the degraded mode.
- [ ] Unit tests: `classify` against saved `--dump-json` fixtures (video +
      slideshow + edge cases); `authFailure` detection on stderr snippets.
- [ ] Integration tests (gated, need network + CLIs): one real video URL
      (passthrough), one real slideshow URL (images + audio downloaded).

**Verify:** `npm test` green on units; `npm run test:integration` (separate
script) downloads a known slideshow into a temp dir and the image count +
audio file match expectations from the fixture's `dump-json`.

---

## Phase 3 — Render layer (slideshow)

**Goal:** turn slide images + audio into an MP4 under the size cap. The
filtergraph is built by **small, pure, unit-tested builder functions** — this
is the most logic-heavy phase.

### 3a — Canvas + per-slide geometry
- [ ] `src/render/canvas.ts` — pick the largest slide by pixel area; round
      width and height up to even numbers; return `{width, height}`.
- [ ] `src/render/contain.ts` — build the `scale`+`pad` filter args to contain
      a slide into the canvas with black-letterbox, preserving aspect ratio.
- [ ] Unit tests: odd dimensions round up; landscape vs portrait slides
      letterbox on the correct axis; canvas equals the largest slide exactly.

### 3b — Timing
- [ ] `src/render/timing.ts` — **even split**: `perSlide = audioDuration /
      slideCount`. **Silent-track fallback**: no audio -> `perSlide =
      SILENT_SLIDE_SECONDS` and flag that a silent AAC track must be added.
- [ ] Unit tests: durations sum to audio length; single slide; no-audio path.

### 3c — Filtergraph assembly
- [ ] `src/render/filtergraph.ts` — compose per-slide `scale`+`pad`, `concat`,
      and `xfade` **crossfade** (default `CROSSFADE_SECONDS`) into one
      `-filter_complex` string. Pure function of (slides, canvas, timing,
      crossfade).
- [ ] `src/render/concatDemuxer.ts` — write `concat.txt` in the per-job dir
      listing slide files in order (used only where the demuxer path applies).
- [ ] Unit tests: snapshot/expected-string tests for the filtergraph given
      fixed inputs; assert crossfade overlaps do not exceed slide duration;
      assert no xfade on a single slide.

### 3d — Encode + size cap
- [ ] `src/render/bitrate.ts` — `bitrate = targetSizeBytes / duration`;
      compute a quality floor that triggers the 720p retry.
- [ ] `src/render/encode.ts` — **two-pass** H.264 at the budgeted bitrate,
      forcing `yuv420p`, `-movflags +faststart`, silent AAC track when the
      slideshow had no audio.
- [ ] `src/render/retry720.ts` — if budget at full res would drop below the
      quality floor, re-encode downscaled to 1280x720 (preserving aspect) to
      stay under the cap.
- [ ] `src/render/renderSlideshow.ts` — orchestrates 3a–3d into one call:
      inputs -> `out.mp4` in the per-job dir.
- [ ] Integration test: render a fixture slideshow (3–4 still images + a short
      audio clip) and assert: playable MP4, duration ~= audio duration, file
      size <= target cap, `yuv420p`, `+faststart` present.

**Verify:** `npm test` green on all builder units; integration render produces
a valid MP4 under cap for a fixture with audio, and a valid MP4 of length
`slideCount * SILENT_SLIDE_SECONDS` for a no-audio fixture.

---

## Phase 4 — Job engine

**Goal:** bounded concurrency, per-user cooldown, global hourly cap, temp-dir
lifecycle, and stage tracking — all independent of Telegram.

- [ ] `src/job/types.ts` — `Job`, `JobId`, `Stage` (`'Fetching' | 'Rendering' |
      'Uploading'`), `JobResult`.
- [ ] `src/job/slots.ts` — `p-queue` with `CONCURRENCY` slots; fetch and render
      share the same slot (one slot = one job end-to-end).
- [ ] `src/job/cooldown.ts` — per-user cooldown (`COOLDOWN_SECONDS`) backed by
      an in-memory map; reject duplicate submissions.
- [ ] `src/job/hourlyCap.ts` — sliding 60-minute window of job start
      timestamps; reject when `HOURLY_CAP` reached.
- [ ] `src/job/lifecycle.ts` — create job, allocate per-job dir, run a provided
      async worker, emit stage updates through a callback, guarantee dir
      cleanup on success.
- [ ] `src/job/stages.ts` — stage-update helper that rate-limits edits to
      <=1/sec (Telegram limit) and dedupes repeated stages.
- [ ] Unit tests: cooldown rejects within window, admits after; hourly cap
      rejects at 61st; stage rate-limiter coalesces rapid updates; lifecycle
      cleans up on success **and** on worker throw.

**Verify:** `npm test` green; a fake-worker script runs N concurrent jobs and
observes exactly `CONCURRENCY` simultaneous executions.

---

## Phase 5 — Telegram bot surface

**Goal:** a grammY bot that accepts a URL, drives a job, and reports stages.

- [ ] `src/bot/index.ts` — grammY bot, long polling, `session` + `conversations`.
- [ ] `src/bot/intake.ts` — on message, extract a TikTok URL; if none, reply
      usage; if user is on cooldown or cap hit, reply a friendly refusal.
- [ ] `src/bot/placeholder.ts` — send the placeholder message immediately on
      job start.
- [ ] `src/bot/stageUpdates.ts` — wire `stages.ts` to edit the placeholder per
      stage (rate-limited).
- [ ] `src/bot/send.ts` — on success, `sendVideo` with `out.mp4` as a **new**
      message, then edit the placeholder to done (or delete it).
- [ ] `src/bot/errors.ts` — map job errors to user replies; `AuthFailureError`
      -> user-facing "couldn't fetch, try later" + an operator alert to
      re-export cookies.
- [ ] Manual/integration test against the bot in a test chat with a real
      video URL and a real slideshow URL.

**Verify:** in a real test chat, a video URL yields the passthrough MP4
sent back; a slideshow URL yields a rendered MP4 sent back; the placeholder
progresses through `Fetching` -> `Rendering` -> `Uploading` without
rate-limit errors from Telegram.

---

## Phase 6 — Integration wiring

**Goal:** one end-to-end pipeline from URL to sent video, no new logic.

- [ ] `src/pipeline.ts` — given a `Job`: fetch -> classify -> (passthrough |
      renderSlideshow) -> hand `out.mp4` to the bot sender.
- [ ] Wire `pipeline.ts` as the worker passed to `lifecycle.ts`, inside the
      bot's intake handler, behind the slot queue + cooldown + cap.
- [ ] End-to-end test (gated): video post, slideshow-with-audio post,
      slideshow-no-audio post, and an auth-failure case using a deliberately
      bad/expired cookies path.

**Verify:** the four end-to-end cases behave as expected in a test chat;
temp dirs are gone after each successful send; logs carry `jobId` end-to-end.

---

## Phase 7 — Docker & compose

**Goal:** one reproducible artifact and a one-command VPS run.

- [ ] `Dockerfile` — `node:20-alpine` base, `apk add ffmpeg`, install the
      latest `yt-dlp` release, copy built `dist/`, `USER node`, entrypoint
      `node dist`.
- [ ] `docker-compose.yml` — mount `cookies.txt` (read-only) and a `data/`
      volume; pass `BOT_TOKEN`, `TIKTOKI_COOKIES_PATH`, concurrency env;
      restart policy.
- [ ] `.dockerignore` (`node_modules/`, `test/`, `cookies.txt`, `data/`).
- [ ] Smoke test: `docker compose up` in a throwaway token chat, run one
      video + one slideshow job.

**Verify:** image builds reproducibly; container boots, runs the startup
sweep, polls, and serves one of each post type; `yt-dlp --version` and
`ffmpeg -version` inside the container match the pins.

---

## Phase 8 — Hardening

**Goal:** production-credible behavior under failure.

- [ ] Graceful shutdown: stop polling, drain the slot queue, finish in-flight
      jobs, then exit.
- [ ] Operator alerts: auth failure -> configured channel/DM with
      "re-export       cookies" instructions.
- [ ] Edge cases covered by tests: single-slide slideshow, very long audio
      (triggers 720p retry), oversized passthrough MP4 (>50 MB) policy
      (reject + message, since passthrough can't be re-encoded without
      transcoding — decide policy here), concurrent identical URLs from
      different users.
- [ ] Structured logs review: every job line has `jobId`, `userId`, `stage`.
- [ ] README: env vars, cookies export steps, `docker compose up` run,
      troubleshooting (auth failure, 720p retry).

**Verify:** full `npm test` + `npm run test:integration` green; manual
chaos run (kill yt-dlp mid-fetch, send malformed URLs, flood the bot) leaves
no orphaned temp dirs and no crashed process.

---

## Definition of done (v1)

- All Phase 0–8 checkboxes complete.
- `npm run typecheck && npm run lint && npm run test` green on CI.
- `docker compose up` serves the bot from a clean checkout with only
  `BOT_TOKEN` set (public-only mode) and with `TIKTOKI_COOKIES_PATH` set.
- Both a video post and a slideshow post round-trip in a real chat, under
  the 50 MB cap, with stage updates shown to the user.
