import { app, BrowserWindow, dialog } from 'electron';

import { loadSettings, NodeVisionSettings, updateSettings } from '@nodevision/settings';
import {
  detectFFmpeg,
  ensureTempRoot,
  enforceTempRoot,
  FFmpegDetectionResult,
  ResourceLimitError
} from '@nodevision/system-check';
import { createTokenManager, TokenRecord } from '@nodevision/tokens';

const tokenManager = createTokenManager();

interface BootStatus {
  settings: NodeVisionSettings;
  ffmpeg: FFmpegDetectionResult;
  token: TokenRecord;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

async function bootstrapFoundation(): Promise<BootStatus> {
  const settings = await loadSettings();
  await ensureTempRoot(settings.tempRoot);
  await enforceTempRoot(settings.tempRoot).catch(error => {
    if (error instanceof ResourceLimitError) {
      throw new Error(
        `tempRoot limit exceeded: total=${error.status.totalBytes} bytes, largest=${error.status.largestEntryBytes} bytes`
      );
    }
    throw error;
  });

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

function reportFatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[NodeVision] bootstrap failed:', message);
  dialog.showErrorBox('NodeVision bootstrap failed', message);
  app.quit();
}

app.whenReady().then(() => {
  bootstrapFoundation()
    .then(status => {
      console.log('[NodeVision] FFmpeg ready at', status.ffmpeg.ffmpeg.path);
      console.log('[NodeVision] NV_HTTP_TOKEN issued for', status.settings.http.tokenLabel);
      createWindow(status);
    })
    .catch(reportFatal);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrapFoundation().then(createWindow).catch(reportFatal);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
