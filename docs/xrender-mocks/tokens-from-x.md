# Live X CSS tokens (browser pass)

Measured **2026-08-04** via collaborative browser, mobile viewport
(iPhone 12 Pro preset ≈ 390×844), public status:

`https://x.com/brndxix/status/2084391060336259405`

That post is **video + text-only quote** (no images in the quote card) — layout
`video_quotes` with `images: []`.

## Caveats

- Logged-out **status detail** page, not the native app feed cell.
- Detail stacks name / handle; **feed** (product refs) puts name + @ on one row.
- We still take **colors / radii / sizes** from this pass; row layout follows
  feed refs + grill decisions (no time, no engagement).

## Tokens

| Token | Value |
|-------|--------|
| Page bg | `#000` / `rgb(0,0,0)` |
| Primary text | `#e6e9ea` / `rgb(230,233,234)` |
| Handle / secondary | `#71767a` / `rgb(113,117,122)` |
| Borders | `#323639` / `rgb(50,54,57)` 1px |
| Font stack | `TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …` |
| Base type | 15px / 20px line-height |
| Name weight | 700 |
| Avatar (outer) | 40×40 circle |
| Avatar (quote) | 24×24 circle |
| Content inset | 16px sides |
| Article content width | ~343px @ 375 main / 390 viewport |
| Media border-radius (web detail) | **~28.8px** + 1px border `#323639` |
| Quote card radius | **16px** + 1px border `#323639` |
| Gap media → quote | **12px** |
| Duration pill | 13px white, `background: rgba(0,0,0,0.77)`, height 20px, padding `0 8px`, radius ~7px, format `mm:ss` |
| Verified control | ~15×15 |

## Mock vs live deltas

| Item | Our earlier mocks | Live web |
|------|-------------------|----------|
| Text | `#e7e9ea` | `#e6e9ea` |
| Border | `#2f3336` | `#323639` |
| Media radius | 16px | ~29px on detail |
| Duration format | `0:08` | `00:12` |
| Duration bg | approximate | `rgba(0,0,0,0.77)` |

**Product choice for xrender:** prefer **feed** media radius (~16px from app
screenshots) unless we later target detail-page chrome. Duration format `m:ss`
vs `mm:ss` — match live `mm:ss` for v1.

## Layout confirmed

**Video quoting only text** is a first-class shape:

```
[avatar] name ✓ @handle
[optional outer text]
[ video  duration + mute ]
[ quote card: avatar name @handle ]
[             text only           ]
```
