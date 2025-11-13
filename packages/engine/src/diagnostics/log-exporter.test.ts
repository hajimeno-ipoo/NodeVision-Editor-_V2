import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import archiver from 'archiver';
import { __logExporterInternals, exportDiagnosticsLogs } from './log-exporter';

const createTempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'nodevision-logs-'));

const sampleJobHistory = [
  {
    jobId: 'job-1',
    name: 'Sample',
    status: 'completed' as const,
    outputPath: '/tmp/out.mp4',
    errorMessage: null,
    startedAt: Date.now() - 1000,
    finishedAt: Date.now(),
    metadata: { fps: 24 },
    logLevel: 'info' as const,
    message: null
  }
];

const sampleInspectHistory = [
  {
    id: 'inspect-1',
    timestamp: new Date().toISOString(),
    durationMs: 12,
    statusCode: 200,
    tokenLabel: 'default',
    requestBytes: 512,
    responseCode: 'OK',
    logLevel: 'info' as const,
    remoteAddress: '127.0.0.1',
    clipCount: 1,
    includeOptions: ['duration'],
    payloadVersion: '1.0.7',
    meta: null
  }
];

const originalPassword = process.env.NV_LOG_EXPORT_PASSWORD;

afterEach(() => {
  process.env.NV_LOG_EXPORT_PASSWORD = originalPassword;
});

describe('exportDiagnosticsLogs', () => {
  it('throws when no password is provided', async () => {
    process.env.NV_LOG_EXPORT_PASSWORD = '';
    const outputDir = await createTempDir();
    await expect(
      exportDiagnosticsLogs({
        outputDirectory: outputDir,
        jobHistory: [],
        inspectRequests: []
      })
    ).rejects.toThrow(/password/i);
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('falls back to NV_LOG_EXPORT_PASSWORD when password argument is omitted', async () => {
    process.env.NV_LOG_EXPORT_PASSWORD = 'env-secret';
    const outputDir = await createTempDir();
    const result = await exportDiagnosticsLogs({
      outputDirectory: outputDir,
      jobHistory: sampleJobHistory,
      inspectRequests: sampleInspectHistory
    });
    expect(result.outputPath).toContain('NodeVision-logs');
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('creates an encrypted archive and manifest with crash dumps listed', async () => {
    const outputDir = await createTempDir();
    const crashRoot = path.join(outputDir, 'crashes');
    await fs.mkdir(crashRoot);
    await fs.writeFile(path.join(crashRoot, 'dump1.dmp'), 'oops');
    await fs.mkdir(path.join(crashRoot, 'nested'));
    await fs.writeFile(path.join(crashRoot, 'nested', 'dump2.dmp'), 'oops2');

    const result = await exportDiagnosticsLogs({
      outputDirectory: outputDir,
      jobHistory: sampleJobHistory,
      inspectRequests: sampleInspectHistory,
      password: 'sup3rsecret',
      includeCrashDumps: true,
      crashDumpDirectory: crashRoot,
      timestamp: new Date('2025-01-02T03:04:00Z')
    });

    const stat = await fs.stat(result.outputPath);
    expect(stat.size).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.jobHistoryCount).toBe(1);
    expect(result.manifest.inspectRequestCount).toBe(1);
    expect(result.manifest.crashDumpsIncluded.sort()).toEqual(['dump1.dmp', path.join('nested', 'dump2.dmp')].sort());

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('ignores missing crash dump folders gracefully', async () => {
    const outputDir = await createTempDir();
    const missingPath = path.join(outputDir, 'missing-folder');
    const result = await exportDiagnosticsLogs({
      outputDirectory: outputDir,
      jobHistory: sampleJobHistory,
      inspectRequests: sampleInspectHistory,
      password: 'password123',
      includeCrashDumps: true,
      crashDumpDirectory: missingPath
    });
    expect(result.manifest.crashDumpsIncluded).toHaveLength(0);
    const collected = await __logExporterInternals.collectFiles(missingPath);
    expect(collected).toEqual([]);
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('aborts the archive when finalize fails', async () => {
    const outputDir = await createTempDir();
    const abort = vi.fn();
    const finalize = vi.fn().mockRejectedValue(new Error('boom'));
    const createSpy = vi.spyOn(archiver as any, 'create').mockReturnValue({
      append: vi.fn(),
      file: vi.fn(),
      pipe: vi.fn(),
      on: vi.fn(),
      abort,
      finalize
    });

    await expect(
      exportDiagnosticsLogs({
        outputDirectory: outputDir,
        jobHistory: sampleJobHistory,
        inspectRequests: sampleInspectHistory,
        password: 'pw'
      })
    ).rejects.toThrow('boom');
    expect(abort).toHaveBeenCalled();
    createSpy.mockRestore();
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('rethrows filesystem errors when crash dump enumeration fails', async () => {
    const error = Object.assign(new Error('no-access'), { code: 'EACCES' });
    const spy = vi.spyOn(fs, 'readdir').mockRejectedValue(error as never);
    await expect(__logExporterInternals.collectFiles('/tmp/forbidden')).rejects.toThrow('no-access');
    spy.mockRestore();
  });
});
