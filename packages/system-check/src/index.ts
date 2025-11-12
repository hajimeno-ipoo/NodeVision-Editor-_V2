import { constants as fsConstants, Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

export const DEFAULT_TOTAL_LIMIT_BYTES = 1_000_000_000; // 1GB
export const DEFAULT_SINGLE_JOB_LIMIT_BYTES = 500_000_000; // 500MB

export interface BinaryInfo {
  path: string;
  version: string | null;
}

export interface FFmpegDetectionResult {
  ffmpeg: BinaryInfo;
  ffprobe: BinaryInfo;
}

export interface FFmpegDetectionOptions {
  ffmpegPath?: string | null;
  ffprobePath?: string | null;
}

export class BinaryNotFoundError extends Error {
  constructor(binaryName: string) {
    super(`${binaryName} was not found in PATH or provided location`);
  }
}

export class ResourceLimitError extends Error {
  constructor(public readonly status: TempRootStatus) {
    super('E3001 ResourceExceeded');
  }
}

export interface TempRootStatus {
  tempRoot: string;
  totalBytes: number;
  largestEntryBytes: number;
  largestEntryPath: string | null;
  maxTotalBytes: number;
  maxSingleJobBytes: number;
  overTotalLimit: boolean;
  overSingleJobLimit: boolean;
}

export interface TempRootOptions {
  maxTotalBytes?: number;
  maxSingleJobBytes?: number;
}

const isWindowsRuntime = () => process.platform === 'win32' || process.env.NODEVISION_FORCE_WINDOWS === '1';
const getExecutableExtensions = () => (isWindowsRuntime() ? ['.exe', '.cmd', '.bat'] : ['']);

const getCandidatePaths = (binaryName: string, explicit?: string | null): string[] => {
  const candidates: string[] = [];

  if (explicit) {
    candidates.push(explicit);
  }

  const segments = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const segment of segments) {
    for (const ext of getExecutableExtensions()) {
      candidates.push(path.join(segment, isWindowsRuntime() ? `${binaryName}${ext}` : binaryName));
    }
  }

  return candidates;
};

const isExecutable = async (filePath: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      return false;
    }

    /* c8 ignore next */
    if (isWindowsRuntime()) {
      return getExecutableExtensions().some(ext => filePath.toLowerCase().endsWith(ext));
    }

    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveBinary = async (binaryName: string, explicit?: string | null): Promise<string> => {
  const candidates = getCandidatePaths(binaryName, explicit);
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  throw new BinaryNotFoundError(binaryName);
};

const parseVersion = (output: string): string | null => {
  const firstLine = output.split('\n')[0]?.trim();
  return firstLine?.length ? firstLine : null;
};

const readBinaryVersion = async (binaryPath: string): Promise<string | null> => {
  try {
    const { stdout } = await execa(binaryPath, ['-version'], { reject: false, timeout: 1000 });
    return parseVersion(stdout);
  } catch {
    /* c8 ignore next */
    return null;
  }
};

export async function detectFFmpeg(options: FFmpegDetectionOptions = {}): Promise<FFmpegDetectionResult> {
  const ffmpegPath = await resolveBinary('ffmpeg', options.ffmpegPath ?? undefined);
  const ffprobePath = await resolveBinary('ffprobe', options.ffprobePath ?? undefined);

  return {
    ffmpeg: {
      path: ffmpegPath,
      version: await readBinaryVersion(ffmpegPath)
    },
    ffprobe: {
      path: ffprobePath,
      version: await readBinaryVersion(ffprobePath)
    }
  };
}

export const ensureTempRoot = async (tempRoot: string): Promise<string> => {
  await fs.mkdir(tempRoot, { recursive: true });
  return tempRoot;
};

export const getDefaultTempRoot = (): string => path.join(os.tmpdir(), 'nodevision-temp');

interface WalkResult {
  totalBytes: number;
  largestEntryBytes: number;
  largestEntryPath: string | null;
}

const walkDirectory = async (dir: string): Promise<WalkResult> => {
  let totalBytes = 0;
  let largestEntryBytes = 0;
  let largestEntryPath: string | null = null;

  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { totalBytes: 0, largestEntryBytes: 0, largestEntryPath: null };
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = await walkDirectory(entryPath);
      totalBytes += child.totalBytes;
      if (child.largestEntryBytes > largestEntryBytes) {
        largestEntryBytes = child.largestEntryBytes;
        largestEntryPath = child.largestEntryPath;
      }
    } else if (entry.isFile()) {
      const stat = await fs.stat(entryPath);
      totalBytes += stat.size;
      if (stat.size > largestEntryBytes) {
        largestEntryBytes = stat.size;
        largestEntryPath = entryPath;
      }
    }
  }

  return { totalBytes, largestEntryBytes, largestEntryPath };
};

export async function analyzeTempRoot(
  tempRoot: string,
  options: TempRootOptions = {}
): Promise<TempRootStatus> {
  await ensureTempRoot(tempRoot);
  const walk = await walkDirectory(tempRoot);

  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_TOTAL_LIMIT_BYTES;
  const maxSingleJobBytes = options.maxSingleJobBytes ?? DEFAULT_SINGLE_JOB_LIMIT_BYTES;

  return {
    tempRoot,
    totalBytes: walk.totalBytes,
    largestEntryBytes: walk.largestEntryBytes,
    largestEntryPath: walk.largestEntryPath,
    maxTotalBytes,
    maxSingleJobBytes,
    overTotalLimit: walk.totalBytes > maxTotalBytes,
    overSingleJobLimit: walk.largestEntryBytes > maxSingleJobBytes
  };
}

export async function enforceTempRoot(
  tempRoot: string,
  options: TempRootOptions = {}
): Promise<TempRootStatus> {
  const status = await analyzeTempRoot(tempRoot, options);
  if (status.overTotalLimit || status.overSingleJobLimit) {
    throw new ResourceLimitError(status);
  }

  return status;
}
