import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runFfmpeg } from '../../src/process/ffmpeg.js';
import { runProcess } from '../../src/process/run.js';
import { fitVideoToSize } from '../../src/render/fitVideoToSize.js';

describe('video compression integration', () => {
  it.each([
    { size: '640x360', audio: true, rotation: 0, maxSizeMb: 0.12, aspect: 16 / 9 },
    { size: '360x640', audio: false, rotation: 0, maxSizeMb: 0.12, aspect: 9 / 16 },
    { size: '640x360', audio: false, rotation: 90, maxSizeMb: 0.6, aspect: 9 / 16 },
  ])(
    'fits a $size video with audio=$audio and rotation=$rotation under the cap without truncating',
    async ({ size, audio, rotation, maxSizeMb, aspect }) => {
      const dir = mkdtempSync(join(tmpdir(), 'tikitoki-compress-'));
      try {
        let input = join(dir, 'out.mp4');
        await runFfmpeg([
          '-y',
          '-f',
          'lavfi',
          '-i',
          `testsrc2=size=${size}:rate=30:duration=4`,
          ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4'] : []),
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '12',
          ...(audio ? ['-c:a', 'aac'] : []),
          input,
        ]);
        if (rotation) {
          const rotated = join(dir, 'rotated.mp4');
          await runFfmpeg([
            '-y',
            '-display_rotation',
            String(rotation),
            '-i',
            input,
            '-c',
            'copy',
            rotated,
          ]);
          input = rotated;
        }
        expect(statSync(input).size).toBeGreaterThan(maxSizeMb * 1024 * 1024);
        const output = await fitVideoToSize(input, maxSizeMb);
        expect(output).not.toBe(input);
        expect(statSync(output).size).toBeLessThanOrEqual(maxSizeMb * 1024 * 1024);
        const { stdout } = await runProcess('ffprobe', [
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          output,
        ]);
        const result = JSON.parse(stdout);
        expect(Number(result.format.duration)).toBeCloseTo(4, 1);
        const video = result.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
        expect(video.codec_name).toBe('h264');
        expect(video.pix_fmt).toBe('yuv420p');
        expect(video.width % 2).toBe(0);
        expect(video.height % 2).toBe(0);
        expect(video.width / video.height).toBeCloseTo(aspect, 1);
        if (rotation) {
          // Enough bitrate for the source pixels: rotation must not shrink the display box.
          expect(video.width).toBe(360);
          expect(video.height).toBe(640);
        }
        const sound = result.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
        if (audio) expect(sound.codec_name).toBe('aac');
        else expect(sound).toBeUndefined();
        expect(await fitVideoToSize(output, maxSizeMb)).toBe(output);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
