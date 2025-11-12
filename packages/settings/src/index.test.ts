import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getHttpTokenPreview,
  getSettingsFilePath,
  loadSettings,
  rememberHttpTokenPreview,
  SettingsValidationError,
  updateSettings
} from './index';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nodevision-settings-test-'));
  process.env.NODEVISION_SETTINGS_DIR = tempDir;
  delete process.env.NODEVISION_SETTINGS_FILE;
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  delete process.env.NODEVISION_SETTINGS_DIR;
  delete process.env.NODEVISION_SETTINGS_FILE;
});

describe('settings persistence', () => {
  it('creates the settings file with defaults when missing', async () => {
    const settings = await loadSettings();
    const filePath = getSettingsFilePath();
    const fileExists = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(fileExists);

    expect(settings.schemaVersion).toBe('1.0.7');
    expect(parsed.data.tempRoot).toBe(settings.tempRoot);
  });

  it('updates settings while keeping createdAt intact', async () => {
    const initial = await loadSettings();
    await new Promise(resolve => setTimeout(resolve, 5));
    const updated = await updateSettings(current => ({
      tempRoot: path.join(tempDir, 'custom-temp'),
      http: {
        ...current.http,
        enabled: true,
        tokenLabel: 'rotated'
      }
    }));

    expect(updated.createdAt).toBe(initial.createdAt);
    expect(updated.updatedAt).not.toBe(initial.updatedAt);
    expect(updated.tempRoot).toContain('custom-temp');
    expect(updated.http.enabled).toBe(true);
  });

  it('stores the last token preview for diagnostics', async () => {
    await loadSettings();
    await rememberHttpTokenPreview('abcd1234wxyz9876');
    const settings = await loadSettings();

    expect(settings.diagnostics.lastTokenPreview).toBe('abcd...9876');
  });

  it('normalizes relative paths when loading stored settings', async () => {
    const filePath = getSettingsFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const payload = {
      version: '1.0.7',
      data: {
        schemaVersion: '1.0.7',
        tempRoot: '.',
        ffmpegPath: './bin/ffmpeg',
        ffprobePath: './bin/ffprobe',
        http: { enabled: true, tokenLabel: 'custom', port: 4000 },
        presets: { videoBitrate: '4M', audioBitrate: '128k', container: 'mov' },
        diagnostics: { lastTokenPreview: 'test' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));

    const loaded = await loadSettings();
    expect(path.isAbsolute(loaded.tempRoot)).toBe(true);
    expect(path.isAbsolute(loaded.ffmpegPath ?? '')).toBe(true);
    expect(loaded.http.tokenLabel).toBe('custom');
  });

  it('fills defaults when optional sections are missing', async () => {
    const filePath = getSettingsFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const payload = {
      version: '1.0.7',
      data: {
        schemaVersion: '1.0.7',
        tempRoot: '.',
        ffmpegPath: null,
        ffprobePath: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2));

    const loaded = await loadSettings();
    expect(loaded.http.tokenLabel).toBe('default');
    expect(loaded.presets.container).toBe('mp4');
    expect(loaded.diagnostics.lastTokenPreview).toBeNull();
  });

  it('throws an error when the settings file is malformed', async () => {
    const filePath = getSettingsFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, '{"version": "1.0.7"', 'utf-8');

    await expect(loadSettings()).rejects.toBeInstanceOf(SettingsValidationError);
  });

  it('returns an empty preview when token is empty', () => {
    expect(getHttpTokenPreview('')).toBe('');
  });
});
