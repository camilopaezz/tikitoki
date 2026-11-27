import { describe, expect, it, vi } from 'vitest';

const runFfmpeg = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
vi.mock('../../../src/process/ffmpeg.js', () => ({
  runFfmpeg: (...args: unknown[]) => runFfmpeg(...args),
}));

import { makeStickerVideo, stickerArgs, stickerFilter } from '../../../src/render/sticker.js';

describe('stickerFilter', () => {
  it('fits inside 512x512 with black bars', () => {
    expect(stickerFilter()).toBe(
      'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
    );
  });
});

describe('stickerArgs', () => {
  it('encodes a silent, gallery-friendly H.264 MP4', () => {
    const args = stickerArgs('/in.mp4', '/out.mp4');
    expect(args).toEqual(expect.arrayContaining(['-an', '-c:v', 'libx264', '/out.mp4']));
    expect(args[args.indexOf('-pix_fmt') + 1]).toBe('yuv420p');
  });
});

describe('makeStickerVideo', () => {
  it('writes sticker.mp4 in the job directory', async () => {
    await expect(makeStickerVideo('/in.mp4', '/job', 'j1')).resolves.toBe('/job/sticker.mp4');
    expect(runFfmpeg).toHaveBeenCalledWith(stickerArgs('/in.mp4', '/job/sticker.mp4'), {
      jobId: 'j1',
    });
  });
});
