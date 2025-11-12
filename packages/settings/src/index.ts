import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const SETTINGS_SCHEMA_VERSION = '1.0.7';
const SETTINGS_FILE_NAME = 'settings.json';

export interface NodeVisionSettings {
  schemaVersion: string;
  tempRoot: string;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  http: {
    enabled: boolean;
    tokenLabel: string;
    port: number;
  };
  presets: {
    videoBitrate: string;
    audioBitrate: string;
    container: 'mp4' | 'mov';
  };
  diagnostics: {
    lastTokenPreview: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface SettingsFileShape {
  version: string;
  data: NodeVisionSettings;
}

const defaultSettings = (): NodeVisionSettings => {
  const now = new Date().toISOString();
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    tempRoot: path.join(os.tmpdir(), 'nodevision-temp'),
    ffmpegPath: null,
    ffprobePath: null,
    http: {
      enabled: false,
      tokenLabel: 'default',
      port: 3921
    },
    presets: {
      videoBitrate: '8M',
      audioBitrate: '320k',
      container: 'mp4'
    },
    diagnostics: {
      lastTokenPreview: null
    },
    createdAt: now,
    updatedAt: now
  };
};

export class SettingsValidationError extends Error {}

export const getSettingsDirectory = (): string =>
  process.env.NODEVISION_SETTINGS_DIR ?? path.join(os.homedir(), '.nodevision');

export const getSettingsFilePath = (): string =>
  process.env.NODEVISION_SETTINGS_FILE ?? path.join(getSettingsDirectory(), SETTINGS_FILE_NAME);

const sanitizeSettings = (input: Partial<NodeVisionSettings> | null | undefined): NodeVisionSettings => {
  const defaults = defaultSettings();
  const merged = {
    ...defaults,
    ...input,
    http: {
      ...defaults.http,
      ...(input?.http ?? {})
    },
    presets: {
      ...defaults.presets,
      ...(input?.presets ?? {})
    },
    diagnostics: {
      ...defaults.diagnostics,
      ...(input?.diagnostics ?? {})
    }
  } satisfies NodeVisionSettings;

  return {
    ...merged,
    tempRoot: path.resolve(merged.tempRoot),
    ffmpegPath: merged.ffmpegPath ? path.resolve(merged.ffmpegPath) : null,
    ffprobePath: merged.ffprobePath ? path.resolve(merged.ffprobePath) : null
  };
};

const serialize = (settings: NodeVisionSettings): string =>
  JSON.stringify(
    {
      version: SETTINGS_SCHEMA_VERSION,
      data: settings
    } satisfies SettingsFileShape,
    null,
    2
  );

async function ensureDirectoryExists(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readSettingsFile(filePath: string): Promise<SettingsFileShape | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as SettingsFileShape;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw new SettingsValidationError('設定ファイルの読み込みに失敗しました');
  }
}

export async function loadSettings(): Promise<NodeVisionSettings> {
  const filePath = getSettingsFilePath();
  await ensureDirectoryExists(path.dirname(filePath));

  const stored = await readSettingsFile(filePath);
  if (!stored) {
    const defaults = defaultSettings();
    await fs.writeFile(filePath, serialize(defaults), 'utf-8');
    return defaults;
  }

  const normalized = sanitizeSettings(stored.data);
  return {
    ...normalized,
    schemaVersion: SETTINGS_SCHEMA_VERSION
  };
}

export async function saveSettings(settings: NodeVisionSettings): Promise<NodeVisionSettings> {
  const filePath = getSettingsFilePath();
  await ensureDirectoryExists(path.dirname(filePath));
  const payload = {
    ...settings,
    updatedAt: new Date().toISOString()
  } satisfies NodeVisionSettings;

  await fs.writeFile(filePath, serialize(payload), 'utf-8');
  return payload;
}

export type SettingsUpdater = (current: NodeVisionSettings) => NodeVisionSettings | Partial<NodeVisionSettings>;

export async function updateSettings(updater: SettingsUpdater): Promise<NodeVisionSettings> {
  const current = await loadSettings();
  const updated = updater(current);
  const merged = sanitizeSettings({
    ...current,
    ...(updated as NodeVisionSettings | Partial<NodeVisionSettings>)
  });

  return saveSettings({
    ...merged,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  });
}

export function getHttpTokenPreview(token: string): string {
  if (!token) {
    return '';
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function rememberHttpTokenPreview(token: string): Promise<void> {
  const preview = getHttpTokenPreview(token);
  await updateSettings(current => ({
    diagnostics: {
      ...current.diagnostics,
      lastTokenPreview: preview
    }
  }));
}
