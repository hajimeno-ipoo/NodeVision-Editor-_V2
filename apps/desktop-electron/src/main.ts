import type { Server as HttpServer } from 'node:http';

import { createInspectHttpServer, inspectConcat, type InspectConcatRequest } from '@nodevision/engine';
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
import { app, BrowserWindow, dialog, shell } from 'electron';

const tokenManager = createTokenManager();
let httpServer: HttpServer | null = null;

interface BootStatus {
  settings: NodeVisionSettings;
  ffmpeg: FFmpegDetectionResult;
  token: TokenRecord;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  return { settings: refreshedSettings, ffmpeg, token };
}

function buildHtml(status: BootStatus): string {
  const rows = [
    `<li>FFmpeg: <strong>${escapeHtml(status.ffmpeg.ffmpeg.path)}</strong> (${escapeHtml(
      status.ffmpeg.ffmpeg.version ?? 'unknown version'
    )})</li>`,
    `<li>FFprobe: <strong>${escapeHtml(status.ffmpeg.ffprobe.path)}</strong></li>`,
    `<li>tempRoot: <strong>${escapeHtml(status.settings.tempRoot)}</strong></li>`,
    `<li>HTTP token label: <strong>${escapeHtml(status.settings.http.tokenLabel)}</strong></li>`
  ].join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>NodeVision Foundation</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; }
      ul { line-height: 1.6; }
    </style>
  </head>
  <body>
    <h1>NodeVision Foundation Ready</h1>
    <p>FFmpeg/HTTP 基盤を初期化しました。</p>
    <ul>${rows}</ul>
  </body>
</html>`;
}

function createWindow(status: BootStatus): void {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      contextIsolation: true
    }
  });

  win.loadURL(`data:text/html,${encodeURIComponent(buildHtml(status))}`);
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
