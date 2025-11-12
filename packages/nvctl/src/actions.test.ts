import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NodeVisionSettings } from '@nodevision/settings';
import { TokenManager, TokenRecord, TokenStore } from '@nodevision/tokens';

import {
  issueTokenAction,
  listTokensAction,
  revokeTokenAction,
  rotateTokenAction,
  setTempRootAction,
  showSettingsAction
} from './actions';

class MemoryStore implements TokenStore {
  private data = new Map<string, TokenRecord>();

  async save(label: string, record: TokenRecord): Promise<void> {
    this.data.set(label, record);
  }

  async get(label: string): Promise<TokenRecord | null> {
    return this.data.get(label) ?? null;
  }

  async list(): Promise<TokenRecord[]> {
    return [...this.data.values()];
  }

  async delete(label: string): Promise<void> {
    this.data.delete(label);
  }
}

const createSettings = (): NodeVisionSettings => {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: '1.0.7',
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
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

const createContext = () => {
  let settings = createSettings();
  const store = new MemoryStore();
  const manager = new TokenManager({ store });
  const loadSettings = vi.fn(async () => settings);
  const updateSettings = vi.fn(async updater => {
    const result = updater(settings);
    settings = {
      ...settings,
      ...(result as Partial<NodeVisionSettings>)
    };
    settings.updatedAt = new Date().toISOString();
    return settings;
  });
  const ensureTempRootDir = vi.fn(async (dir: string) => dir);

  return {
    ctx: {
      manager,
      loadSettings,
      updateSettings,
      ensureTempRootDir
    },
    loadSettings,
    updateSettings,
    ensureTempRootDir
  };
};

describe('nvctl actions', () => {
  let context: ReturnType<typeof createContext>;

  beforeEach(() => {
    context = createContext();
  });

  it('issues tokens and syncs settings', async () => {
    const record = await issueTokenAction(
      { label: 'default', expiresInDays: 1, force: true },
      context.ctx
    );

    expect(record.value).toHaveLength(64);
    expect(context.updateSettings).toHaveBeenCalled();
  });

  it('rotates tokens with grace period', async () => {
    await issueTokenAction({ label: 'default', expiresInDays: 1, force: true }, context.ctx);
    const rotated = await rotateTokenAction(
      { label: 'default', expiresInDays: 1, graceMinutes: 15 },
      context.ctx
    );

    expect(rotated.grace).toBeTruthy();
  });

  it('lists tokens', async () => {
    await issueTokenAction({ label: 'a', expiresInDays: 1, force: true }, context.ctx);
    await issueTokenAction({ label: 'b', expiresInDays: 1, force: true }, context.ctx);

    const tokens = await listTokensAction(context.ctx);
    expect(tokens).toHaveLength(2);
  });

  it('revokes tokens through the action helper', async () => {
    await issueTokenAction({ label: 'default', expiresInDays: 1, force: true }, context.ctx);
    await revokeTokenAction('default', context.ctx);
    const tokens = await listTokensAction(context.ctx);
    expect(tokens).toHaveLength(0);
  });

  it('updates tempRoot', async () => {
    const target = './relative-temp';
    const updated = await setTempRootAction(target, context.ctx);
    expect(path.isAbsolute(updated.tempRoot)).toBe(true);
    expect(updated.tempRoot.endsWith('relative-temp')).toBe(true);
    expect(context.ensureTempRootDir).toHaveBeenCalled();
  });

  it('shows settings via the helper', async () => {
    const result = await showSettingsAction(context.ctx);
    expect(context.loadSettings).toHaveBeenCalled();
    expect(result.schemaVersion).toBe('1.0.7');
  });
});
