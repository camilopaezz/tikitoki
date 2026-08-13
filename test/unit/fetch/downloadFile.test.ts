import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from '../../../src/fetch/downloadFile.js';

function fakeResponse(
  body: Buffer,
  opts: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  const status = opts.status ?? 200;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });
  return {
    ok: opts.ok ?? (status >= 200 && status < 300),
    status,
    statusText: opts.statusText ?? '',
    body: stream,
  };
}

describe('downloadFile', () => {
  let outDir: string;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'dl-file-'));
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    rmSync(outDir, { recursive: true, force: true });
  });

  it('retries once on fetch failed (network) then succeeds', async () => {
    const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed', { cause }))
      .mockResolvedValueOnce(fakeResponse(Buffer.from('ok-body')));

    const dest = join(outDir, 'slide.jpg');
    const promise = downloadFile('https://cdn.example/a.jpg', dest, { jobId: 'j1' });
    await vi.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readFileSync(dest, 'utf8')).toBe('ok-body');
  });

  it('retries once on HTTP 429 then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        fakeResponse(Buffer.from(''), { status: 429, statusText: 'Too Many Requests' }),
      )
      .mockResolvedValueOnce(fakeResponse(Buffer.from('ok-body')));

    const dest = join(outDir, 'slide.jpg');
    const promise = downloadFile('https://cdn.example/a.jpg', dest);
    await vi.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readFileSync(dest, 'utf8')).toBe('ok-body');
  });

  it('does not retry HTTP 403', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(Buffer.from(''), { status: 403, statusText: 'Forbidden' }),
    );

    const dest = join(outDir, 'slide.jpg');
    await expect(downloadFile('https://cdn.example/a.jpg', dest)).rejects.toThrow(/403/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry HTTP 404', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(Buffer.from(''), { status: 404, statusText: 'Not Found' }),
    );

    const dest = join(outDir, 'slide.jpg');
    await expect(downloadFile('https://cdn.example/a.jpg', dest)).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
