import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { concatFilePath, writeConcatFile } from '../../../src/render/concatDemuxer.js';

describe('writeConcatFile', () => {
  it('writes ordered image paths for the concat demuxer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tikitoki-test-'));
    const outPath = join(dir, 'concat.txt');
    const images = ['/tmp/a.jpg', '/tmp/b.jpg', '/tmp/c.jpg'];
    writeConcatFile(images, outPath);
    const content = readFileSync(outPath, 'utf8');
    expect(content).toContain("file '/tmp/a.jpg'");
    expect(content).toContain("file '/tmp/b.jpg'");
    expect(content).toContain("file '/tmp/c.jpg'");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('concatFilePath', () => {
  it('returns concat.txt inside the job dir', () => {
    expect(concatFilePath('/tmp/job-1')).toBe('/tmp/job-1/concat.txt');
  });
});
