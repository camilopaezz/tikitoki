# Instagram Reels + Carousel support — build plan

Implementation plan for adding Instagram support to tikitoki, derived from
[`docs/build-plan.md`](./build-plan.md) and a grilling session that resolved
the decisions below. Read the existing build plan first — every phase here
extends layers established in phases 0–8 of the original plan.

The plan is **bottom-up**: each phase produces a layer that is testable in
isolation before it gets wired into the bot. Do not jump ahead; later phases
depend on earlier ones being green.

## Grilling decisions (resolved before this plan was written)

1. **Carousel delivery:** render as a single MP4 — same UX as TikTok
   slideshows. Paste link, get one video back. Keeps the bot's output
  contract uniform (`sendVideo` always).
2. **Carousel music source:** scrape Instagram's page HTML via
   `--write-pages` (same pattern as TikTok's `extractImagePost.ts` which
   reads `__UNIVERSAL_DATA_FOR_REHYDRATION__`). yt-dlp's Instagram extractor
   has **zero** music/audio extraction — confirmed by reading
   `instagram.py` source. The music URL + duration must be parsed from the
   authenticated page dump's `data-sjs` JSON blobs.
3. **Platform architecture:** early branch in the pipeline. Instagram gets
   its own fetch functions that produce the **same `SlideshowAssets` shape**
   `{images, audio?, duration?}` the render layer already accepts. The render
   layer is reused as-is (already platform-agnostic).
4. **Mixed carousels (images + videos in one post):** reject for v1. Reply
   with a friendly "mixed carousels not yet supported" message. Phase 2
   concern.
5. **Instagram auth:** new `INSTAGRAM_COOKIES_PATH` env var. Separate
   cookies file. Instagram is more locked down than TikTok — both sample
   URLs returned "empty media response" without cookies.
6. **URL scope:** `/p/` (carousels + single posts), `/reel/` and `/reels/`
   (reels). Skip `/tv/` (IGTV is deprecated, merged into reels).
7. **Single-image posts:** reject. Reply "single images not supported, send
   a carousel or reel". yt-dlp's Instagram extractor is video-oriented and
   may not surface image URLs for single-image posts.
8. **Subagent strategy:** write plan, then build phases sequentially with
   subagents, then review.

## Non-goals for Instagram v1

- Mixed carousels (images + videos in one post) — rejected with a message.
- Single-image posts — rejected with a message.
- IGTV (`/tv/` URLs) — deprecated by Instagram.
- Stories — out of scope (different URL scheme, ephemeral).
- TikTok-transition replication, per-slide duration from metadata — same
  non-goals as the original plan.

---

## Phase 0 — Config & URL detection foundation

**Goal:** config schema accepts Instagram cookies; URL detection matches
both `tiktok.com` and `instagram.com`.

- [ ] `src/config/index.ts` — add `instagramCookiesPath` to the zod schema
      (optional, env var `INSTAGRAM_COOKIES_PATH`). Keep `cookiesPath` as
      the TikTok cookies path (rename the env var docs if needed, but keep
      `TIKTOKI_COOKIES_PATH` for backward compat).
- [ ] `src/fetch/cookies.ts` — add `instagramCookieArgs(cookiesPath?)` that
      returns `['--cookies', path]` when set (same shape, separate caller).
      Or generalize `cookieArgs` to take a path — it already does; just pass
      the Instagram path at call sites.
- [ ] `src/bot/intake.ts` — rename `extractTikTokUrl` → `extractPostUrl`.
      Match both `tiktok.com` and `instagram.com` URLs. Update `USAGE_MESSAGE`
      to mention both platforms. Update all callers.
- [ ] Unit tests: `extractPostUrl` matches TikTok URLs (existing tests still
      pass), Instagram `/p/`, `/reel/`, `/reels/` URLs, and ignores
      non-matching text.

**Verify:** `npm run typecheck && npm run lint && npm test` green;
`extractPostUrl` matches all URL types.

---

## Phase 1 — Instagram auth-failure detection + URL resolution

**Goal:** detect Instagram auth failures; resolve Instagram URLs to
carousel-vs-reel.

- [ ] `src/fetch/authFailure.ts` — add Instagram patterns to
      `AUTH_FAILURE_PATTERNS`:
      - `/empty media response/i`
      - `/accessible in your browser without being logged-in/i`
      - `/login required/i` (already present)
      Update `AuthFailureError` message to be platform-agnostic ("auth
      failed; cookies may need to be re-exported").
- [ ] `src/fetch/resolveInstagramUrl.ts` — new file. Detect:
      - `/p/` → potential carousel (single post or multi-image).
      - `/reel/` or `/reels/` → video (reel).
      Strip query parameters (`img_index`, `igsh`, `igshid`, `utm_*`) from
      the URL before processing — we want the canonical post URL.
      Return `{ url, isCarousel: boolean, isReel: boolean }`.
- [ ] Unit tests: URL resolution for `/p/`, `/reel/`, `/reels/`, with and
      without query params; auth failure patterns match Instagram messages.

**Verify:** `npm test` green; auth failure detection matches both TikTok
and Instagram error strings.

---

## Phase 2 — Instagram fetch layer (reels + carousel metadata)

**Goal:** given an Instagram URL + cookies, produce either a passthrough MP4
(reels) or carousel metadata (playlist entries + music).

### 2a — Reels passthrough
- [ ] Reuse `downloadVideo` as-is. The only change: pass
      `instagramCookiesPath` instead of (or alongside) the TikTok cookies
      path. `downloadVideo` already accepts a `cookiesPath` parameter.
- [ ] `src/fetch/dumpJson.ts` — no changes needed for reels; yt-dlp returns
      a single JSON object for reels (same as TikTok videos).

### 2b — Carousel metadata
- [ ] `src/fetch/dumpInstagramCarousel.ts` — new file. Run
      `yt-dlp -j --write-pages --no-download` with Instagram cookies into a
      `pagesDir` (same pattern as `dumpSlideshowJson` in `dumpJson.ts`).
      Parse the playlist JSON: `{ _type: 'playlist', entries: [...] }`.
- [ ] Classify each entry:
      - Entry with `formats[]` containing a video codec → **video entry**.
      - Entry with only `thumbnails[]` → **image entry**.
      - If any entry is a video entry → the carousel is **mixed** → throw
        `MixedCarouselError`.
      - If only one entry → **single-image** → throw `SingleImageError`.
      - All entries are images → proceed as image-only carousel.
- [ ] `src/fetch/extractInstagramMusic.ts` — new file. Read the `.dump` files
      from `pagesDir` (same pattern as `extractImagePost.ts`). Parse the
      `data-sjs` JSON blobs to find the carousel's music asset. Look for
      keys like `clips_music`, `music_asset`, `music_metadata`,
      `audio_asset`, `dashboard_music` — the exact structure must be
      discovered from an authenticated `--write-pages` dump during
      implementation. Extract:
      - Music audio URL (for downloading).
      - Music duration (for timing).
      Return `{ url?: string, duration?: number }`. If no music found,
      return `{}` (render layer falls back to silent track via
      `timing.ts`).
- [ ] Unit tests: `dumpInstagramCarousel` with mocked yt-dlp output (playlist
      with image entries, mixed entries, single entry); music extraction
      from fixture HTML containing `data-sjs` blobs.

**Verify:** `npm test` green; a manual `dumpInstagramCarousel` call (with
real cookies) against the sample carousel URL returns image entries + music
metadata.

---

## Phase 3 — Instagram carousel download

**Goal:** download carousel images + music audio into the per-job dir,
producing `SlideshowAssets`.

- [ ] `src/fetch/downloadInstagramCarousel.ts` — new file. Given the
      playlist entries (image-only) + music info:
      - Download each entry's highest-resolution image from
        `thumbnails[]` (sorted by `width * height`, pick the largest).
        Save to `images/slide_NNN.ext` (zero-padded, same naming as
        `downloadSlideshow.ts`).
      - If music URL exists, download it to `audio.ext`.
      - Return `SlideshowAssets { images, audio?, duration? }` — the exact
        shape `renderSlideshow` already accepts.
- [ ] Image download: use `fetch()` with `Referer: https://www.instagram.com/`
      header (Instagram CDN may require it; the TikTok path uses bare
      `fetch()` but Instagram may be stricter). If bare `fetch()` fails with
      403, retry with headers. Document this.
- [ ] Unit tests: mock `fetch`, assert correct image selection (largest
      thumbnail), file naming, audio download, SlideshowAssets shape.

**Verify:** `npm test` green; manual download against the sample carousel
produces `images/` with the correct number of slides + `audio.*` with the
music track.

---

## Phase 4 — Pipeline wiring

**Goal:** branch the pipeline on platform; reject mixed/single-image; wire
Instagram carousel → render, Instagram reel → passthrough.

- [ ] `src/pipeline.ts` — at the top of `runPipeline`, after URL resolution:
      - Detect platform: `tiktok.com` → existing TikTok path (unchanged).
      - `instagram.com` → new Instagram path.
      - Instagram reel → `downloadVideo` with `instagramCookiesPath` →
        passthrough MP4 (skip Rendering, same as TikTok video).
      - Instagram carousel → `dumpInstagramCarousel` →
        `downloadInstagramCarousel` → `renderSlideshow` (reused as-is).
      - Catch `MixedCarouselError` and `SingleImageError` → return a typed
        rejection that the bot layer surfaces to the user.
- [ ] `src/job/types.ts` — add `MixedCarouselError` and `SingleImageError`
      classes (or a generic `RejectedPostError` with a `userMessage` field).
      Add a `Platform` type: `'tiktok' | 'instagram'`.
- [ ] Unit tests: pipeline branches correctly given TikTok vs Instagram URLs
      (mock fetch functions); mixed carousel throws; single image throws.

**Verify:** `npm test` green; the existing TikTok pipeline tests still pass
unchanged.

---

## Phase 5 — Bot surface

**Goal:** the bot accepts Instagram URLs, drives jobs, and surfaces
rejection messages for mixed/single-image posts.

- [ ] `src/bot/intake.ts` — `extractPostUrl` (renamed in Phase 0) already
      matches Instagram URLs. Update `USAGE_MESSAGE` to mention Instagram.
- [ ] `src/bot/errors.ts` — map `MixedCarouselError` → "This post mixes
      photos and videos, which isn't supported yet. Send a photo-only
      carousel or a reel." Map `SingleImageError` → "Single images aren't
      supported. Send a carousel or a reel." Map Instagram
      `AuthFailureError` → same auth-failure message as TikTok, but the
      operator alert should mention Instagram cookies specifically.
- [ ] `src/bot/index.ts` — no structural changes needed; the pipeline
      handles the branching. The bot just passes the URL through.
- [ ] Update `README.md` — add Instagram to the description, env vars table
      (`INSTAGRAM_COOKIES_PATH`), and cookies export instructions (same
      Netscape format, from an Instagram browser session).
- [ ] Unit tests: error mapping for `MixedCarouselError`,
      `SingleImageError`, Instagram `AuthFailureError`.

**Verify:** `npm test` green; `npm run typecheck && npm run lint` green.

---

## Phase 6 — Integration tests with real URLs

**Goal:** end-to-end tests against real Instagram URLs, gated on cookies +
network + CLIs.

- [ ] `test/integration/instagram.integration.test.ts` — new file. Tests:
      1. **Reel passthrough:** `https://www.instagram.com/reel/DYXQG03PTPI/`
         → downloads MP4, skips Rendering, valid MP4 under size cap.
      2. **Carousel render:** `https://www.instagram.com/p/DZx_kFmGLwy/`
         → downloads images + music, renders MP4, valid output under cap,
         duration ~= music duration (or `slideCount * SILENT_SLIDE_SECONDS`
         if no music).
      3. **Auth failure skip:** if `INSTAGRAM_COOKIES_PATH` is not set or
         auth fails, skip with a warning (same pattern as the existing
         TikTok integration tests that catch `AuthFailureError`).
- [ ] Gate: tests require `INSTAGRAM_COOKIES_PATH` env var. If unset, skip
      all Instagram integration tests with a console warning.
- [ ] `vitest.integration.config.ts` — no changes needed (already runs all
      `*.integration.test.ts` files).
- [ ] Assert: stage sequence for reel = `['Fetching', 'Uploading']`; for
      carousel = `['Fetching', 'Rendering', 'Uploading']`. MP4 validity
      checks (ftyp box, ffprobe, yuv420p, +faststart, size < cap) — reuse
      the same probe helpers from `pipeline.integration.test.ts`.

**Verify:** `npm run test:integration` — Instagram tests pass (with cookies)
or skip gracefully (without cookies). Existing TikTok integration tests
still pass/skip as before.

---

## Phase 7 — Docker & docs update

**Goal:** the Docker image supports Instagram; docs reflect the new
capability.

- [ ] `docker-compose.yml` — add `INSTAGRAM_COOKIES_PATH` env var and
      mount `./cookies/instagram.txt` (read-only).
- [ ] `.env.example` — add `#INSTAGRAM_COOKIES_PATH=/app/cookies/instagram.txt`.
- [ ] `README.md` — update "What it does", env vars table, cookies section
      (separate instructions for TikTok vs Instagram cookies), and
      troubleshooting (Instagram auth failure → re-export Instagram cookies).
- [ ] Smoke test: `docker compose up` with both cookies mounted, run one
      reel + one carousel job.

**Verify:** image builds; container boots; one reel + one carousel
round-trip in a real chat.

---

## Definition of done (Instagram v1)

- All Phase 0–7 checkboxes complete.
- `npm run typecheck && npm run lint && npm run test` green on CI.
- `npm run test:integration` — Instagram tests pass with cookies, skip
  without.
- `docker compose up` serves both TikTok and Instagram from a clean checkout.
- A reel URL yields the passthrough MP4; a carousel URL yields a rendered
  MP4; mixed and single-image posts yield friendly rejection messages.

---

## Subagent build & review assignments

Phases are built **sequentially** by subagents (bottom-up — each phase
depends on the prior being green). After all phases, a review subagent
audits the full diff.

| Phase | Builder model | Reviewer model |
|-------|--------------|----------------|
| 0–7   | `cline-pass/kimi-k2.7-code` | — |
| Review | — | `cline-pass/glm-5.2` |

Each builder subagent receives:
- This plan document.
- The phase's checklist.
- Context from prior phases (what was built, file paths).
- Instructions to run `npm run typecheck && npm run lint && npm test` before
  declaring the phase done.

The review subagent receives:
- The full git diff.
- This plan document.
- Instructions to check: type safety, error handling, test coverage, plan
  adherence, and that existing TikTok functionality is not broken.
