import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runJobLifecycle } from '../../../src/job/lifecycle.js';

describe('runJobLifecycle', () => {
  it('runs the worker and cleans up the temp dir on success', async () => {
    const worker = vi.fn().mockResolvedValue({ outputPath: '/tmp/out.mp4' });
    const onStage = vi.fn().mockResolvedValue(undefined);

    const result = await runJobLifecycle({
      userId: 42,
      url: 'http://example.com',
      worker,
      onStage,
    });

    expect(worker).toHaveBeenCalled();
    expect(result.result.outputPath).toBe('/tmp/out.mp4');
    const jobDir = join(tmpdir(), 'tikitoki', result.jobId);
    expect(existsSync(jobDir)).toBe(false);
  });

  it('keeps the temp dir available until delivery completes', async () => {
    let deliverySawFile = false;
    const worker = vi.fn().mockImplementation((job) => {
      const outputPath = join(tmpdir(), 'tikitoki', job.jobId, 'out.mp4');
      writeFileSync(outputPath, 'video');
      return { outputPath };
    });
    const deliver = vi.fn().mockImplementation(async (result) => {
      deliverySawFile = existsSync(result.outputPath);
    });

    const result = await runJobLifecycle({
      userId: 42,
      url: 'http://example.com',
      worker,
      deliver,
    });

    expect(deliver).toHaveBeenCalled();
    expect(deliverySawFile).toBe(true);
    expect(existsSync(join(tmpdir(), 'tikitoki', result.jobId))).toBe(false);
  });

  it('cleans up the temp dir when the worker throws', async () => {
    const worker = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      runJobLifecycle({ userId: 42, url: 'http://example.com', worker }),
    ).rejects.toThrow('boom');
  });
});
