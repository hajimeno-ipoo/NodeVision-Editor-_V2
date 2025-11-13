import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { TempRootManager } from './temp-root-manager';

const createStatus = () => ({
  tempRoot: '/tmp/nodevision',
  totalBytes: 0,
  largestEntryBytes: 0,
  largestEntryPath: null,
  maxTotalBytes: 1_000,
  maxSingleJobBytes: 500,
  overTotalLimit: false,
  overSingleJobLimit: false,
  entries: [],
  deletedEntries: []
});

describe('TempRootManager', () => {
  it('protects active job directories when enforcing limits', async () => {
    const enforce = vi.fn().mockResolvedValue(createStatus());
    const ensure = vi.fn().mockResolvedValue('/tmp/nodevision');
    const mkdirSpy = vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined as never);

    const manager = new TempRootManager(
      { tempRoot: '/tmp/nodevision', maxTotalBytes: 999, maxSingleJobBytes: 777 },
      { enforce, ensure }
    );

    await manager.init();
    expect(ensure).toHaveBeenCalledWith('/tmp/nodevision');

    await manager.reserve('job-a');
    expect(enforce).toHaveBeenLastCalledWith('/tmp/nodevision', {
      maxTotalBytes: 999,
      maxSingleJobBytes: 777,
      protectedEntries: [path.join('/tmp/nodevision', 'job-a')]
    });

    await manager.reserve('job-b');
    expect(enforce).toHaveBeenLastCalledWith('/tmp/nodevision', {
      maxTotalBytes: 999,
      maxSingleJobBytes: 777,
      protectedEntries: [
        path.join('/tmp/nodevision', 'job-a'),
        path.join('/tmp/nodevision', 'job-b')
      ]
    });

    await manager.release('job-a');
    expect(enforce).toHaveBeenLastCalledWith('/tmp/nodevision', {
      maxTotalBytes: 999,
      maxSingleJobBytes: 777,
      protectedEntries: [path.join('/tmp/nodevision', 'job-b')]
    });

    expect(manager.listActiveJobs()).toEqual(['job-b']);

    mkdirSpy.mockRestore();
  });

  it('works with the default ensure/enforce implementations', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-manager-real-'));
    const manager = new TempRootManager({ tempRoot });

    await manager.init();
    const jobPath = await manager.reserve('job-real');
    expect(jobPath).toContain('job-real');

    await fs.writeFile(path.join(jobPath, 'chunk.bin'), Buffer.alloc(16, 1));
    await manager.release('job-real');
    expect(manager.listActiveJobs()).toEqual([]);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
