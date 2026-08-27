# X mobile post render (`/xrender`) — build plan

Implementation plan for rendering Twitter/X video posts as **dark-mode feed cards**
with the real video playing in the media hole — derived from a research + grilling
session. Read [`docs/instagram-reels-plan.md`](./instagram-reels-plan.md) and
[`docs/vocabulary.md`](./vocabulary.md) first; this feature reuses the same job
lifecycle, cookies/auth, bitrate budget, and “platform fetch → artifact → render”
split.

The plan is **bottom-up**: each phase is testable in isolation before it is wired
into the bot. Do not jump ahead.

## Product goal

User runs **`/xrender <url>`** (or `/xrender` + URL in the same message). The bot
returns an MP4 that looks like an X mobile **feed card** with the post’s video
playing inside the media area. Plain paste of an X link stays **passthrough**
(current behavior).

## Grilling decisions (resolved)

1. **Engine:** composite chrome + ffmpeg overlay of the downloaded video.
   **Not** screen-recording live x.com or a browser playback session.
2. **Trigger:** **C** — plain `x.com` / `twitter.com` paste = passthrough video;
   **`/xrender`** = chrome composite. Both coexist.
3. **Frame:** feed card only — no phone bezel, status bar, tab bar, or “For you”
   chrome.
4. **Theme:** dark mode only for v1.
5. **Timestamps:** omit relative time (`· 17h`, `· 1d`).
6. **Engagement row:** omit (no reply / repost / like / view counts or icons).
7. **Outer post text:** truncate ~2–3 lines (+ ellipsis). Quoted text may use the
   same truncation rules inside the quote card.
8. **Media fit:**
   - landscape / square → **contain** (letterbox/pillarbox in the media hole)
   - tall vertical → **cover** (or natural tall slot that fills width; no empty
     side pillars when the source is already portrait)
9. **Canvas:** **fixed content width**, **dynamic height** (height = header +
   text + media + optional quote card + padding). Output is a vertical-ish MP4
   whose height depends on layout, not a forced 1080×1920 letterbox of a short
   card.
10. **Layouts in v1 (all required):**
    - **Simple** single-video post (header + text + video).
    - **Quote-of-video:** outer author/text + nested card (quoted account + text
      + **video** in nested media).
    - **Video-quotes-something:** main video + quote card under media (quoted
      account + text; **text-only** and/or **static images** / article-style
      thumbs). Text-only quotes are first-class (not a degraded image path).
11. **Quote media:** optional. Images allowed as static chrome; quote with only
    text is fully supported.
12. **What must play:** the **primary video** of the target status (the thing
    yt-dlp downloads as the post video). Images never “play.”
13. **On-video chrome:** **no** duration pill and **no** mute icon in v1
    (approved). Rounded media corners only.
14. **v1 hard reject:** multi-video main posts (carousel of videos as the primary
    player), text-only / image-only with no primary video, pure GIFs if they are
    not a downloadable video file — clear user-facing errors.

## Non-goals for `/xrender` v1

- Screen recording (Playwright/Puppeteer viewport capture of playback).
- Loading live `x.com` for paint.
- Remotion / full React video timelines.
- Phone bezel / full device mock.
- Engagement counts, timestamps, duration pill, mute icon, “Show more” expand,
  Community Notes.
- Multi-video primary posts, Spaces, polls-only, ads chrome.
- Light / dim themes.
- Perfect pixel match of every X redesign — “recognizably X mobile feed card.”
- Changing plain-paste passthrough behavior.

---

## Data acquisition (how we replicate a real tweet)

**Problem:** `yt-dlp -j` alone is **not enough** for feed chrome. Live probe of
`https://x.com/i/status/2084391060336259405` (video + text-only quote) returned:

| Need for card | yt-dlp `-j` | Syndication | FxTwitter |
|---------------|-------------|-------------|-----------|
| Display name / handle | yes (`uploader`, `uploader_id`) | yes | yes |
| Avatar URL | **no** | yes | yes (larger) |
| Blue verified | **no** | `is_blue_verified` | `verification` |
| Outer display text | partial (`description` is often the media t.co) | `text` + `display_text_range` | `text` + `raw_text` |
| Quote text / quote user | **no** | `quoted_tweet` | `quote` |
| Quote images | **no** | `photos` / `mediaDetails` on quote | `quote.media` |
| Primary video file | yes (download) | mp4 variants in JSON | mp4 URLs in JSON |
| Video w/h/duration | yes | yes | yes |

**Conclusion:** split **chrome metadata** from **video bytes**.

### Recommended pipeline (v1)

```
status URL
  ├─1─ chrome metadata  →  syndication (primary)  [fallback: fxtwitter]
  │       → XPostModel (authors, texts, quote tree, image URLs, layoutKind)
  ├─2─ primary video    →  existing downloadVideo / yt-dlp  (cookies, size, auth)
  │       → out.mp4 + probe dims if needed
  └─3─ static assets    →  HTTP download avatars (+ quote images)
          → local paths on XPostModel
```

### Source A — Twitter syndication (primary for chrome)

```
GET https://cdn.syndication.twimg.com/tweet-result?id={statusId}&lang=en&token=0
```

- Used by official embeds; **no cookies** on the sample we tested.
- Parse status id from URL: `/status/(\d+)/` (after `resolveTwitterUrl`).
- Useful fields (from live dump):
  - `user.name`, `user.screen_name`, `user.profile_image_url_https`,
    `user.is_blue_verified`
  - `text`, `display_text_range` — use range to strip trailing media t.co
  - `video` / `mediaDetails[]` — type `video` | `photo`, poster, aspect, variants
  - `photos[]` — stills on the **outer** post if any
  - `quoted_tweet` — nested object with same user/text/media shape (or absent)

**Avatar upgrade:** replace `_normal` with `_400x400` or strip suffix for
higher-res (`.../biY5ktzd_normal.jpg` → `.../biY5ktzd_400x400.jpg`).

**Text for chrome:**

```
visible = text.slice(display_text_range[0], display_text_range[1]).trim()
// if empty → outer caption is blank (media-only post); OK for layout
```

### Source B — FxTwitter (fallback / optional richer chrome)

```
GET https://api.fxtwitter.com/status/{statusId}
```

- Third-party; treat as **fallback** if syndication fails or omits fields.
- Nice extras: `author.avatar_url` already 200×200, `verification.type`,
  clean `media.videos[]`, nested `quote` with same shape.
- Do **not** depend on it as the only path (availability / ToS / rate limits).

### Source C — yt-dlp (video bytes + passthrough parity)

- Keep for **`/xrender` video file** and for plain-link passthrough.
- Still use `TWITTER_COOKIES_PATH` for NSFW / restricted.
- Do **not** expect quote/avatar from `-j` for layout.

Optional later: download video from syndication/fx mp4 variant and skip yt-dlp
when public — **not** v1 default (cookies + existing error mapping matter).

### Source D — yt-dlp `--write-pages` GraphQL dump

- Produces `TweetResultByRestId` blobs with `quoted_status_result`.
- Heavier and brittle (query ids change). Use only if A+B both fail for quotes.

### Layout classification from metadata

```
hasOuterVideo  = mediaDetails has type video  OR video object present
hasQuote       = quoted_tweet != null
quoteHasVideo  = quoted media has video
quoteHasPhotos = quoted photos/mediaDetails photos length > 0

if !hasOuterVideo && quoteHasVideo → layoutKind = quote_of_video
  (primary video file = quoted video; chrome outer + nested card with video hole)
elif hasOuterVideo && hasQuote     → layoutKind = video_quotes
  (primary video = outer; quote card text ± images)
elif hasOuterVideo                 → layoutKind = simple_video
else                               → unsupported (no primary video)
```

**Primary video identity:** the video that **plays** in the export:

- `simple_video` / `video_quotes` → outer status video (yt-dlp on outer URL)
- `quote_of_video` → quoted status video (yt-dlp on quoted status URL, or
  media URL from metadata if stable)

### Mapping → `XPostModel` (implementation contract)

| Card field | Syndication path | Notes |
|------------|------------------|--------|
| outer.author.name | `user.name` | |
| outer.author.handle | `user.screen_name` | store without `@`; render with `@` |
| outer.author.avatarUrl | `user.profile_image_url_https` | upscale |
| outer.author.verified | `user.is_blue_verified` | gold/business later |
| outer.text.displayText | slice by `display_text_range` | then truncate 2–3 lines |
| primaryVideo | yt-dlp file + `video` dims | prefer probe after download |
| quote.author.* | `quoted_tweet.user.*` | same as outer |
| quote.text | `quoted_tweet.text` + range | |
| quote.images | `quoted_tweet` photos / mediaDetails | download local |

### Failures

| Case | Behavior |
|------|----------|
| Syndication 404 / empty | try FxTwitter; else error |
| No video after classify | `NoVideoError` / xrender unsupported |
| Multi video in primary | reject v1 |
| Avatar download fail | solid placeholder circle |
| Quote fetch partial | render simple_video + log warn **or** hard-fail quote layouts — prefer hard-fail for quote layouts so we don’t lie |

### Fixtures to commit (Phase 1)

Redact tokens; keep structure:

1. `video_quotes` text-only — status `2084391060336259405` (probed)
2. `simple_video` — any single video status
3. `video_quotes` with photos — find one sample
4. `quote_of_video` — outer quotes a video post

Store under `test/fixtures/twitter/syndication-*.json` + expected `XPostModel`
snapshots.

## Architecture overview

```
Telegram: /xrender <url>
  → parse command + URL (must be twitter/x status)
  → cooldown / hourly cap / job slot (existing)
  → pipeline mode: xrender
       Fetching:
         resolveTwitterUrl
         dumpTwitterPost (yt-dlp -j + assets) → XPostModel
         download primary video + avatars + quote images
       Rendering:
         layoutXPost → chrome PNG(s) + media rect(s) + canvas size
         renderXPost → ffmpeg scale/pad/crop + overlay + audio + size budget
       Uploading:
         sendVideo (existing)
```

**Key split (mirror Instagram):**

| Layer | Responsibility |
|-------|----------------|
| Fetch | URL + cookies → `XPostModel` + local media paths |
| Layout | `XPostModel` → canvas size, media slot geometry, chrome still(s) |
| Render | geometry + video path → MP4 (ffmpeg), reuse bitrate / 720p retry ideas |
| Bot | command intake + error mapping; stages `Fetching` → `Rendering` → `Uploading` |

**Chrome strategy (hybrid, from research):**

- Prefer **HTML/CSS dark feed card** → one headless still (or layered PNGs) for
  text/emoji/wrap fidelity.
- **Never** record the video playing in the browser.
- ffmpeg always owns the timeline: source video + source audio + size budget.

If Playwright is too heavy for Docker v1, ship **v0 templates** (fixed header +
footer PNGs, truncated text as pre-rendered layer) and keep the same
`layout → overlay` contract so HTML chrome can replace templates without
rewriting encode.

**Recommendation for this repo:** implement **layout contract + pure ffmpeg
overlay first** with a minimal HTML→PNG path only when text quality demands it;
keep Chromium **optional** and out of the hot path when chrome can be cached by
layout hash.

---

## Data model

```ts
// Conceptual — exact file TBD in Phase 2

type XMediaFit = 'contain' | 'cover';

interface XAuthor {
  name: string;
  handle: string;       // without leading @, or with — pick one and stick
  avatarPath?: string;  // local file after download
  verified?: 'none' | 'blue' | 'gold' | 'gray' | 'business'; // simplify if needed
}

interface XTextBlock {
  text: string;         // raw
  displayText: string;  // truncated for layout
}

interface XVideoAsset {
  path: string;
  width: number;
  height: number;
  durationSec: number;
}

interface XImageAsset {
  path: string;
  width: number;
  height: number;
}

/** Nested quote card (static or containing the primary video — layout decides). */
interface XQuoteCard {
  author: XAuthor;
  text: XTextBlock;
  images: XImageAsset[];   // 0..n static images / thumbs
  // Video inside quote is represented by placing primary video in nested slot
  // when layoutKind === 'quote_of_video'
}

type XLayoutKind =
  | 'simple_video'
  | 'quote_of_video'      // outer text + nested card with video
  | 'video_quotes';        // main video + quote card under (images/text)

interface XPostModel {
  layoutKind: XLayoutKind;
  outer: {
    author: XAuthor;
    text: XTextBlock;
  };
  primaryVideo: XVideoAsset;
  quote?: XQuoteCard;
  sourceUrl: string;
}
```

**Layout outputs (render inputs):**

```ts
interface XMediaSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  fit: XMediaFit;
  cornerRadius: number;
}

interface XPostLayout {
  canvas: { width: number; height: number }; // even dims
  chromePath: string;   // full-card PNG with transparent media hole, OR
  // chromeAbovePath + chromeBelowPath if easier for full-bleed video
  mediaSlot: XMediaSlot; // primary playing video
  // no duration/mute overlays in v1
}
```

---

## Phase 0 — Vocabulary, command surface, config hooks

**Goal:** name the feature consistently; accept `/xrender` without changing
passthrough.

- [x] `docs/vocabulary.md` — add terms:
  - **xrender** — command/mode that composites an X feed card around a video
  - **passthrough** (existing) — plain X link still means download-only
  - **feed card** — output chrome shape (no device bezel)
  - **media hole / media slot** — rectangle where the primary video is overlaid
  - **quote card** — nested bordered block for quoted posts
- [x] `src/bot/intake.ts`:
  - Detect `/xrender` (also `/xrender@BotName`)
  - Extract trailing URL or sole URL in the message
  - Reject `/xrender` without a Twitter/X URL with a short usage string
  - Leave `extractPostUrl` for plain paste unchanged
- [x] `src/job/types.ts` / lifecycle — carry `mode: 'passthrough' | 'xrender'`
  from bot → worker
- [x] Pipeline stub: `mode === 'xrender'` → `XRenderNotReadyError` until Phase 5
- [x] Unit tests: command parsing; plain X URL still extracts as today; non-X
      URL with `/xrender` fails clearly

**Verify:** `pnpm typecheck && pnpm lint && pnpm test` green.

---

## Phase 1 — Chrome metadata + classify layout

**Goal:** given a status URL, build an `XPostChrome` **without** rendering.
See **Data acquisition** above.

- [x] `src/fetch/parseTwitterStatusId.ts` — extract numeric status id from
      resolved x.com URL.
- [x] `src/fetch/fetchTwitterSyndication.ts` — HTTP GET syndication
      `tweet-result?id=…`; parse JSON; timeout + clear errors.
- [ ] `src/fetch/fetchTwitterFxFallback.ts` (optional) — FxTwitter fallback
      deferred; syndication is enough for v1 fixtures.
- [x] `src/fetch/mapTwitterChrome.ts` + `twitterChromeTypes.ts` — pure map to
      `XPostChrome` (authors, texts, quote, layoutKind, remote media URLs).
- [x] Layout classify folded into `mapTwitterChrome` / `classifyLayout`.
- [x] `truncateTweetText` + `sliceDisplayText` + `upscaleAvatarUrl`.
- [x] Fixture: `test/fixtures/twitter/syndication-video-quotes-text.json`
      (status `2084391060336259405`).
- [x] Unit tests: id parse, text helpers, classify/map, syndication fetch mock.
- [x] **Video bytes stay Phase 2** via existing `downloadVideo` (yt-dlp).

**Risk:** syndication shape changes or rate-limits. Mitigation: fixtures;
FxTwitter fallback still optional later.

**Verify:** `pnpm typecheck && pnpm lint && pnpm test` green.

---

## Phase 2 — Download assets for xrender

**Goal:** materialize local files for video + avatars + quote images.

- [x] Reuse `downloadVideo` for primary MP4 (platform: `twitter`)
- [x] `src/fetch/downloadXAssets.ts` — download outer/quote avatars + quote
      images; soft-fail avatars; `quote_of_video` uses quoted status URL
- [x] `probeVideo` on primary file (fallback to syndication dims)
- [x] Optional `maxSizeMb` passthrough to yt-dlp download (re-encode budget later)
- [x] Unit tests with injected download/probe seams

**Verify:** unit tests with mocked downloads green.

---

## Phase 3 — Layout engine (geometry + chrome still)

**Goal:** pure-ish layout: assets → `XPostLayout` + chrome HTML/PNG.

### 3a — Geometry (no browser)

- [x] `src/render/x/layout.ts` — `XRENDER_WIDTH = 1080`, dynamic height
- [x] Media fit: landscape/square **contain**, tall **cover** (clamped)
- [x] Quote card height for text ± images
- [x] Unit tests for slot fit + quote growth

### 3b — Chrome raster

- [x] **A-lite:** HTML template (`chromeHtml.ts`) + headless Chromium screenshot
      (`screenshotChrome.ts`) — transparent media hole, no duration/mute
- [x] Unit tests for HTML content (badge, quote, no mute/duration)
- [ ] Optional PNG golden fixtures / Docker chromium package (Phase 6)

**Verify:** unit tests green; screenshot needs chromium at runtime.

---

## Phase 4 — ffmpeg composite encode

**Goal:** `XPostLayout` + primary video → `xrender.mp4` under size budget.

- [x] `src/render/x/filtergraph.ts` — contain/cover into media slot + chrome overlay
- [x] `src/render/x/renderXPost.ts` — layout → chrome PNG → encode (single-pass
  when max bitrate binds; two-pass when size budget binds) +
      source audio + bitrate budget + optional 720-wide downscale
- [x] Unit tests for filtergraph + renderXPost (mocked screenshot/ffmpeg)
- [ ] Integration: real chromium + ffmpeg fixture (optional / later)

**Verify:** unit tests green.

---

## Phase 5 — Pipeline + bot wiring

**Goal:** end-to-end `/xrender` job.

- [x] `src/pipeline.ts` — `mode === 'xrender'` → syndication → downloadXAssets →
      renderXPost (Fetching → Rendering → Uploading)
- [x] Bot intake from Phase 0 already passes `mode`
- [x] Error mapping for syndication + chrome map failures
- [x] Unit tests: xrender pipeline path vs passthrough

**Verify:** full unit suite green.

---

## Phase 6 — Docs, Docker, polish

- [x] `README.md` — `/xrender` + Chromium requirement
- [x] `Dockerfile` — Alpine `chromium` + fonts for chrome screenshots
- [x] Version bump to **1.3.0**
- [ ] Integration test (optional): live `/xrender` with network/cookies

**Verify:** unit suite green; Docker image installs chromium.

---

## Error matrix (user-facing)

| Case | Message (draft) |
|------|-----------------|
| `/xrender` without URL | `Usage: /xrender <Twitter/X video post URL>` |
| Non-X URL | ` /xrender only works with Twitter/X links.` |
| No primary video | `That post doesn't have a video to render.` |
| Multi-video primary | `Multi-video posts aren't supported in /xrender yet.` |
| Auth failure | existing soft user message + operator alert |
| Layout/metadata failure | `Couldn't build a card for that post.` |

---

## Testing strategy

| Level | What |
|-------|------|
| Unit | command parse, classify, truncate, layout geometry, filtergraph builders |
| Fixture | redacted yt-dlp JSON + sample avatars/images |
| Integration | real URL optional; local MP4 + chrome PNG encode always |
| Visual | attach 3 golden card PNGs + 1 sample MP4 frame in PR |

---

## Suggested implementation order (summary)

0. Command + job mode flags  
1. Dump JSON + classify + fixtures  
2. Download video + chrome assets  
3. Layout geometry + chrome raster  
4. ffmpeg overlay encode + size budget  
5. Pipeline/bot/errors  
6. Docs/Docker/version  

## Open implementation checkpoints (not product re-litigation)

Resolve during the phase, not in another grill:

1. **Chrome raster tech (3b):** Playwright vs layered PNG — measure Docker size
   and emoji quality on one sample Spanish tweet with ⚽🏆.
2. **yt-dlp quote fidelity (1):** if dump-json lacks quote trees, add
   `--write-pages` extractor or narrow v1 to “simple + best-effort quote.”
3. **Width constant:** 1080 vs 720 — 720 faster/smaller; 1080 sharper in Telegram.
4. **Tall video max height:** clamp so `video_quotes` cards do not exceed a
   practical max (e.g. 1920 or 2400) before encode.

---

## Success criteria for v1

- Plain X video link still passthrough (no chrome).
- `/xrender` on a simple video post returns a dark feed-card MP4 with playing
  video, rounded media, no duration/mute, no time, no engagement row.
- `/xrender` on a video-quoting-images post matches the reference structure
  (main video + quote card with images).
- `/xrender` on quote-of-video places video in the nested card.
- Output under Telegram size budget; stages show `Rendering`.
- No Chromium screen-recording of playback in the critical path.
