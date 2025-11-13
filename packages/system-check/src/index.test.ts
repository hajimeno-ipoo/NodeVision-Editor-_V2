import { Dirent, Stats } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  analyzeTempRoot,
  BinaryNotFoundError,
  detectFFmpeg,
  getDefaultTempRoot,
  enforceTempRoot,
  ResourceLimitError
} from './index';

const runtimeIsWindows = () => process.platform === 'win32' || process.env.NODEVISION_FORCE_WINDOWS === '1';

const createFakeBinary = async (dir: string, name: string, version: string): Promise<string> => {
  const ext = runtimeIsWindows() ? '.cmd' : '';
  const filePath = path.join(dir, `${name}${ext}`);
  const content = runtimeIsWindows()
    ? `@echo off\necho ${version}\n`
    : `#!/usr/bin/env bash\necho "${version}"\n`;
  await fs.writeFile(filePath, content, { mode: 0o755 });
  if (!runtimeIsWindows()) {
    await fs.chmod(filePath, 0o755);
  }
  return filePath;
};

describe('detectFFmpeg', () => {
  it('resolves explicit ffmpeg/ffprobe binaries and reads versions', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-test-'));
    const ffmpegPath = await createFakeBinary(tempDir, 'ffmpeg', 'ffmpeg version 7.0-test');
    const ffprobePath = await createFakeBinary(tempDir, 'ffprobe', 'ffprobe version 4.4-test');

    const result = await detectFFmpeg({ ffmpegPath, ffprobePath });

    expect(result.ffmpeg.path).toBe(ffmpegPath);
    expect(result.ffmpeg.version).toContain('7.0');
    expect(result.ffprobe.version).toContain('4.4');

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('throws a BinaryNotFoundError when binaries are missing', async () => {
    const ffmpegPath = path.join(os.tmpdir(), 'missing-ffmpeg');
    const ffprobePath = path.join(os.tmpdir(), 'missing-ffprobe');
    const originalPath = process.env.PATH;
    process.env.PATH = '';
    try {
      await expect(detectFFmpeg({ ffmpegPath, ffprobePath })).rejects.toBeInstanceOf(
        BinaryNotFoundError
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('falls back to PATH when the provided path is not executable', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-nonexec-'));
    const result = await detectFFmpeg({ ffmpegPath: tempDir, ffprobePath: tempDir });
    expect(result.ffmpeg.path).not.toBe(tempDir);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('treats Windows-specific extensions as executable when forced', async () => {
    process.env.NODEVISION_FORCE_WINDOWS = '1';
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-windows-'));
    const ffmpegPath = await createFakeBinary(tempDir, 'ffmpeg', 'ffmpeg version fake');
    const ffprobePath = await createFakeBinary(tempDir, 'ffprobe', 'ffprobe version fake');
    try {
      const result = await detectFFmpeg({ ffmpegPath, ffprobePath });
      expect(result.ffmpeg.path.endsWith('.cmd')).toBe(true);
    } finally {
      delete process.env.NODEVISION_FORCE_WINDOWS;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('handles resolution when PATH is undefined', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-nopath-'));
    const ffmpegPath = await createFakeBinary(tempDir, 'ffmpeg', 'ffmpeg version 1.0');
    const ffprobePath = await createFakeBinary(tempDir, 'ffprobe', 'ffprobe version 1.0');
    const originalPath = process.env.PATH;
    delete process.env.PATH;
    try {
      const result = await detectFFmpeg({ ffmpegPath, ffprobePath });
      expect(result.ffmpeg.path).toBe(ffmpegPath);
    } finally {
      process.env.PATH = originalPath;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null versions when binaries are silent', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-silent-'));
    const ffmpegPath = path.join(tempDir, `ffmpeg${runtimeIsWindows() ? '.cmd' : ''}`);
    const ffprobePath = await createFakeBinary(tempDir, 'ffprobe', 'ffprobe version 1.0');
    const script = runtimeIsWindows()
      ? '@echo off\n'
      : '#!/usr/bin/env bash\n';
    await fs.writeFile(ffmpegPath, script, { mode: 0o755 });
    if (!runtimeIsWindows()) {
      await fs.chmod(ffmpegPath, 0o755);
    }
    const result = await detectFFmpeg({ ffmpegPath, ffprobePath });
    expect(result.ffmpeg.version).toBeNull();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('locates binaries from PATH when no overrides are provided', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ffmpeg-path-'));
    await createFakeBinary(tempDir, 'ffmpeg', 'ffmpeg version 5.0');
    await createFakeBinary(tempDir, 'ffprobe', 'ffprobe version 5.0');
    const originalPath = process.env.PATH ?? '';
    process.env.PATH = `${tempDir}${path.delimiter}${originalPath}`;
    try {
      const result = await detectFFmpeg();
      expect(result.ffmpeg.path.startsWith(tempDir)).toBe(true);
    } finally {
      process.env.PATH = originalPath;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('temp root analysis', () => {
  it('provides a default tempRoot path helper', () => {
    const defaultRoot = getDefaultTempRoot();
    expect(defaultRoot).toContain('nodevision-temp');
  });

  it('reports usage and enforces limits', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-'));
    const sampleFile = path.join(tempRoot, 'clip.mp4');
    // 1MB file
    const buffer = Buffer.alloc(1_048_576, 1);
    await fs.writeFile(sampleFile, buffer);

    const status = await analyzeTempRoot(tempRoot, {
      maxTotalBytes: 2_000_000,
      maxSingleJobBytes: 900_000
    });

    expect(status.totalBytes).toBeGreaterThan(1_000_000);
    expect(status.overTotalLimit).toBe(false);
    expect(status.overSingleJobLimit).toBe(true);
    expect(status.entries).toHaveLength(1);
    expect(status.entries[0]?.path).toBe(sampleFile);
    expect(status.deletedEntries).toEqual([]);

    await expect(
      enforceTempRoot(tempRoot, { maxTotalBytes: 500_000, maxSingleJobBytes: 500_000 })
    ).rejects.toBeInstanceOf(ResourceLimitError);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('handles nested directories and passes enforcement when under limits', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-nested-'));
    const nested = path.join(tempRoot, 'job-1');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, 'frame.bin'), Buffer.alloc(256_000, 2));

    const status = await analyzeTempRoot(tempRoot, {
      maxTotalBytes: 5_000_000,
      maxSingleJobBytes: 5_000_000
    });
    expect(status.largestEntryPath?.endsWith('job-1')).toBe(true);

    const enforceResult = await enforceTempRoot(tempRoot, {
      maxTotalBytes: 5_000_000,
      maxSingleJobBytes: 5_000_000
    });
    expect(enforceResult.overTotalLimit).toBe(false);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('propagates directory read errors', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-error-'));
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const spy = vi.spyOn(fs, 'readdir').mockRejectedValue(error);

    await expect(analyzeTempRoot(tempRoot)).rejects.toThrow('permission denied');

    spy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns zero usage when the directory vanishes (ENOENT)', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-missing-'));
    const error = Object.assign(new Error('gone'), { code: 'ENOENT' });
    const spy = vi.spyOn(fs, 'readdir').mockRejectedValue(error);

    const status = await analyzeTempRoot(tempRoot);
    expect(status.totalBytes).toBe(0);

    spy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('prunes least recently used directories when total usage exceeds the limit', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-prune-'));
    const jobs = ['job-a', 'job-b', 'job-c'];
    const sizes = [300, 300, 300];
    const now = Date.now();

    for (let i = 0; i < jobs.length; i++) {
      const dir = path.join(tempRoot, jobs[i]!);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'payload.bin'), Buffer.alloc(sizes[i]!, i + 1));
      const when = new Date(now - (i + 1) * 10_000);
      await fs.utimes(dir, when, when);
    }

    const initialStatus = await analyzeTempRoot(tempRoot, {
      maxTotalBytes: 600,
      maxSingleJobBytes: 400
    });
    const oldestEntry = [...initialStatus.entries].sort((a, b) => a.mtimeMs - b.mtimeMs)[0];

    const status = await enforceTempRoot(tempRoot, {
      maxTotalBytes: 600,
      maxSingleJobBytes: 400
    });

    expect(status.totalBytes).toBeLessThanOrEqual(600);
    expect(status.deletedEntries).toHaveLength(1);
    expect(status.deletedEntries[0]).toBe(oldestEntry?.path);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('respects protectedEntries during pruning', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-protected-'));
    const jobSafe = path.join(tempRoot, 'job-safe');
    const jobOld = path.join(tempRoot, 'job-old');
    await fs.mkdir(jobSafe, { recursive: true });
    await fs.mkdir(jobOld, { recursive: true });
    await fs.writeFile(path.join(jobSafe, 'a.bin'), Buffer.alloc(400, 1));
    await fs.writeFile(path.join(jobOld, 'b.bin'), Buffer.alloc(400, 1));
    await fs.utimes(jobOld, new Date(Date.now() - 50_000), new Date(Date.now() - 50_000));

    const status = await enforceTempRoot(tempRoot, {
      maxTotalBytes: 600,
      maxSingleJobBytes: 800,
      protectedEntries: [jobSafe]
    });

    expect(status.deletedEntries).toHaveLength(1);
    expect(status.deletedEntries[0]).toBe(jobOld);
    const remaining = status.entries.map(entry => entry.path);
    expect(remaining).toContain(jobSafe);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('skips entries that vanish between readdir and stat', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-vanish-'));
    const ghost = path.join(tempRoot, 'ghost.bin');
    await fs.writeFile(ghost, Buffer.alloc(4));

    const originalStat = fs.stat;
    const err = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const statSpy = vi.spyOn(fs, 'stat');
    statSpy.mockRejectedValueOnce(err);
    statSpy.mockImplementation(originalStat);

    const status = await analyzeTempRoot(tempRoot);
    expect(status.entries).toHaveLength(0);

    statSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('propagates stat errors other than ENOENT', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-stat-error-'));
    const blocker = path.join(tempRoot, 'blocker.bin');
    await fs.writeFile(blocker, Buffer.alloc(1));
    const originalStat = fs.stat;
    const err = Object.assign(new Error('stat denied'), { code: 'EACCES' });
    const statSpy = vi.spyOn(fs, 'stat');
    statSpy.mockRejectedValueOnce(err);
    statSpy.mockImplementation(originalStat);

    await expect(analyzeTempRoot(tempRoot)).rejects.toThrow('stat denied');

    statSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('ignores entries that are not files nor directories', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-special-'));
    const dirent = {
      name: 'sock',
      isDirectory: () => false,
      isFile: () => false
    } as unknown as Dirent;
    const readdirSpy = vi.spyOn(fs, 'readdir').mockResolvedValueOnce([dirent]);
    const statSpy = vi.spyOn(fs, 'stat').mockResolvedValue({ size: 0, mtimeMs: Date.now() } as Stats);

    const status = await analyzeTempRoot(tempRoot);
    expect(status.entries).toHaveLength(0);

    readdirSpy.mockRestore();
    statSpy.mockRestore();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('recursively sums nested directories', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-nested-dir-'));
    const parent = path.join(tempRoot, 'job-nested');
    const child = path.join(parent, 'frames');
    await fs.mkdir(child, { recursive: true });
    await fs.writeFile(path.join(child, 'frame.bin'), Buffer.alloc(64, 1));

    const status = await analyzeTempRoot(tempRoot);
    expect(status.totalBytes).toBe(64);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('throws when prune cannot reduce usage because all entries are protected', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'temp-root-locked-'));
    const jobSafe = path.join(tempRoot, 'job-safe');
    const jobLocked = path.join(tempRoot, 'job-locked');
    await fs.mkdir(jobSafe, { recursive: true });
    await fs.mkdir(jobLocked, { recursive: true });
    await fs.writeFile(path.join(jobSafe, 'a.bin'), Buffer.alloc(400, 1));
    await fs.writeFile(path.join(jobLocked, 'b.bin'), Buffer.alloc(400, 1));

    await expect(
      enforceTempRoot(tempRoot, {
        maxTotalBytes: 300,
        maxSingleJobBytes: 800,
        protectedEntries: [jobSafe, jobLocked]
      })
    ).rejects.toBeInstanceOf(ResourceLimitError);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
