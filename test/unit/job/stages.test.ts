import { describe, expect, it, vi } from 'vitest';
import { createStageUpdater } from '../../../src/job/stages.js';

describe('createStageUpdater', () => {
  it('edits the placeholder for a new stage', async () => {
    const edit = vi.fn().mockResolvedValue(undefined);
    const updater = createStageUpdater(edit);

    await updater.update('Fetching');
    // Give the immediate flush a tick.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(edit).toHaveBeenCalledWith('Stage: Fetching');
  });

  it('dedupes repeated stages', async () => {
    const edit = vi.fn().mockResolvedValue(undefined);
    const updater = createStageUpdater(edit);

    await updater.update('Fetching');
    await updater.update('Fetching');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(edit).toHaveBeenCalledTimes(1);
  });
});
