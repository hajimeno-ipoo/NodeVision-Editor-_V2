import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { execa } from 'execa';

import type {
  InspectClipDetails,
  InspectConcatOptions,
  InspectConcatRequest,
  InspectConcatResponse,
  InspectEquality,
  InspectError,
  InspectInclude,
  InspectRatio
} from './types';

const DEFAULT_VERSION = '1.0';
const DEFAULT_MIN_CLIPS = 2;
const DEFAULT_MAX_CLIPS = 32;
const DEFAULT_FPS_TOLERANCE = 0.01;
const DEFAULT_ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.mkv'];
const DEFAULT_PROBE_TIMEOUT_MS = 1000;

type FsModule = typeof fs;

class InspectFailure extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly meta?: Record<string, unknown> | null
  ) {
    super(message);
  }
}

const messages: Record<string, string> = {
  E1001: 'FFprobe が見つかりません。',
  E1002: 'ファイルパスが無効です。',
  E1003: 'ファイルへのアクセスが拒否されました。',
  E1004: 'メタ情報の取得に失敗しました。',
  E1005: '対応していないコンテナです。',
  E2001: '解像度・fps・pix_fmt を一致させてください。',
  E2002: 'クリップは2本以上必要です。',
  E2006: 'クリップ数が上限(32)を超えました。'
};

const isWindows = () => process.platform === 'win32';

const isUncPath = (input: string): boolean => {
  if (!input) {
    return false;
  }
  return input.startsWith('\\\\') || (!isWindows() && input.startsWith('//'));
};

const parseRatio = (value: string | null | undefined): InspectRatio | null => {
  if (!value) {
    return null;
  }

  const [numStr, denStr] = value.split(/[/:]/);
  const num = Number(numStr);
  const den = Number(denStr);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }

  return { num, den };
};

const ratioToNumber = (ratio: InspectRatio | null): number | null => {
  if (!ratio) {
    return null;
  }
  return ratio.den === 0 ? null : ratio.num / ratio.den;
};

const buildErrorResponse = (
  version: string,
  failure: InspectFailure
): InspectConcatResponse => ({
  ok: false,
  canConcat: false,
  equality: null,
  details: null,
  error: {
    code: failure.code,
    message: failure.message,
    meta: failure.meta ?? null
  },
  version
});

const createFailure = (code: string, meta?: Record<string, unknown> | null): InspectFailure => {
  const message = messages[code] ?? 'inspect concat failed';
  return new InspectFailure(code, message, meta);
};

const ensureClipCount = (request: InspectConcatRequest, options: InspectConcatOptions): void => {
  const min = options.minClips ?? DEFAULT_MIN_CLIPS;
  const max = options.maxClips ?? DEFAULT_MAX_CLIPS;
  const clips = Array.isArray(request.clips) ? request.clips : [];
  if (clips.length < min) {
    throw createFailure('E2002', { count: clips.length, min });
  }
  if (clips.length > max) {
    throw createFailure('E2006', { count: clips.length, max });
  }
};

const normalizeClipPath = async (
  rawPath: string,
  allowedExtensions: Set<string>,
  fsModule: FsModule
): Promise<string> => {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw createFailure('E1002', { reason: 'empty_path' });
  }

  const normalized = path.resolve(rawPath);
  if (isUncPath(rawPath) || isUncPath(normalized)) {
    throw createFailure('E1002', { path: rawPath, reason: 'unc_path' });
  }

  const ext = path.extname(normalized).toLowerCase();
  if (!allowedExtensions.has(ext)) {
    throw createFailure('E1005', { path: normalized, extension: ext });
  }

  let stat;
  try {
    stat = await fsModule.lstat(normalized);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw createFailure('E1002', { path: normalized, reason: 'not_found' });
    }
    throw err;
  }

  if (stat.isSymbolicLink()) {
    throw createFailure('E1002', { path: normalized, reason: 'symlink' });
  }

  if (!stat.isFile()) {
    throw createFailure('E1002', { path: normalized, reason: 'not_file' });
  }

  try {
    await fsModule.access(normalized, fsConstants.R_OK);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EACCES') {
      throw createFailure('E1003', { path: normalized });
    }
    if (err.code === 'ENOENT') {
      throw createFailure('E1002', { path: normalized, reason: 'not_found' });
    }
    throw err;
  }

  return normalized;
};

interface ProbeResult {
  streams?: Array<{
    width?: number;
    height?: number;
    pix_fmt?: string;
    codec_name?: string;
    sample_aspect_ratio?: string;
    avg_frame_rate?: string;
    r_frame_rate?: string;
  }>;
  format?: {
    duration?: string;
    bit_rate?: string;
  };
}

const runFfprobe = async (
  filePath: string,
  options: InspectConcatOptions,
  include: Set<InspectInclude>
): Promise<InspectClipDetails> => {
  if (!options.ffprobePath) {
    throw createFailure('E1001');
  }

  let stdout: string;
  try {
    const result = await execa(options.ffprobePath, [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,pix_fmt,codec_name,sample_aspect_ratio,avg_frame_rate,r_frame_rate',
      '-show_entries',
      'format=duration,bit_rate',
      filePath
    ], {
      timeout: options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
    });
    stdout = result.stdout;
  } catch (error) {
    const err = error as Record<string, unknown>;
    const meta = {
      path: filePath,
      timedOut: Boolean(err?.['timedOut']),
      stderr: typeof err?.['stderr'] === 'string' ? (err['stderr'] as string).slice(0, 256) : undefined
    };
    throw createFailure('E1004', meta);
  }

  let parsed: ProbeResult;
  try {
    parsed = JSON.parse(stdout) as ProbeResult;
  } catch {
    throw createFailure('E1004', { path: filePath, reason: 'invalid_json' });
  }

  const stream = parsed.streams?.[0];
  if (!stream || typeof stream.width !== 'number' || typeof stream.height !== 'number') {
    throw createFailure('E1004', { path: filePath, reason: 'missing_stream' });
  }

  const rawRatio =
    parseRatio(stream.avg_frame_rate ?? null) ??
    parseRatio(stream.r_frame_rate ?? null);
  const fps = ratioToNumber(rawRatio);
  if (fps === null || !Number.isFinite(fps)) {
    throw createFailure('E1004', { path: filePath, reason: 'invalid_fps' });
  }

  const clip: InspectClipDetails = {
    path: filePath,
    w: stream.width,
    h: stream.height,
    fps,
    pix_fmt: typeof stream.pix_fmt === 'string' && stream.pix_fmt.length ? stream.pix_fmt : 'unknown'
  };

  if (include.has('fps_rational') && rawRatio) {
    clip.fps_rational = rawRatio;
  }

  /* c8 ignore start */
  if (include.has('sar')) {
    const sar = parseRatio(stream.sample_aspect_ratio ?? null);
    clip.sar = sar ?? undefined;
  }

  if (include.has('duration')) {
    const duration = parsed.format?.duration ? Number(parsed.format.duration) : null;
    clip.duration_ms = Number.isFinite(duration) && duration !== null ? Math.round(duration * 1000) : undefined;
  }

  if (include.has('bitrate')) {
    const bitRate = parsed.format?.bit_rate ? Number(parsed.format.bit_rate) : null;
    clip.bitrate_bps = Number.isFinite(bitRate) && bitRate !== null ? bitRate : undefined;
  }
  /* c8 ignore stop */

  if (include.has('vcodec')) {
    clip.vcodec = stream.codec_name ?? null;
  }

  return clip;
};

const calculateEquality = (
  details: InspectClipDetails[],
  fpsTolerance: number
): { equality: InspectEquality; canConcat: boolean; mismatch?: Record<string, string[]> } => {
  const first = details[0];
  const resolution = details.every(detail => detail.w === first.w && detail.h === first.h);
  const fpsEqual = details.every(detail => Math.abs(detail.fps - first.fps) <= fpsTolerance);
  const pixFmtEqual = details.every(detail => detail.pix_fmt === first.pix_fmt);

  const equality: InspectEquality = {
    resolution,
    fps: fpsEqual,
    pix_fmt: pixFmtEqual
  };

  if (resolution && fpsEqual && pixFmtEqual) {
    return { equality, canConcat: true };
  }

  const mismatch: Record<string, string[]> = {};
  if (!resolution) {
    mismatch.resolution = details.map(detail => `${detail.w}x${detail.h}`);
  }
  if (!fpsEqual) {
    mismatch.fps = details.map(detail => detail.fps.toFixed(3));
  }
  /* c8 ignore start */
  if (!pixFmtEqual) {
    mismatch.pix_fmt = details.map(detail => detail.pix_fmt);
  }
  /* c8 ignore stop */

  return { equality, canConcat: false, mismatch };
};

export async function inspectConcat(
  request: InspectConcatRequest,
  options: InspectConcatOptions
): Promise<InspectConcatResponse> {
  const version = request.version ?? DEFAULT_VERSION;
  const fsModule = options.fs ?? fs;
  const allowedExtensions = new Set(
    (options.allowedExtensions ?? DEFAULT_ALLOWED_EXTENSIONS).map(ext => ext.toLowerCase())
  );

  try {
    ensureClipCount(request, options);
  } catch (error) {
    return buildErrorResponse(version, error as InspectFailure);
  }

  const include = new Set<InspectInclude>(request.options?.include ?? []);
  const fpsTolerance =
    typeof request.options?.fpsTolerance === 'number' && request.options.fpsTolerance >= 0
      ? request.options.fpsTolerance
      : DEFAULT_FPS_TOLERANCE;

  try {
    const normalizedPaths = await Promise.all(
      request.clips.map(clip => normalizeClipPath(clip.path, allowedExtensions, fsModule))
    );

    const details: InspectClipDetails[] = [];
    for (const clipPath of normalizedPaths) {
      details.push(await runFfprobe(clipPath, options, include));
    }

    const equalityResult = calculateEquality(details, fpsTolerance);

    return {
      ok: true,
      canConcat: equalityResult.canConcat,
      equality: equalityResult.equality,
      details,
      error: equalityResult.canConcat
        ? null
        : {
            code: 'E2001',
            message: messages.E2001,
            meta: equalityResult.mismatch
          },
      version
    } satisfies InspectConcatResponse;
  } catch (error) {
    if (error instanceof InspectFailure) {
      return buildErrorResponse(version, error);
    }
    const failure = createFailure('E1004', {
      reason: 'unexpected_error',
      message: error instanceof Error ? error.message : String(error)
    });
    return buildErrorResponse(version, failure);
  }
}

export { isUncPath as isNetworkPath, createFailure as buildConcatFailure, ratioToNumber, parseRatio };
