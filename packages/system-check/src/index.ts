import { constants as fsConstants, Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';

export const DEFAULT_TOTAL_LIMIT_BYTES = 1_000_000_000; // 1GB
export const DEFAULT_SINGLE_JOB_LIMIT_BYTES = 500_000_000; // 500MB

export type BinaryLicense = 'lgpl' | 'gpl' | 'nonfree' | 'unknown';

export interface BinaryInfo {
  path: string;
  version: string | null;
  license: BinaryLicense;
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

export interface TempRootEntry {
  path: string;
  bytes: number;
  mtimeMs: number;
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
  entries: TempRootEntry[];
  deletedEntries: string[];
}

export interface TempRootOptions {
  maxTotalBytes?: number;
  maxSingleJobBytes?: number;
  protectedEntries?: string[];
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

const parseConfigurationFlags = (output: string): string[] => {
  const configLine = output
    .split('\n')
    .map(line => line.trim())
    .find(line => line.toLowerCase().startsWith('configuration:'));
  if (!configLine) {
    return [];
  }
  return configLine
    .slice('configuration:'.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
};

const detectBinaryLicense = (output: string): BinaryLicense => {
  const flags = parseConfigurationFlags(output);
  if (flags.some(flag => flag === '--enable-nonfree')) {
    return 'nonfree';
  }
  if (flags.some(flag => flag === '--enable-gpl')) {
    return 'gpl';
  }
  if (flags.length) {
    return 'lgpl';
  }
  return 'unknown';
};

const readBinaryMetadata = async (binaryPath: string): Promise<{ version: string | null; license: BinaryLicense }> => {
  try {
    const { stdout } = await execa(binaryPath, ['-version'], { reject: false, timeout: 1000 });
    return {
      version: parseVersion(stdout),
      license: detectBinaryLicense(stdout)
    };
  } catch {
    /* c8 ignore next */
    return { version: null, license: 'unknown' };
  }
};

export async function detectFFmpeg(options: FFmpegDetectionOptions = {}): Promise<FFmpegDetectionResult> {
  const ffmpegPath = await resolveBinary('ffmpeg', options.ffmpegPath ?? undefined);
  const ffprobePath = await resolveBinary('ffprobe', options.ffprobePath ?? undefined);
  const ffmpegInfo = await readBinaryMetadata(ffmpegPath);
  const ffprobeInfo = await readBinaryMetadata(ffprobePath);

  return {
    ffmpeg: {
      path: ffmpegPath,
      version: ffmpegInfo.version,
      license: ffmpegInfo.license
    },
    ffprobe: {
      path: ffprobePath,
      version: ffprobeInfo.version,
      license: ffprobeInfo.license
    }
  };
}

export const ensureTempRoot = async (tempRoot: string): Promise<string> => {
  await fs.mkdir(tempRoot, { recursive: true });
  return tempRoot;
};

export const getDefaultTempRoot = (): string => path.join(os.tmpdir(), 'nodevision-temp');

const safeReaddir = async (dir: string): Promise<Dirent[]> => {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const safeStat = async (entryPath: string) => {
  try {
    return await fs.stat(entryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const calculateDirectorySize = async (dir: string): Promise<number> => {
  let totalBytes = 0;
  const entries = await safeReaddir(dir);

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      totalBytes += await calculateDirectorySize(entryPath);
    } else if (entry.isFile()) {
      const stat = await safeStat(entryPath);
      if (stat) {
        totalBytes += stat.size;
      }
    }
  }

  return totalBytes;
};

export async function analyzeTempRoot(
  tempRoot: string,
  options: TempRootOptions = {}
): Promise<TempRootStatus> {
  await ensureTempRoot(tempRoot);

  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_TOTAL_LIMIT_BYTES;
  const maxSingleJobBytes = options.maxSingleJobBytes ?? DEFAULT_SINGLE_JOB_LIMIT_BYTES;

  const dirEntries = await safeReaddir(tempRoot);
  const entries: TempRootEntry[] = [];
  let totalBytes = 0;
  let largestEntryBytes = 0;
  let largestEntryPath: string | null = null;

  for (const entry of dirEntries) {
    const entryPath = path.join(tempRoot, entry.name);
    const stat = await safeStat(entryPath);
    if (!stat) {
      continue;
    }

    let entryBytes = 0;
    if (entry.isDirectory()) {
      entryBytes = await calculateDirectorySize(entryPath);
    } else if (entry.isFile()) {
      entryBytes = stat.size;
    } else {
      continue;
    }

    totalBytes += entryBytes;
    entries.push({ path: entryPath, bytes: entryBytes, mtimeMs: stat.mtimeMs });

    if (entryBytes > largestEntryBytes) {
      largestEntryBytes = entryBytes;
      largestEntryPath = entryPath;
    }
  }

  return {
    tempRoot,
    totalBytes,
    largestEntryBytes,
    largestEntryPath,
    maxTotalBytes,
    maxSingleJobBytes,
    overTotalLimit: totalBytes > maxTotalBytes,
    overSingleJobLimit: largestEntryBytes > maxSingleJobBytes,
    entries,
    deletedEntries: []
  };
}

const pruneTempRoot = async (
  tempRoot: string,
  status: TempRootStatus,
  options: TempRootOptions
): Promise<TempRootStatus> => {
  const protectedSet = new Set((options.protectedEntries ?? []).map(entry => path.resolve(entry)));
  const deletable = status.entries
    .filter(entry => !protectedSet.has(path.resolve(entry.path)))
    .sort((a, b) => a.mtimeMs - b.mtimeMs);

  const removed: string[] = [];
  let remainingBytes = status.totalBytes;

  for (const entry of deletable) {
    if (remainingBytes <= status.maxTotalBytes) {
      break;
    }
    await fs.rm(entry.path, { recursive: true, force: true });
    remainingBytes -= entry.bytes;
    removed.push(entry.path);
  }

  const refreshed = await analyzeTempRoot(tempRoot, options);
  return { ...refreshed, deletedEntries: removed };
};

export async function enforceTempRoot(
  tempRoot: string,
  options: TempRootOptions = {}
): Promise<TempRootStatus> {
  let status = await analyzeTempRoot(tempRoot, options);

  if (status.overSingleJobLimit) {
    throw new ResourceLimitError(status);
  }

  if (!status.overTotalLimit) {
    return status;
  }

  status = await pruneTempRoot(tempRoot, status, options);

  if (status.overSingleJobLimit || status.overTotalLimit) {
    throw new ResourceLimitError(status);
  }

  return status;
}
