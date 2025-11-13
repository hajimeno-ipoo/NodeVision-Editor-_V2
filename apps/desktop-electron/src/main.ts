import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  type JobRunResult
} from '@nodevision/engine';
import { getSettingsFilePath, loadSettings, NodeVisionSettings, updateSettings } from '@nodevision/settings';
import {
  BinaryNotFoundError,
  detectFFmpeg,
  ensureTempRoot,
  enforceTempRoot,
  FFmpegDetectionResult,
  ResourceLimitError
} from '@nodevision/system-check';
import { createTokenManager, TokenRecord } from '@nodevision/tokens';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { buildRendererHtml } from './ui-template';
import { buildQueueWarnings } from './queue-warnings';
import type { BootStatus, QueueSnapshot } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, 'preload.js');

const tokenManager = createTokenManager();
const jobQueue = new JobQueue({ maxQueueLength: 4, queueTimeoutMs: 3 * 60_000 });
const inspectHistory = new InMemoryInspectRequestHistory(20);
let httpServer: HttpServer | null = null;
let cachedSettings: NodeVisionSettings | null = null;
let lastExportSummary: { outputPath: string; sha256: string; generatedAt: string } | null = null;

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

ipcMain.handle('nodevision:queue:snapshot', () => getQueueSnapshot());

ipcMain.handle('nodevision:queue:enqueue', async (_event, payload) => {
  try {
    const label = (payload?.name as string | undefined)?.trim() || `ジョブ ${new Date().toLocaleTimeString()}`;
    enqueueDemoJob(label);
    return { ok: true };
  } catch (error) {
    if (error instanceof QueueFullError) {
      return { ok: false, code: 'QUEUE_FULL', max: error.maxQueueLength };
    }
    throw error;
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
      throw new Error(
        `tempRoot limit exceeded: total=${error.status.totalBytes} bytes (limit ${error.status.maxTotalBytes}), largest=${error.status.largestEntryBytes} bytes at ${error.status.largestEntryPath}`
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

  const refreshedSettings = await updateSettings(() => ({
    ffmpegPath: ffmpeg.ffmpeg.path,
    ffprobePath: ffmpeg.ffprobe.path
  }));

  const token = await ensureHttpToken(refreshedSettings);
  cachedSettings = refreshedSettings;
  return { settings: refreshedSettings, ffmpeg, token };
}

function createWindow(status: BootStatus): void {
  const bootPayload = {
    status,
    templates: DEFAULT_NODE_TEMPLATES,
    nodes: seedDemoNodes(),
    queue: getQueueSnapshot(),
    diagnostics: diagnosticsSnapshot()
  };
  const html = buildRendererHtml(bootPayload);
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  });

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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
