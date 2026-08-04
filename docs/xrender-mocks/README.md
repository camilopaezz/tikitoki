# xrender visual mocks (v1)

Static **dark-mode X mobile feed card** HTML mocks for approving the `/xrender` chrome before layout/ffmpeg work.

These are **visual approval** references only — not production templates and not live `x.com` captures.

## Product rules baked into the mocks

- Feed card only (no phone bezel, status bar, “For you/Following”, or bottom tabs)
- Dark theme (`#000` background)
- No relative timestamps
- No engagement row (reply / repost / like / views)
- Post text truncated ~2–3 lines with ellipsis
- Rounded media corners; duration pill (bottom-left) + mute (bottom-right) on video
- Content column ~390 CSS px, dynamic height

## Files

| File | Layout |
|------|--------|
| [`01-simple-video.html`](./01-simple-video.html) | Simple single-video post (header + text + video) |
| [`02-quote-of-video.html`](./02-quote-of-video.html) | Outer author quotes a nested card that contains the **video** |
| [`03-video-quotes-images.html`](./03-video-quotes-images.html) | Main **video** post that quotes a card underneath with **static dual images** |
| [`04-video-quotes-text.html`](./04-video-quotes-text.html) | Main **video** + quote card with **text only** (no images) |
| [`tokens-from-x.md`](./tokens-from-x.md) | CSS tokens from live x.com mobile browser pass |

Optional PNG screenshots (same basename) may be generated at 390px width for side-by-side review.

## How to preview

Open any HTML file in a browser, or serve the folder:

```bash
# from repo root
python -m http.server 8765 --directory docs/xrender-mocks
# then visit http://127.0.0.1:8765/01-simple-video.html
```

Screenshot at ~390px viewport width for a fair mobile feed-column look.
