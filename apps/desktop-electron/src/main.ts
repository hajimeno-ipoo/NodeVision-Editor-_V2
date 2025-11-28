import { promises as fs, createWriteStream } from 'node:fs';
import fsSync from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import archiver from 'archiver';
import zipEncrypted from 'archiver-zip-encrypted';
import os from 'node:os';
import { generateLUT3D, exportCubeLUT, buildColorTransform } from '@nodevision/color-grading';

import { DEFAULT_NODE_TEMPLATES, seedDemoNodes } from '@nodevision/editor';
import {
  createInspectHttpServer,
  exportDiagnosticsLogs,
  inspectConcat,
  InMemoryInspectRequestHistory,
  JobCancelledError,
  JobQueue,
  QueueFullError,
  type InspectConcatRequest,
  type JobRunContext,
  type JobRunResult,
  buildFFmpegPlan,
  FFmpegPlan
} from '@nodevision/engine';

// ... (imports)


import { getSettingsFilePath, loadSettings, NodeVisionSettings, updateSettings } from '@nodevision/settings';
import {
  BinaryNotFoundError,
  detectFFmpeg,
  ensureTempRoot,
  enforceTempRoot,
  FFmpegDetectionResult,
  ResourceLimitError,
  type BinaryLicense
} from '@nodevision/system-check';
import { createTokenManager, TokenRecord } from '@nodevision/tokens';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import type { BootStatus, FFmpegDistributionMetadata, QueueSnapshot, WorkflowRecord, QueueWarning } from './types';
import { buildRendererHtml } from './ui-template';

const preloadPath = path.join(__dirname, 'preload.js');
// ... (rest of imports and constants)

// ...


const FFMPEG_SOURCE_URL = 'https://ffmpeg.org/download.html#sources';
const FFMPEG_LICENSE_URLS: Record<BinaryLicense, string> = {
  lgpl: 'https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html',
  gpl: 'https://www.gnu.org/licenses/gpl-3.0.en.html',
  nonfree: 'https://ffmpeg.org/legal.html',
  unknown: 'https://ffmpeg.org/legal.html'
};
const WORKFLOW_STORE_FILE = 'nodevision-workflows.json';

archiver.registerFormat('zip-encrypted', zipEncrypted as any);

const getWorkflowStorePath = (): string => path.join(app.getPath('userData'), WORKFLOW_STORE_FILE);

const tokenManager = createTokenManager();
const jobQueue = new JobQueue({ maxQueueLength: 4, queueTimeoutMs: 3 * 60_000 });
const inspectHistory = new InMemoryInspectRequestHistory(20);
let httpServer: HttpServer | null = null;
let cachedSettings: NodeVisionSettings | null = null;
let lastExportSummary: { outputPath: string; sha256: string; generatedAt: string } | null = null;

const normalizePath = (target: string | null | undefined): string | null => {
  if (!target) {
    return null;
  }
  const resolved = path.resolve(target);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const isWithin = (candidate: string | null, target: string): boolean => {
  if (!candidate) {
    return false;
  }
  const normalizedCandidate = normalizePath(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  const normalizedTarget = normalizePath(target);
  if (!normalizedTarget) {
    return false;
  }
  if (normalizedTarget === normalizedCandidate) {
    return true;
  }
  const prefix = normalizedTarget.endsWith(path.sep) ? normalizedTarget : `${normalizedTarget}${path.sep}`;
  return normalizedCandidate.startsWith(prefix);
};

const createZipArchive = async (files: string[], outputPath: string, password?: string): Promise<void> => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver(
      password ? ('zip-encrypted' as any) : 'zip',
      password
        ? { zlib: { level: 9 }, encryptionMethod: 'aes256', password } as any
        : { zlib: { level: 9 } }
    );

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    files.forEach(file => {
      archive.file(file, { name: path.basename(file) });
    });
    archive.finalize().catch(reject);
  });
};

const gatherBundleHints = (): string[] => {
  const hints = new Set<string>();
  const addHint = (value: string | null | undefined) => {
    if (value) {
      hints.add(path.resolve(value));
    }
  };

  addHint(process.env.NODEVISION_FFMPEG_BUNDLE_ROOT ?? null);
  const envHints = (process.env.NODEVISION_FFMPEG_BUNDLE_HINTS ?? '')
    .split(path.delimiter)
    .map(entry => entry.trim())
    .filter(Boolean);
  envHints.forEach(addHint);

  const resourcesRoot = process.resourcesPath;
  addHint(resourcesRoot);
  addHint(resourcesRoot ? path.join(resourcesRoot, 'ffmpeg') : null);
  addHint(resourcesRoot ? path.join(resourcesRoot, 'bin') : null);

  const appPath = app.getAppPath();
  addHint(path.join(appPath, 'ffmpeg'));
  addHint(path.join(appPath, 'resources', 'ffmpeg'));
  addHint(path.join(__dirname, '..', '..', 'vendor', 'ffmpeg'));

  return Array.from(hints);
};

const determineFfmpegOrigin = (ffmpegPath: string): 'bundled' | 'external' => {
  if (process.env.NODEVISION_FFMPEG_BUNDLED === '1') {
    return 'bundled';
  }
  const candidates = gatherBundleHints();
  for (const hint of candidates) {
    if (isWithin(ffmpegPath, hint)) {
      return 'bundled';
    }
  }
  return 'external';
};

const describeFfmpegDistribution = (ffmpeg: FFmpegDetectionResult['ffmpeg']): FFmpegDistributionMetadata => {
  const origin = determineFfmpegOrigin(ffmpeg.path);
  return {
    origin,
    license: ffmpeg.license,
    licenseUrl: FFMPEG_LICENSE_URLS[ffmpeg.license] ?? FFMPEG_LICENSE_URLS.unknown,
    sourceUrl: FFMPEG_SOURCE_URL
  } satisfies FFmpegDistributionMetadata;
};

const buildQueueWarnings = (
  _history: any[],
  _limits: any,
  _queuedCount: number,
  queueFullEvent: any
): QueueWarning[] => {
  const warnings: QueueWarning[] = [];
  if (queueFullEvent && Date.now() - queueFullEvent.timestamp < 5000) {
    warnings.push({
      type: 'QUEUE_FULL',
      level: 'warn',
      message: 'Queue is currently full',
      occurredAt: new Date().toISOString()
    });
  }
  return warnings;
};

const getQueueSnapshot = (): QueueSnapshot => {
  const active = jobQueue.getActiveJobs();
  const queued = jobQueue.getQueuedJobs();
  const history = jobQueue.getHistory();
  const limits = jobQueue.getLimits();
  const queueFullEvent = jobQueue.getLastQueueFullEvent();
  return {
    active,
    queued,
    history,
    limits,
    warnings: buildQueueWarnings(history, limits, queued.length, queueFullEvent)
  };
};

const runFfmpeg = (ffmpegPath: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', data => {
      stderr += data.toString();
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        console.error('[FFmpeg] Error output:', stderr);
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });
  });

const simulateJobExecution = (ctx: JobRunContext): Promise<JobRunResult> =>
  new Promise((resolve, reject) => {
    const total = 3_000 + Math.floor(Math.random() * 3_000);
    ctx.progress.setTotalTime(total);
    let elapsed = 0;

    const step = () => {
      if (ctx.signal.aborted) {
        reject(new JobCancelledError('Demo job cancelled'));
        return;
      }

      elapsed = Math.min(total, elapsed + 500);
      ctx.progress.updateOutputTime(elapsed);

      if (elapsed >= total) {
        resolve({
          totalTimeMs: total,
          outputTimeMs: elapsed,
          outputPath: cachedSettings ? path.join(cachedSettings.tempRoot, `demo-${Date.now()}.mp4`) : null
        });
        return;
      }

      setTimeout(step, 500);
    };

    step();
  });

const enqueueDemoJob = (name: string): string =>
  jobQueue.enqueue({
    name,
    metadata: { source: 'demo' },
    execute: simulateJobExecution
  });

const diagnosticsSnapshot = () => ({
  collectCrashDumps: cachedSettings?.diagnostics.collectCrashDumps ?? false,
  lastTokenPreview: cachedSettings?.diagnostics.lastTokenPreview ?? null,
  lastLogExportPath: cachedSettings?.diagnostics.lastLogExportPath ?? null,
  lastExportSha: lastExportSummary?.sha256 ?? null,
  inspectHistory: inspectHistory.entries()
});

const sanitizeWorkflowRecords = (value: unknown): WorkflowRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const sanitized: WorkflowRecord[] = [];
  value.forEach(item => {
    if (!item || typeof item !== 'object') {
      return;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : null;
    const name = typeof record.name === 'string' ? record.name : null;
    const data = typeof record.data === 'string' ? record.data : null;
    if (!id || !name || !data) {
      return;
    }
    const updatedAtRaw = typeof record.updatedAt === 'string' ? record.updatedAt : null;
    const updatedAt = updatedAtRaw && !Number.isNaN(Date.parse(updatedAtRaw)) ? updatedAtRaw : new Date().toISOString();
    sanitized.push({ id, name, data, updatedAt });
  });
  return sanitized;
};

const readWorkflowStore = async (): Promise<WorkflowRecord[]> => {
  try {
    const filePath = getWorkflowStorePath();
    const raw = await fs.readFile(filePath, 'utf-8');
    return sanitizeWorkflowRecords(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return [];
    }
    console.warn('[NodeVision] Failed to read workflow store', error);
    throw error;
  }
};

const writeWorkflowStore = async (workflows: WorkflowRecord[]): Promise<void> => {
  const filePath = getWorkflowStorePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(workflows, null, 2), 'utf-8');
};

ipcMain.handle('nodevision:queue:snapshot', () => getQueueSnapshot());

ipcMain.handle('nodevision:queue:enqueue', async (_event, payload) => {
  try {
    const label = (payload?.name as string | undefined)?.trim() || `ジョブ ${new Date().toLocaleTimeString()}`;
    enqueueDemoJob(label);
    return { ok: true };
  } catch (error) {
    if (error instanceof QueueFullError) {
      return { ok: false, error: 'queue_full', message: 'Job queue is full' };
    }
    throw error;
  }
});

const planToArgs = (plan: FFmpegPlan, outputPath: string): string[] => {
  const args: string[] = [];
  const filterChain: string[] = [];
  let lastLabel = '0:v'; // Assuming single video input for now

  // Create a temp directory for LUTs if needed
  const tempDir = path.join(os.tmpdir(), 'nodevision-luts');
  if (!fsSync.existsSync(tempDir)) {
    fsSync.mkdirSync(tempDir, { recursive: true });
  }

  for (const stage of plan.stages) {
    if (stage.stage === 'input') {
      args.push(...stage.args);
      args.push('-i', stage.path);
    } else if (stage.stage === 'filter') {
      // Handle LUT generation stage
      if (stage.typeId === 'lut3d_generator') {
        const { pipeline, nodeId } = stage.params as any;

        // Generate LUT
        // Use 33x33x33 resolution for high quality export
        const lut = generateLUT3D(33, buildColorTransform(pipeline));

        // Export to .cube file
        const cubeContent = exportCubeLUT(lut, { title: `NodeVision LUT ${nodeId}` });
        const lutPath = path.join(tempDir, `lut-${nodeId}-${Date.now()}.cube`);

        fsSync.writeFileSync(lutPath, cubeContent, 'utf-8');

        // Add lut3d filter
        const nextLabel = `tmp${filterChain.length}`;
        // Escape path for FFmpeg
        const escapedPath = lutPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        filterChain.push(`[${lastLabel}]lut3d=file='${escapedPath}'[${nextLabel}]`);
        lastLabel = nextLabel;
        continue;
      }

      // Construct filter parameters
      const paramsList = Object.entries(stage.params)
        .map(([k, v]) => {
          if (v === undefined || v === null) return null;

          // Handle special parameter formatting
          if (stage.typeId === 'crop') {
            if (k === 'width') {
              // If v is a string expression like "iw*0.55", use it as-is
              if (typeof v === 'string') return `w=${v}`;
              // For numeric values close to 1.0 (100%), use 'iw' instead
              const numVal = v as number;
              if (Math.abs(numVal - 1.0) < 0.0001) return 'w=iw';
              return `w=${numVal}`;
            }
            if (k === 'height') {
              if (typeof v === 'string') return `h=${v}`;
              const numVal = v as number;
              if (Math.abs(numVal - 1.0) < 0.0001) return 'h=ih';
              return `h=${numVal}`;
            }
          }
          if (stage.typeId === 'setsar') {
            if (k === 'value') return `sar=${v}`;
          }
          if (stage.typeId === 'speed') {
            if (k === 'ratio') return null; // ratio is internal
          }
          if (stage.typeId === 'overlay') {
            // Internal params to skip for the filter string
            if (['sourcePath', 'escapedSource', 'label'].includes(k)) return null;
          }
          if (stage.typeId === 'text') {
            if (['text', 'escapedText'].includes(k)) return null;
            if (k === 'fontSize') return `fontsize=${v}`;
            if (k === 'color') return `fontcolor=${v}`;
          }
          if (stage.typeId === 'eq' as any || stage.typeId === 'curves' as any || stage.typeId === 'colorchannelmixer' as any) {
            // These are FFmpeg filter names, use params as-is
          }

          let valStr = String(v);
          // Always quote color correction filter parameters to ensure correct parsing
          if (
            stage.typeId === 'eq' as any ||
            stage.typeId === 'curves' as any ||
            stage.typeId === 'colorchannelmixer' as any ||
            valStr.includes(' ')
          ) {
            valStr = `'${valStr}'`;
          }
          return `${k}=${valStr}`;
        })
        .filter((v): v is string => v !== null);

      const params = paramsList.join(':');
      const nextLabel = `tmp${filterChain.length}`;

      if (stage.typeId === 'overlay') {
        // Use movie filter to load the overlay source
        const ovlLabel = `ovl${filterChain.length}`;
        // movie filter takes the escaped path
        const source = stage.params.escapedSource || stage.params.sourcePath;
        filterChain.push(`movie='${source}'[${ovlLabel}]`);
        filterChain.push(`[${lastLabel}][${ovlLabel}]overlay=${params}[${nextLabel}]`);
      } else if (stage.typeId === 'text') {
        // drawtext filter
        const text = stage.params.escapedText || stage.params.text;
        // Basic drawtext construction - might need fontfile path in real app
        filterChain.push(`[${lastLabel}]drawtext=text='${text}':${params}[${nextLabel}]`);
      } else if (stage.typeId === 'eq' as any) {
        // eq filter for basic color correction
        // Convert to RGB color space for consistent processing with WebGL
        const rgbLabel = `rgb${filterChain.length}`;
        filterChain.push(`[${lastLabel}]format=gbrp[${rgbLabel}]`);
        filterChain.push(`[${rgbLabel}]eq=${params}[${nextLabel}]`);
      } else if (stage.typeId === 'curves' as any) {
        // curves filter for shadows/highlights
        filterChain.push(`[${lastLabel}]curves=${params}[${nextLabel}]`);
      } else if (stage.typeId === 'colorchannelmixer' as any) {
        // colorchannelmixer for temperature/tint
        filterChain.push(`[${lastLabel}]colorchannelmixer=${params}[${nextLabel}]`);
      } else {
        filterChain.push(`[${lastLabel}]${stage.typeId}=${params}[${nextLabel}]`);
      }
      lastLabel = nextLabel;
    } else if (stage.stage === 'output') {
      // Output stage args
      args.push(...stage.args);
      if (stage.pixelFormat) {
        args.push('-pix_fmt', stage.pixelFormat);
      }
    }
  }

  if (filterChain.length > 0) {
    args.push('-filter_complex', filterChain.join(';'));
    args.push('-map', `[${lastLabel}]`);
    // Map audio from first input if exists (simple assumption)
    args.push('-map', '0:a?');
  }

  args.push('-y', outputPath);
  return args;
};

const executeExportJob = async (
  _ctx: JobRunContext,
  payload: { sourcePath: string; outputPath: string; format: string; quality: string; nodes?: any[] }
): Promise<JobRunResult> => {
  const { sourcePath, outputPath, nodes } = payload;

  const detection = await detectFFmpeg({});
  if (!detection.ffmpeg) {
    throw new Error('FFmpeg not found');
  }

  let args: string[] = [];

  if (nodes && nodes.length > 0) {
    try {
      // Build FFmpeg plan from nodes
      const plan = buildFFmpegPlan({ nodes } as any);
      args = planToArgs(plan, outputPath);
      console.log('Generated FFmpeg args:', args);
    } catch (error) {
      console.error('Failed to build FFmpeg plan:', error);
      // Fallback to simple export if plan building fails
      args = ['-i', sourcePath, '-y', outputPath];
    }
  } else {
    // Fallback/Legacy mode
    args = ['-i', sourcePath, '-y', outputPath];
  }

  // Apply quality settings
  const quality = payload.quality || 'medium';
  const ext = path.extname(outputPath).toLowerCase();
  const isVideo = ['.mp4', '.mov', '.mkv', '.webm'].includes(ext);
  const isJpg = ['.jpg', '.jpeg'].includes(ext);

  const qualityArgs: string[] = [];

  if (isVideo) {
    // Video Quality Settings (CRF + Preset + Audio Bitrate)
    if (quality === 'high') {
      qualityArgs.push(
        '-crf',
        '18',
        '-preset',
        'slow',
        '-b:a',
        '320k',
        '-metadata',
        'nv_preset=slow'
      );
    } else if (quality === 'low') {
      qualityArgs.push(
        '-crf',
        '28',
        '-preset',
        'veryfast',
        '-b:a',
        '128k',
        '-metadata',
        'nv_preset=veryfast'
      );
    } else {
      // Medium (Default)
      qualityArgs.push(
        '-crf',
        '23',
        '-preset',
        'medium',
        '-b:a',
        '192k',
        '-metadata',
        'nv_preset=medium'
      );
    }
  } else if (isJpg) {
    // JPG Quality Settings (q:v range 2-31, lower is better)
    if (quality === 'high') {
      qualityArgs.push('-q:v', '2');
    } else if (quality === 'low') {
      qualityArgs.push('-q:v', '10');
    } else {
      // Medium
      qualityArgs.push('-q:v', '5');
    }
  }
  // 品質オプションが出力パスより後ろに行くと ffmpeg に無視されるので、-y <output> の手前へ差し込む
  if (qualityArgs.length > 0) {
    const outputFlagIndex = args.findIndex(
      (v, i) => v === '-y' && args[i + 1] === outputPath
    );
    if (outputFlagIndex !== -1) {
      args.splice(outputFlagIndex, 0, ...qualityArgs);
    } else {
      args.push(...qualityArgs);
    }
  }
  // PNG is lossless by default, so no quality flags needed

  try {
    await runFfmpeg(detection.ffmpeg.path, args);
  } catch (error) {
    console.error('[Export Job] FFmpeg execution failed:', error);
    throw error;
  }

  return { outputPath };
};

ipcMain.handle('nodevision:queue:export', async (_event, payload) => {
  try {
    jobQueue.enqueue({
      name: `Export ${path.basename(payload.outputPath)}`,
      metadata: { type: 'export', ...payload },
      execute: (ctx) => executeExportJob(ctx, payload)
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('nodevision:queue:zip', async (_event, payload) => {
  try {
    const files = (payload?.files as string[]) ?? [];
    const outputPath = payload?.outputPath as string;
    const password = payload?.password as string | undefined;
    const cleanupPaths = (payload?.cleanupPaths as string[]) ?? [];

    if (!files.length || !outputPath) {
      return { ok: false, message: 'files または outputPath が不足しています' };
    }

    jobQueue.enqueue({
      name: `Zip ${path.basename(outputPath)}`,
      metadata: { type: 'zip', outputPath, files },
      execute: async () => {
        await createZipArchive(files, outputPath, password);
        // cleanup
        await Promise.all(
          cleanupPaths.map(async p => {
            try {
              await fs.unlink(p);
            } catch {
              /* ignore */
            }
          })
        );
        return { outputPath };
      }
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('nodevision:queue:cancelAll', () => {
  jobQueue.cancelAll();
});

ipcMain.handle('nodevision:diagnostics:setCrashDumpConsent', async (_event, payload) => {
  const enabled = Boolean(payload?.enabled);
  cachedSettings = await updateSettings(current => ({
    diagnostics: {
      ...current.diagnostics,
      collectCrashDumps: enabled
    }
  }));
  return { collectCrashDumps: cachedSettings.diagnostics.collectCrashDumps };
});

ipcMain.handle('nodevision:logs:export', async (_event, payload) => {
  const password = (payload?.password as string | null) ?? null;
  try {
    const outputDirectory = cachedSettings ? path.join(cachedSettings.tempRoot, 'diagnostics') : app.getPath('documents');
    const includeCrashDumps = cachedSettings?.diagnostics.collectCrashDumps ?? false;
    const crashDumpDirectory = includeCrashDumps && cachedSettings ? path.join(cachedSettings.tempRoot, 'crash-dumps') : null;
    const result = await exportDiagnosticsLogs({
      outputDirectory,
      jobHistory: jobQueue.getHistory(),
      inspectRequests: inspectHistory.entries(),
      password,
      includeCrashDumps,
      crashDumpDirectory
    });
    lastExportSummary = {
      outputPath: result.outputPath,
      sha256: result.sha256,
      generatedAt: result.manifest.generatedAt
    };
    cachedSettings = await updateSettings(current => ({
      diagnostics: {
        ...current.diagnostics,
        lastLogExportPath: result.outputPath
      }
    }));
    return { ok: true, result, diagnostics: diagnosticsSnapshot() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('nodevision:dialog:save', async (_event, payload) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    title: payload?.title,
    defaultPath: payload?.defaultPath,
    filters: payload?.filters
  });
  return { filePath, canceled };
});

ipcMain.handle('nodevision:workflows:load', async () => {
  try {
    const workflows = await readWorkflowStore();
    return { ok: true, workflows };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error), workflows: [] };
  }
});

ipcMain.handle('nodevision:workflows:save', async (_event, payload) => {
  try {
    const workflows = sanitizeWorkflowRecords(payload?.workflows);
    await writeWorkflowStore(workflows);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('nodevision:media:store', async (_event, payload) => {
  try {
    if (!cachedSettings) throw new Error('Settings not initialized');
    const buffer: ArrayBuffer | undefined = payload?.buffer;
    const name: string | undefined = payload?.name;
    if (!buffer || !name) throw new Error('buffer and name are required');
    const uploadDir = path.join(cachedSettings.tempRoot, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const hash = crypto.randomBytes(6).toString('hex');
    const outputPath = path.join(uploadDir, `${Date.now()}-${hash}-${safeName}`);
    const nodeBuffer = Buffer.from(buffer);
    await fs.writeFile(outputPath, nodeBuffer);
    return { ok: true, path: outputPath, url: pathToFileURL(outputPath).toString() };
  } catch (error) {
    console.error('[NodeVision] media store failed', error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('nodevision:media:getSiblingFile', async (_event, payload) => {
  try {
    const currentPath: string | undefined = payload?.currentPath;
    const direction: 'next' | 'prev' = payload?.direction;
    const nodeKind: 'image' | 'video' | 'any' = payload?.nodeKind ?? 'any';

    if (!currentPath || !direction) {
      throw new Error('currentPath and direction are required');
    }

    const dirPath = path.dirname(currentPath);
    const currentName = path.basename(currentPath);

    // Define media file extensions
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);
    const videoExts = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.flv']);

    // Read directory
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // Filter for media files based on node kind
    const mediaFiles = entries
      .filter(entry => entry.isFile())
      .filter(entry => {
        const ext = path.extname(entry.name).toLowerCase();
        if (nodeKind === 'image') {
          return imageExts.has(ext);
        } else if (nodeKind === 'video') {
          return videoExts.has(ext);
        } else {
          return imageExts.has(ext) || videoExts.has(ext);
        }
      })
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    // Find current file index
    const currentIndex = mediaFiles.indexOf(currentName);
    if (currentIndex === -1) {
      return { ok: false, message: 'Current file not found in directory' };
    }

    // Calculate target index
    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    // Check bounds
    if (targetIndex < 0 || targetIndex >= mediaFiles.length) {
      return { ok: false, message: direction === 'next' ? 'No next file' : 'No previous file' };
    }

    const targetName = mediaFiles[targetIndex];
    const targetPath = path.join(dirPath, targetName);

    // Read file as buffer
    const buffer = await fs.readFile(targetPath);

    return {
      ok: true,
      name: targetName,
      path: targetPath,
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    };
  } catch (error) {
    console.error('[NodeVision] getSiblingFile failed', error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});


ipcMain.handle('nodevision:media:loadFileByPath', async (_event, payload) => {
  try {
    const filePath: string | undefined = payload?.filePath;

    if (!filePath) {
      throw new Error('filePath is required');
    }

    // Read file as buffer
    const buffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    return {
      ok: true,
      name: fileName,
      path: filePath,
      buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    };
  } catch (error) {
    console.error('[NodeVision] loadFileByPath failed', error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});


ipcMain.handle('nodevision:preview:crop', async (_event, payload) => {
  try {
    if (!cachedSettings) {
      throw new Error('Settings not initialized');
    }
    const ffmpegPath = cachedSettings.ffmpegPath;
    if (!ffmpegPath) {
      throw new Error('FFmpeg path missing');
    }
    const sourcePath: string | undefined = payload?.sourcePath;
    if (!sourcePath) {
      throw new Error('sourcePath is required');
    }
    const kind: 'image' | 'video' = payload?.kind === 'video' ? 'video' : 'image';
    const region = payload?.region ?? { x: 0, y: 0, width: 1, height: 1 };
    const widthHint: number | null = payload?.widthHint ?? null;
    const heightHint: number | null = payload?.heightHint ?? null;
    const durationMs: number | null = payload?.durationMs ?? null;
    const previewDir = path.join(cachedSettings.tempRoot, 'cropped-previews');
    await fs.mkdir(previewDir, { recursive: true });

    const expr = (value: number | undefined, base: 'iw' | 'ih'): string => {
      if (typeof value !== 'number' || Number.isNaN(value)) return base;
      // Clamp normalized values to the range (0,1]
      if (value > 0 && value <= 1) {
        return `${base}*${value}`;
      }
      // If value slightly exceeds 1 due to floating‑point error, treat it as 1
      if (value > 1 && value < 1.01) {
        return `${base}*1`;
      }
      // Otherwise round to nearest integer (e.g., pixel values)
      return `${Math.round(value)}`;
    };

    const cropFilter = `crop=${expr(region.width, 'iw')}:${expr(region.height, 'ih')}:${expr(
      region.x,
      'iw'
    )}:${expr(region.y, 'ih')}`;

    const filterParts: string[] = [];
    // CRITICAL: crop must be applied FIRST before any transformations
    // to ensure coordinates are relative to the original image
    filterParts.push(cropFilter);

    // Then apply flip/rotate on the cropped region
    if (payload?.flipHorizontal) {
      filterParts.push('hflip');
    }
    if (payload?.flipVertical) {
      filterParts.push('vflip');
    }
    if (typeof payload?.rotationDeg === 'number' && payload.rotationDeg !== 0) {
      filterParts.push(`rotate=${payload.rotationDeg * (Math.PI / 180)}:fillcolor=black`);
    }

    // Finally apply zoom scale
    if (typeof payload?.zoom === 'number' && payload.zoom !== 1) {
      filterParts.push(`scale=iw*${payload.zoom}:ih*${payload.zoom}`);
    }
    const filters = filterParts.join(',');
    console.log('[FFmpeg] filters:', filters);
    console.log('[FFmpeg] filterParts:', filterParts);

    if (kind === 'image') {
      const outputPath = path.join(previewDir, `crop-${Date.now()}.png`);
      const args = ['-y', '-i', sourcePath, '-vf', filters, '-frames:v', '1', outputPath];
      console.log('[FFmpeg] image args:', args);
      await runFfmpeg(ffmpegPath, args);
      return {
        ok: true,
        preview: {
          url: pathToFileURL(outputPath).toString(),
          width: widthHint,
          height: heightHint,
          type: 'image/png',
          kind: 'image',
          ownedUrl: true
        }
      };
    }

    const outputPath = path.join(previewDir, `crop-${Date.now()}.mp4`);
    const args = [
      '-y',
      '-i',
      sourcePath,
      '-vf',
      filters,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-movflags',
      '+faststart',
      outputPath
    ];
    await runFfmpeg(ffmpegPath, args);
    return {
      ok: true,
      preview: {
        url: pathToFileURL(outputPath).toString(),
        width: widthHint,
        height: heightHint,
        durationMs,
        type: 'video/mp4',
        kind: 'video',
        ownedUrl: true
      }
    };
  } catch (error) {
    console.error('[NodeVision] preview crop failed', error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle('nodevision:preview:generate', async (_event, payload) => {
  try {
    if (!cachedSettings) throw new Error('Settings not initialized');
    const ffmpegPath = cachedSettings.ffmpegPath;
    if (!ffmpegPath) throw new Error('FFmpeg path missing');

    const nodes = payload?.nodes;
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      throw new Error('Nodes are required');
    }

    const previewDir = path.join(cachedSettings.tempRoot, 'generated-previews');
    await fs.mkdir(previewDir, { recursive: true });

    // Ensure chain ends with an export node for the plan builder
    const chainNodes = [...nodes];
    if (chainNodes[chainNodes.length - 1].typeId !== 'export') {
      chainNodes.push({
        id: 'preview-export',
        typeId: 'export',
        nodeVersion: '1.0.0',
        pixelFormat: 'rgba'
      });
    }

    const plan = buildFFmpegPlan({ nodes: chainNodes } as any, {
      preview: { width: 1280, height: 720 }
    });

    // Determine output format based on input type
    const isVideo = nodes.some(n => n.typeId === 'loadVideo');
    const ext = isVideo ? 'mp4' : 'png';
    const outputPath = path.join(previewDir, `preview-${Date.now()}.${ext}`);
    const args = planToArgs(plan, outputPath);

    if (!isVideo) {
      // For images, force single frame output
      // Find where output path is and insert -frames:v 1 before it
      const outputIndex = args.indexOf(outputPath);
      if (outputIndex !== -1) {
        args.splice(outputIndex - 1, 0, '-frames:v', '1');
      }
    } else {
      // For videos, add video encoding parameters
      const outputIndex = args.indexOf(outputPath);
      if (outputIndex !== -1) {
        // Insert video codec and quality settings before output path
        args.splice(outputIndex, 0, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23');
      }
    }

    console.log('[FFmpeg] preview generate args:', args);
    await runFfmpeg(ffmpegPath, args);

    return {
      ok: true,
      url: pathToFileURL(outputPath).toString(),
      path: outputPath
    };
  } catch (error) {
    console.error('[NodeVision] preview generate failed', error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

// Load image file as data URL for Canvas preview
ipcMain.handle('nodevision:image:loadAsDataURL', async (_event, payload) => {
  try {
    const { filePath } = payload;
    if (!filePath) {
      return { ok: false, message: 'File path is required' };
    }

    // Read file as buffer
    const buffer = await fs.readFile(filePath);

    // Detect MIME type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg';
    } else if (ext === '.png') {
      mimeType = 'image/png';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    }

    // Convert to base64 data URL
    const dataURL = `data:${mimeType};base64,${buffer.toString('base64')}`;

    return { ok: true, dataURL };
  } catch (error) {
    console.error('[NodeVision] loadImageAsDataURL failed', error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

// Open file dialog for LUT files
ipcMain.handle('nodevision:dialog:openFile', async (_event, payload) => {
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: payload?.title || 'Select file',
      defaultPath: payload?.defaultPath,
      filters: payload?.filters || [{ name: 'All Files', extensions: ['*'] }],
      properties: (payload?.properties as any[]) || ['openFile']
    });
    return { ok: true, filePaths, canceled };
  } catch (error) {
    console.error('[NodeVision] openFileDialog failed', error);
    return { ok: false, filePaths: [], canceled: true };
  }
});

// Read text file content
ipcMain.handle('nodevision:file:readText', async (_event, payload) => {
  try {
    const { filePath } = payload;
    if (!filePath) {
      return { ok: false, message: 'File path is required' };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return { ok: true, content };
  } catch (error) {
    console.error('[NodeVision] readTextFile failed', error);
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});

async function promptForFFmpegSetup(reason: string): Promise<void> {
  const settingsPath = getSettingsFilePath();
  const result = await dialog.showMessageBox({
    type: 'error',
    title: 'FFmpeg/FFprobe が見つかりません',
    message: 'FFmpeg または FFprobe を検出できませんでした。',
    detail: `${reason}\n\nFFmpeg をインストールするか、設定ファイルで ffmpegPath と ffprobePath を指定してください。\n設定ファイル: ${settingsPath}`,
    buttons: ['設定ファイルを開く', '閉じる'],
    defaultId: 0,
    cancelId: 1
  });

  if (result.response === 0) {
    await shell.showItemInFolder(settingsPath);
  }
}

async function ensureHttpToken(settings: NodeVisionSettings): Promise<TokenRecord> {
  const tokens = await tokenManager.list();
  const existing = tokens.find(record => record.label === settings.http.tokenLabel);
  if (existing) {
    process.env.NV_HTTP_TOKEN = existing.value;
    return existing;
  }

  const record = await tokenManager.issue({
    label: settings.http.tokenLabel,
    expiresInDays: 30,
    replaceExisting: false
  });
  process.env.NV_HTTP_TOKEN = record.value;
  return record;
}

function maybeStartHttpServer(status: BootStatus): void {
  const envEnabled = process.env.NV_HTTP === '1';
  if (!envEnabled) {
    console.log('[NodeVision] NV_HTTP is not set. HTTP server remains disabled.');
    return;
  }

  if (!status.settings.http.enabled) {
    console.log('[NodeVision] Settings disabled HTTP exposure. Skipping server start.');
    return;
  }

  if (httpServer) {
    console.log('[NodeVision] HTTP server already running. Skipping restart.');
    return;
  }

  const server = createInspectHttpServer({
    enabled: true,
    port: status.settings.http.port,
    maxConcurrent: 2,
    requestHistory: inspectHistory,
    validateToken: tokenValue => tokenManager.validate(tokenValue),
    handleInspect: (payload: InspectConcatRequest) =>
      inspectConcat(payload, {
        ffprobePath: status.ffmpeg.ffprobe.path
      }),
    logger: console
  });

  if (server) {
    httpServer = server;
    console.log('[NodeVision] HTTP inspect server listening on port', status.settings.http.port);
  }
}

async function bootstrapFoundation(): Promise<BootStatus> {
  const settings = await loadSettings();
  await ensureTempRoot(settings.tempRoot);
  const tempStatus = await enforceTempRoot(settings.tempRoot).catch(error => {
    if (error instanceof ResourceLimitError) {
      const isTotal = error.status.overTotalLimit;
      const limitType = isTotal ? 'Total tempRoot limit' : 'Single item limit';
      const limitValue = isTotal ? error.status.maxTotalBytes : error.status.maxSingleJobBytes;
      const currentVal = isTotal ? error.status.totalBytes : error.status.largestEntryBytes;

      throw new Error(
        `${limitType} exceeded: ${currentVal} bytes (limit ${limitValue}). Largest item: ${error.status.largestEntryBytes} bytes at ${error.status.largestEntryPath}`
      );
    }
    throw error;
  });

  if (tempStatus.deletedEntries.length > 0) {
    console.warn('[NodeVision] tempRoot LRU cleanup', tempStatus.deletedEntries);
  }

  const ffmpeg = await detectFFmpeg({
    ffmpegPath: settings.ffmpegPath ?? undefined,
    ffprobePath: settings.ffprobePath ?? undefined
  });
  const ffmpegDistribution = describeFfmpegDistribution(ffmpeg.ffmpeg);

  const refreshedSettings = await updateSettings(() => ({
    ffmpegPath: ffmpeg.ffmpeg.path,
    ffprobePath: ffmpeg.ffprobe.path
  }));

  const token = await ensureHttpToken(refreshedSettings);
  cachedSettings = refreshedSettings;
  return {
    settings: refreshedSettings,
    ffmpeg,
    token,
    distribution: {
      ffmpeg: ffmpegDistribution
    }
  };
}

function createWindow(status: BootStatus): void {
  const bootPayload = {
    status,
    templates: DEFAULT_NODE_TEMPLATES,
    nodes: seedDemoNodes(),
    connections: [],
    queue: getQueueSnapshot(),
    diagnostics: diagnosticsSnapshot()
  };
  const html = buildRendererHtml(bootPayload);
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: preloadPath
    }
  });

  // 開発時は開発者ツールを開く
  if (process.env.NODE_ENV !== 'production') {
    win.webContents.openDevTools();
  }

  const baseForData = `file://${status.settings.tempRoot}/`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, {
    baseURLForDataURL: baseForData
  });
}

function reportFatal(error: unknown, options: { silent?: boolean } = {}): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[NodeVision] bootstrap failed:', message);
  if (!options.silent) {
    dialog.showErrorBox('NodeVision bootstrap failed', message);
  }
  app.quit();
}

async function handleBootstrapError(error: unknown): Promise<void> {
  if (error instanceof BinaryNotFoundError) {
    await promptForFFmpegSetup(error.message);
    reportFatal(error, { silent: true });
    return;
  }

  reportFatal(error);
}

app.whenReady().then(() => {
  bootstrapFoundation()
    .then(status => {
      console.log('[NodeVision] FFmpeg ready at', status.ffmpeg.ffmpeg.path);
      console.log('[NodeVision] NV_HTTP_TOKEN issued for', status.settings.http.tokenLabel);
      maybeStartHttpServer(status);
      createWindow(status);
    })
    .catch(handleBootstrapError);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrapFoundation().then(createWindow).catch(handleBootstrapError);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
});
