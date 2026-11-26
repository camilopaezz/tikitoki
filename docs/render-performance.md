# Render performance

Benchmark of the render paths before/after the render optimization pass.
Reproduce with `pnpm bench:render [--quality]` inside the production Docker
image (Alpine ffmpeg with libx264 + `chromium-headless-shell`).

## Method

- `scripts/bench-render.ts` generates deterministic synthetic fixtures (moving
  test pattern + temporal grain, fractal/gradient stills, sine audio) and calls
  the public entry points `renderXPost`, `renderSlideshow`, `fitVideoToSize`.
  No network, no cookies.
- Median of 3 runs after one warm-up, 4-core x86_64, same container image for
  both trees.
- `--quality` re-renders each case through an ffmpeg shim that keeps the exact
  filtergraph but encodes losslessly (`-qp 0`, no pass 1). SSIM/PSNR of the
  real output against that reference is pure encode loss; `unique` counts
  distinct frames in the lossless reference (motion smoothness).

## Results

| Case | Before | After | Speedup |
|------|-------:|------:|--------:|
| X feed card, 1280×720 30 fps, 15 s | 16.4 s | 3.8 s | **4.3×** |
| X feed card + quote images, 720×1280 60 fps, 20 s | 28.6 s | 4.2 s | **6.8×** |
| X quote-of-video, 15 s | 17.9 s | 3.8 s | **4.7×** |
| X feed card, 120 s (2-pass, size budget binds) | 267.6 s | 51.0 s | **5.2×** |
| Slideshow, 10 × 1080×1920 + 30 s audio | 33.1 s ¹ | 30.0 s | 1.1× (1.25× per output second) |
| Slideshow, 4 mixed-aspect, silent | 14.6 s | 11.0 s | **1.33×** |
| Oversized video fit, 1080p 20 s → 6 MB | 22.3 s | 22.3 s | unchanged (not modified) |

¹ Before, this clip was only 26.4 s long: the crossfade overlap was not
accounted for, so `-shortest` cut the last 3.6 s of music. After, it is the
full 30 s (13.6 % more frames) and still finishes faster.

X render breakdown (15 s case): screenshot 2266 → 243 ms, PNG measure 135 →
55 ms, crop 143 → 0 ms (now in-graph), encode 13.6 → 3.5 s.

### Quality

| Case | SSIM before → after | PSNR before → after | Distinct frames before → after |
|------|--------------------:|--------------------:|-------------------------------:|
| X 15 s | 0.99796 → 0.99775 | 51.97 → 51.40 dB | 375/450 → **450/450** |
| X 60 fps portrait 20 s | 0.99977 → 0.99977 | 61.48 → 61.43 dB | 500/600 → **600/600** |
| X quote-of-video 15 s | 0.99863 → 0.99850 | 53.43 → 52.99 dB | 375/450 → **450/450** |
| X 120 s 2-pass | 0.99814 → 0.99798 | 52.20 → 51.56 dB | 3000/3600 → **3600/3600** |
| Slideshow 10× + audio | 0.99958 → 0.99971 | 59.47 → 61.03 dB | 91/792 → 109/900 |
| Slideshow 4× silent | 0.99980 → 0.99983 | 63.50 → 64.22 dB | 34/564 → 37/564 |
| Fit 1080p → 6 MB | 0.96790 → 0.96790 | 29.08 → 29.08 dB | 600/600 → 600/600 |

X renders used to composite at **25 fps** (the black `color` base defaulted to
25 fps and drove overlay timing) and pad to 30 with duplicate frames, so every
video juddered. They now keep every source frame. The tiny SSIM/PSNR dip is
the same bitrate now carrying 20 % more distinct frames; per-frame pixels of
the compositor are byte-identical to before (verified on matching frames).
Chrome screenshots via the shared browser are pixel-identical to the one-shot
CLI on all three layouts.

## What changed

- **X filtergraph**: chrome PNG is a single input frame, cropped, chromakeyed
  and converted to yuva420p once, then held with `loop` (was decoded +
  keyed + converted every frame from a `-loop 1` input). The video is padded
  onto the canvas at its native rate (`fps=30`) instead of overlaid on a
  25 fps `color` source.
- **Shared Chromium**: one headless browser driven over
  `--remote-debugging-pipe` (fresh target per screenshot, per-shot timeout
  that kills a wedged browser, 5 min idle shutdown, automatic fallback to the
  one-shot CLI). `TIKITOKI_CHROME_ONESHOT=1` forces the old path.
- **Chrome post-processing**: PNG is decoded in-process (no ffprobe + ffmpeg
  rawvideo), the size-normalizing ffmpeg pass only runs when the screenshot
  size is off, and the crop moved into the encode graph.
- **Slideshow**: each still is decoded and scale+padded once and looped
  (was per frame); fades render at a true 30 fps; slide timing accounts for
  crossfade overlap so the video matches the audio; image probes run in
  parallel; dead `concat.txt` write removed. Two-pass encoding is kept: a
  1-pass test lost ~0.5 dB PSNR.

## Not changed on purpose

- Slideshow and oversized-video encodes stay 2-pass `medium` (quality).
- X encodes keep preset `veryfast` and the existing 1-pass/2-pass split.
