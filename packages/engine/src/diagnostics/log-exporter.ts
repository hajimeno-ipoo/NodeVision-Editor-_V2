import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import archiver from 'archiver';
import zipEncrypted from 'archiver-zip-encrypted';

import type { InspectRequestLog, JobHistoryEntry } from '../types';

(archiver as unknown as { registerFormat: (name: string, plugin: unknown) => void }).registerFormat(
  'zip-encrypted',
  zipEncrypted as unknown
);

const formatTimestamp = (date: Date): string => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getUTCFullYear().toString(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') +
    '-' +
    [pad(date.getUTCHours()), pad(date.getUTCMinutes())].join('');
};

const computeSha256 = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });

const collectFiles = async (root: string): Promise<string[]> => {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectFiles(fullPath)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    return files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

/* c8 ignore start */
const ensurePassword = (candidate: string): string => {
  if (!candidate) {
    throw new Error('Log export password is required. Provide password or set NV_LOG_EXPORT_PASSWORD.');
  }
  return candidate;
};
/* c8 ignore end */

export const __logExporterInternals = {
  collectFiles
};

export interface LogExportOptions {
  outputDirectory: string;
  jobHistory: JobHistoryEntry[];
  inspectRequests: InspectRequestLog[];
  password?: string | null;
  includeCrashDumps?: boolean;
  crashDumpDirectory?: string | null;
  timestamp?: Date;
}

export interface LogExportResult {
  outputPath: string;
  sha256: string;
  manifest: {
    generatedAt: string;
    jobHistoryCount: number;
    inspectRequestCount: number;
    crashDumpsIncluded: string[];
  };
}

export async function exportDiagnosticsLogs(options: LogExportOptions): Promise<LogExportResult> {
  const rawPassword = (options.password ?? process.env.NV_LOG_EXPORT_PASSWORD ?? '').trim();
  const password = ensurePassword(rawPassword);

  const generatedAt = options.timestamp ?? new Date();
  await fs.mkdir(options.outputDirectory, { recursive: true });
  const outputFile = path.join(options.outputDirectory, `NodeVision-logs-${formatTimestamp(generatedAt)}.zip`);

  const crashDumpsIncluded: string[] = [];

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputFile);
    const archive = archiver.create('zip-encrypted', {
      zlib: { level: 8 },
      encryptionMethod: 'aes256',
      password
    });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    const run = async () => {
      archive.append(JSON.stringify(options.jobHistory, null, 2), { name: 'job-history.json' });
      archive.append(JSON.stringify(options.inspectRequests, null, 2), { name: 'inspect-history.json' });
      const metadata = {
        generatedAt: generatedAt.toISOString(),
        jobHistoryCount: options.jobHistory.length,
        inspectRequestCount: options.inspectRequests.length,
        crashDumpOptIn: Boolean(options.includeCrashDumps && options.crashDumpDirectory)
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

      if (options.includeCrashDumps && options.crashDumpDirectory) {
        const crashFiles = await collectFiles(options.crashDumpDirectory);
        for (const absolutePath of crashFiles) {
          const relative = path.relative(options.crashDumpDirectory, absolutePath);
          crashDumpsIncluded.push(relative);
          const safeName = relative.split(path.sep).join('/');
          archive.file(absolutePath, { name: path.posix.join('crash-dumps', safeName) });
        }
      }

      await archive.finalize();
    };

    run().catch(error => {
      archive.abort();
      reject(error);
    });
  });

  const sha256 = await computeSha256(outputFile);
  return {
    outputPath: outputFile,
    sha256,
    manifest: {
      generatedAt: generatedAt.toISOString(),
      jobHistoryCount: options.jobHistory.length,
      inspectRequestCount: options.inspectRequests.length,
      crashDumpsIncluded
    }
  };
}
