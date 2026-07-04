import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSlideshow } from '../../src/render/renderSlideshow.js';

function generateFixture(dir: string, width: number, height: number, audioDuration: number) {
  const imagesDir = join(dir, 'images');
  execSync(`mkdir -p ${imagesDir}`);
  for (let i = 0; i < 3; i++) {
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=1:size=${width}x${height}:rate=1 -frames:v 1 ${join(imagesDir, `slide_${String(i).padStart(3, '0')}.jpg`)}`,
      { stdio: 'ignore' },
    );
  }
  execSync(
    `ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=${audioDuration}" ${join(dir, 'audio.m4a')}`,
    { stdio: 'ignore' },
  );
}

function probe(path: string) {
  const raw = execSync(
    `ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,pix_fmt -of json ${path}`,
  );
  return JSON.parse(raw.toString());
}

describe('renderSlideshow integration', () => {
  it('renders a valid MP4 under the size cap', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tikitoki-render-int-'));
    generateFixture(dir, 1080, 1920, 6);

    const images = [
      join(dir, 'images/slide_000.jpg'),
      join(dir, 'images/slide_001.jpg'),
      join(dir, 'images/slide_002.jpg'),
    ];

    const { outputPath } = await renderSlideshow({
      jobId: 'render-int',
      images,
      audioPath: join(dir, 'audio.m4a'),
      audioDuration: 6,
      targetSizeMb: 45,
    });

    const stats = statSync(outputPath);
    const probeResult = probe(outputPath);
    const videoStream = probeResult.streams.find(
      (s: { codec_name: string }) => s.codec_name === 'h264',
    );

    expect(stats.size).toBeLessThan(45 * 1024 * 1024);
    expect(Number.parseFloat(probeResult.format.duration)).toBeCloseTo(6, 0.5);
    expect(videoStream).toBeDefined();
    expect(videoStream.pix_fmt).toContain('yuv420p');
    expect(readFileSync(outputPath).toString('binary').includes('ftyp')).toBe(true);
  }, 120_000);

  it('renders a single-slide slideshow with silent audio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tikitoki-render-int-single-'));
    const imagesDir = join(dir, 'images');
    execSync(`mkdir -p ${imagesDir}`);
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=1:size=1080x1920:rate=1 -frames:v 1 ${join(imagesDir, 'slide_000.jpg')}`,
      { stdio: 'ignore' },
    );

    const { outputPath } = await renderSlideshow({
      jobId: 'render-int-single',
      images: [join(imagesDir, 'slide_000.jpg')],
      targetSizeMb: 45,
      silentSlideSeconds: 3,
    });

    const probeResult = probe(outputPath);
    expect(Number.parseFloat(probeResult.format.duration)).toBeCloseTo(3, 0.5);
  }, 120_000);
});
