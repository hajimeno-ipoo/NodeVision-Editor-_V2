import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inspectConcat, isNetworkPath, buildConcatFailure, ratioToNumber, parseRatio } from './concat';
import type { InspectConcatRequest } from './types';

vi.mock('execa', () => ({
  execa: vi.fn()
}));

import { execa } from 'execa';

const execaMock = vi.mocked(execa);

const createTempDir = async (): Promise<string> => fs.mkdtemp(path.join(os.tmpdir(), 'inspect-test-'));

const writeTempFile = async (dir: string, fileName: string): Promise<string> => {
  const target = path.join(dir, fileName);
  await fs.writeFile(target, 'dummy');
  return target;
};

const mockProbeSequence = (...clips: Array<{ fps: string; width?: number; height?: number; pix_fmt?: string; codec?: string; sar?: string; duration?: string; bitrate?: string }>) => {
  execaMock.mockReset();
  for (const clip of clips) {
    execaMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        streams: [
          {
            width: clip.width ?? 1920,
            height: clip.height ?? 1080,
            pix_fmt: clip.pix_fmt ?? 'yuv420p',
            codec_name: clip.codec ?? 'h264',
            sample_aspect_ratio: clip.sar ?? '1:1',
            avg_frame_rate: clip.fps
          }
        ],
        format: {
          duration: clip.duration ?? '10.0',
          bit_rate: clip.bitrate ?? '8000000'
        }
      })
    } as never);
  }
};

describe('concat helpers', () => {
  it('identifies network paths', () => {
    expect(isNetworkPath('')).toBe(false);
    expect(isNetworkPath(String.raw`\\server\share\a.mp4`)).toBe(true);
    const failure = buildConcatFailure('UNKNOWN', null);
    expect(failure.message).toBe('inspect concat failed');
    expect(ratioToNumber({ num: 1, den: 2 })).toBeCloseTo(0.5);
    expect(ratioToNumber({ num: 1, den: 0 })).toBeNull();
    expect(parseRatio('3/2')).toEqual({ num: 3, den: 2 });
    expect(parseRatio(null)).toBeNull();
  });
});

describe('inspectConcat', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    execaMock.mockReset();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    execaMock.mockReset();
  });

  it('returns ok when clips match', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    mockProbeSequence({ fps: '30/1' }, { fps: '30/1' });

    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileB }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.ok).toBe(true);
    expect(result.canConcat).toBe(true);
    expect(result.details).toHaveLength(2);
    expect(execaMock).toHaveBeenCalledTimes(2);
  });

  it('flags mismatched fps with E2001', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    mockProbeSequence({ fps: '30/1' }, { fps: '29/1' });

    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileB }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.ok).toBe(true);
    expect(result.canConcat).toBe(false);
    expect(result.error?.code).toBe('E2001');
    expect(result.equality?.fps).toBe(false);
  });

  it('captures resolution mismatch metadata', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    mockProbeSequence({ fps: '30/1', width: 1920, height: 1080 }, { fps: '30/1', width: 1280, height: 720 });

    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileB }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.error?.meta).toMatchObject({ resolution: ['1920x1080', '1280x720'] });
  });

  it('captures pix_fmt mismatch metadata', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    mockProbeSequence({ fps: '30/1', pix_fmt: 'yuv420p' }, { fps: '30/1', pix_fmt: 'yuv422p' });

    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileB }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.error?.meta).toMatchObject({ pix_fmt: ['yuv420p', 'yuv422p'] });
  });

  it('returns E2002 when clip count is below minimum', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const result = await inspectConcat(
      { clips: [{ path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E2002');
  });

  it('returns E2006 when clip count exceeds max', async () => {
    const clips: InspectConcatRequest['clips'] = Array.from({ length: 40 }, () => ({
      path: path.join(tempDir, 'clip-a.mp4')
    }));
    const result = await inspectConcat(
      { clips },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('E2006');
  });

  it('rejects unsupported extensions', async () => {
    const bad = await writeTempFile(tempDir, 'clip-a.gif');
    const result = await inspectConcat(
      { clips: [{ path: bad }, { path: bad }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.code).toBe('E1005');
  });

  it('rejects UNC style paths', async () => {
    const uncPathA = String.raw`\\server\share\a.mp4`;
    const uncPathB = String.raw`\\server\share\b.mp4`;
    const result = await inspectConcat(
      { clips: [{ path: uncPathA }, { path: uncPathB }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.code).toBe('E1002');
    expect(result.error?.meta).toMatchObject({ reason: 'unc_path' });
  });

  it('rejects empty clip paths', async () => {
    const result = await inspectConcat(
      { clips: [{ path: '' }, { path: '' }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.meta).toMatchObject({ reason: 'empty_path' });
  });

  it('handles requests without clips arrays', async () => {
    const result = await inspectConcat({} as InspectConcatRequest, { ffprobePath: '/usr/bin/ffprobe' });
    expect(result.error?.code).toBe('E2002');
  });

  it('rejects symlinks', async () => {
    const original = await writeTempFile(tempDir, 'clip-a.mp4');
    const linkPath = path.join(tempDir, 'alias.mp4');
    await fs.symlink(original, linkPath);
    const result = await inspectConcat(
      { clips: [{ path: linkPath }, { path: linkPath }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.code).toBe('E1002');
    expect(result.error?.meta).toMatchObject({ reason: 'symlink' });
  });

  it('rejects directories instead of files', async () => {
    const dirPath = path.join(tempDir, 'clips.mp4');
    await fs.mkdir(dirPath, { recursive: true });
    const result = await inspectConcat(
      { clips: [{ path: dirPath }, { path: dirPath }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.meta).toMatchObject({ reason: 'not_file' });
  });

  it('surfaces permission errors as E1003', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const spy = vi.spyOn(fs, 'access').mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    spy.mockRestore();
    expect(result.error?.code).toBe('E1003');
  });

  it('handles disappearing files during access checks', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const spy = vi.spyOn(fs, 'access').mockRejectedValueOnce(
      Object.assign(new Error('gone'), { code: 'ENOENT' })
    );
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    spy.mockRestore();
    expect(result.error?.meta).toMatchObject({ reason: 'not_found' });
  });

  it('propagates unexpected fs.access errors', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const spy = vi.spyOn(fs, 'access').mockRejectedValueOnce(
      Object.assign(new Error('busy'), { code: 'EBUSY' })
    );
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    spy.mockRestore();
    expect(result.error?.code).toBe('E1004');
    expect(result.error?.meta).toMatchObject({ reason: 'unexpected_error' });
  });

  it('fails when lstat cannot find the file', async () => {
    const missing = path.join(tempDir, 'missing.mp4');
    const result = await inspectConcat(
      { clips: [{ path: missing }, { path: missing }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.meta).toMatchObject({ reason: 'not_found' });
  });

  it('applies custom fps tolerance overrides', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    mockProbeSequence({ fps: '30/1' }, { fps: '29/1' });

    const result = await inspectConcat(
      {
        clips: [{ path: fileA }, { path: fileB }],
        options: { fpsTolerance: 2 }
      },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.ok).toBe(true);
    expect(result.equality?.fps).toBe(true);
  });

  it('honors maxClips override from options', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe', maxClips: 1 }
    );
    expect(result.error?.code).toBe('E2006');
  });

  it('wraps unexpected errors into E1004', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const failingFs = {
      ...fs,
      lstat: vi.fn().mockRejectedValue('boom')
    } as unknown as typeof fs;

    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe', fs: failingFs }
    );

    expect(result.error?.code).toBe('E1004');
    expect(result.error?.meta).toMatchObject({ reason: 'unexpected_error' });
  });

  it('fails when ffprobe returns no usable stream', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    execaMock.mockResolvedValueOnce({ stdout: JSON.stringify({ streams: [{}], format: {} }) });
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.code).toBe('E1004');
    expect(result.error?.meta).toMatchObject({ reason: 'missing_stream' });
  });

  it('falls back to r_frame_rate when avg value is missing', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const payload = {
      stdout: JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
            pix_fmt: 'yuv420p'
          }
        ],
        format: {}
      })
    };
    execaMock.mockResolvedValueOnce(payload as never);
    execaMock.mockResolvedValueOnce(payload as never);
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.ok).toBe(true);
  });

  it('defaults pix_fmt metadata to null when missing', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const payload = {
      stdout: JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            avg_frame_rate: '30/1'
          }
        ],
        format: {}
      })
    };
    execaMock.mockResolvedValueOnce(payload as never);
    execaMock.mockResolvedValueOnce(payload as never);
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.details?.[0]?.pix_fmt).toBeNull();
  });

  it('skips sar metadata when parsing fails', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    execaMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            avg_frame_rate: '30/1',
            sample_aspect_ratio: 'bad'
          }
        ],
        format: {}
      })
    });
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }], options: { include: ['sar'] } },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.details?.[0]?.sar).toBeUndefined();
  });

  it('skips invalid duration metadata', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    execaMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            avg_frame_rate: '30/1'
          }
        ],
        format: { duration: 'oops' }
      })
    });
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }], options: { include: ['duration'] } },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.details?.[0]?.duration_ms).toBeUndefined();
  });

  it('skips invalid bitrate metadata', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    execaMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            avg_frame_rate: '30/1'
          }
        ],
        format: { bit_rate: 'oops' }
      })
    });
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }], options: { include: ['bitrate'] } },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.details?.[0]?.bitrate_bps).toBeUndefined();
  });

  it('defaults codec metadata to null when missing', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const payload = {
      stdout: JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            avg_frame_rate: '30/1'
          }
        ],
        format: {}
      })
    };
    execaMock.mockResolvedValueOnce(payload as never);
    execaMock.mockResolvedValueOnce(payload as never);
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }], options: { include: ['vcodec'] } },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.details?.[0]?.vcodec).toBeNull();
  });

  it('handles ffprobe errors without stderr', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    execaMock.mockRejectedValueOnce({});
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileB }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.code).toBe('E1004');
  });

  it('fails when fps cannot be parsed', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    execaMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        streams: [
          {
            width: 1920,
            height: 1080,
            pix_fmt: 'yuv420p',
            avg_frame_rate: '0/0'
          }
        ],
        format: {}
      })
    });

    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.error?.code).toBe('E1004');
    expect(result.error?.meta).toMatchObject({ reason: 'invalid_fps' });
  });

  it('requires an ffprobe path', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '' }
    );
    expect(result.error?.code).toBe('E1001');
  });

  it('fails when ffprobe stdout cannot be parsed', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    execaMock.mockResolvedValueOnce({ stdout: '{"broken":' });
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileA }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.code).toBe('E1004');
    expect(result.error?.meta).toMatchObject({ reason: 'invalid_json' });
  });

  it('propagates ffprobe failures as E1004', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    execaMock.mockRejectedValueOnce({ timedOut: true, stderr: 'boom' });
    const result = await inspectConcat(
      { clips: [{ path: fileA }, { path: fileB }] },
      { ffprobePath: '/usr/bin/ffprobe' }
    );
    expect(result.error?.code).toBe('E1004');
    expect(result.error?.meta).toMatchObject({ timedOut: true });
  });

  it('includes optional metadata when requested', async () => {
    const fileA = await writeTempFile(tempDir, 'clip-a.mp4');
    const fileB = await writeTempFile(tempDir, 'clip-b.mp4');
    mockProbeSequence({ fps: '30000/1001', sar: '4:3', duration: '12.5', bitrate: '1234567', codec: 'hevc' }, { fps: '30000/1001', sar: '4:3', duration: '12.5', bitrate: '1234567', codec: 'hevc' });

    const result = await inspectConcat(
      {
        clips: [{ path: fileA }, { path: fileB }],
        options: {
          include: ['fps_rational', 'sar', 'duration', 'bitrate', 'vcodec']
        }
      },
      { ffprobePath: '/usr/bin/ffprobe' }
    );

    expect(result.details?.[0]?.fps_rational).toEqual({ num: 30000, den: 1001 });
    expect(result.details?.[0]?.sar).toEqual({ num: 4, den: 3 });
    expect(result.details?.[0]?.duration_ms).toBe(12500);
    expect(result.details?.[0]?.bitrate_bps).toBe(1234567);
    expect(result.details?.[0]?.vcodec).toBe('hevc');
  });
});
