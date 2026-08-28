# Live X CSS tokens (browser pass)

## 2026-08-27 (current x.com Tailwind UI)

Logged-out status `https://x.com/brndxix/status/2084391060336259405` plus
reply **feed cells** on the same thread. Desktop column ~566px; utilities
are rem-based so type/avatar/gaps match mobile.

X no longer paints hashed `css-175oi2r` classes. Feed chrome is Tailwind
tokens: `font-chirp`, `text-body`, `text-text`, `text-gray-700`, `size-10`,
`size-6`, `gap-2`, `gap-3`, `rounded-md`, `rounded-2xl`, `border-gray-200`.
Harvest **computed values**, not class names.

| Token | Computed | Utility |
|-------|----------|---------|
| Page bg | `#000` | html/body |
| Primary text | `#e6e9ea` / `rgb(230,233,234)` | `text-text` |
| Handle / secondary | `#71767a` / `rgb(113,117,122)` | `text-gray-700` |
| Borders | `#323639` 1px | `border-gray-200` (dark theme remap) |
| Font | `TwitterChirp, -apple-system, …` (400/700 loaded) | `font-chirp` |
| Body type | 15px / 20px, weight 400 | `text-body` |
| Name | 15px / 20px, weight 700, `line-clamp-1` | `text-body font-bold` |
| Handle | 15px / 20px, `font-feature-settings: "ss01"` | same + `ss01` |
| Outer avatar | 40×40 circle | `size-10 rounded-full` |
| Quote avatar | 24×24 circle | `size-6 rounded-full` |
| Header gap (avatar→text) | 8px | `gap-2` |
| Name → caption | 2px | `gap-0.5` |
| Caption → media / media → quote | 12px | `gap-3` |
| Feed row | `flex gap-2`; media in text column (not under avatar) | |
| Media radius | **28.8px** + 1px `#323639` on **both** detail and feed/reply cells | `rounded-md` |
| Media fit | `object-fit: contain` | |
| Quote card | 16px radius, 12px pad (`p-3`), 4px inner gap, 1px `#323639` | `rounded-2xl` |
| Quote type | **same 15/20 as outer** (only avatar shrinks) | |
| Verified | 15×15, fill `rgb(30,156,241)` `#1e9cf1` | `fill-badge` |
| Duration pill (omit in v1) | 13/16 white, h 20, px 8, radius 7.2, `rgba(0,0,0,0.77)`, `mm:ss` | `text-subtext2` + `bg-translucent-black-77` |

**Feed vs detail:** detail stacks name/handle and lets media span the
article width. Feed cells (replies) put name+@ on one row and indent
media into the text column. xrender is feed.

**App vs web media radius:** v1 used ~16px from native-app screenshots.
Live **web** feed+detail both use 28.8px (`rounded-md`). Side-by-side
against x.com → 80px @1080. Side-by-side against the iOS app → keep 44.

---

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
