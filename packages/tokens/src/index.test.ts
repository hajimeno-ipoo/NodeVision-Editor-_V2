import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rememberHttpTokenPreview } from '@nodevision/settings';

import {
  createTokenManager,
  FileTokenStore,
  TokenManager,
  TokenNotFoundError,
  TokenRecord,
  TokenStore
} from './index';

vi.mock('@nodevision/settings', () => ({
  rememberHttpTokenPreview: vi.fn().mockResolvedValue(undefined)
}));

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

const mockedRememberPreview = vi.mocked(rememberHttpTokenPreview);

describe('TokenManager with memory store', () => {
  beforeEach(() => {
    mockedRememberPreview.mockClear();
  });

  it('issues a new token and persists it', async () => {
    const manager = new TokenManager({ store: new MemoryStore() });
    const record = await manager.issue({ label: 'default', expiresInDays: 1 });

    expect(record.label).toBe('default');
    expect(record.value).toHaveLength(64);
    expect(mockedRememberPreview).toHaveBeenCalledTimes(1);
  });

  it('rotates an existing token and keeps the previous one in grace state', async () => {
    const store = new MemoryStore();
    const manager = new TokenManager({ store });

    const issued = await manager.issue({ label: 'default' });
    const rotated = await manager.rotate({ label: 'default', graceMinutes: 10 });

    expect(rotated.value).not.toBe(issued.value);
    expect(rotated.grace?.value).toBe(issued.value);

    const result = await manager.validate(issued.value, new Date());
    expect(result?.status).toBe('grace');
  });

  it('validates tokens and reports expiration', async () => {
    const store = new MemoryStore();
    const manager = new TokenManager({ store });

    const issued = await manager.issue({ label: 'default', expiresInDays: 0.0001 });
    const valid = await manager.validate(issued.value);
    expect(valid?.status).toBe('valid');

    const later = new Date(Date.now() + 60 * 60 * 1000);
    const expired = await manager.validate(issued.value, later);
    expect(expired?.status).toBe('expired');
  });

  it('marks the grace token as expired once the window closes', async () => {
    const store = new MemoryStore();
    const manager = new TokenManager({ store });
    const issued = await manager.issue({ label: 'default' });
    await manager.rotate({ label: 'default', graceMinutes: 1 });

    const future = new Date(Date.now() + 5 * 60 * 1000);
    const result = await manager.validate(issued.value, future);
    expect(result?.status).toBe('expired');
  });

  it('rejects duplicate issue calls when replaceExisting is false', async () => {
    const store = new MemoryStore();
    const manager = new TokenManager({ store });
    await manager.issue({ label: 'default' });

    await expect(manager.issue({ label: 'default' })).rejects.toThrow(/already exists/);
  });

  it('throws when rotating a missing token', async () => {
    const store = new MemoryStore();
    const manager = new TokenManager({ store });
    await expect(manager.rotate({ label: 'ghost' })).rejects.toBeInstanceOf(TokenNotFoundError);
  });

  it('revokes a token', async () => {
    const store = new MemoryStore();
    const manager = new TokenManager({ store });
    const record = await manager.issue({ label: 'default' });
    await manager.revoke('default');

    const result = await manager.validate(record.value);
    expect(result).toBeNull();
  });
});

describe('FileTokenStore', () => {
  let tempFile: string;

  beforeEach(async () => {
    tempFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'tokens-')), 'tokens.json');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(tempFile), { recursive: true, force: true });
  });

  it('persists tokens to disk', async () => {
    const store = new FileTokenStore(tempFile);
    const manager = new TokenManager({ store });

    await manager.issue({ label: 'disk' });
    const listed = await manager.list();
    expect(listed).toHaveLength(1);

    const raw = JSON.parse(await fs.readFile(tempFile, 'utf-8'));
    expect(raw.disk.label).toBe('disk');
  });

  it('deletes tokens from disk', async () => {
    const store = new FileTokenStore(tempFile);
    const record: TokenRecord = {
      label: 'temp',
      value: 'value',
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await store.save('temp', record);
    await store.delete('temp');
    const raw = JSON.parse(await fs.readFile(tempFile, 'utf-8'));
    expect(raw.temp).toBeUndefined();
  });

  it('surfaces unexpected read errors', async () => {
    const store = new FileTokenStore(tempFile);
    await fs.writeFile(tempFile, '{}');
    const spy = vi.spyOn(fs, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('boom'), { code: 'EACCES' })
    );

    await expect(store.list()).rejects.toThrow('boom');

    spy.mockRestore();
  });
});

describe('createTokenManager helper', () => {
  it('creates a manager when a custom store is provided', async () => {
    const manager = createTokenManager({ store: new MemoryStore() });
    await manager.issue({ label: 'helper', replaceExisting: true });
    const tokens = await manager.list();
    expect(tokens[0]?.label).toBe('helper');
  });
});

describe('TokenManager fallback store', () => {
  it('writes to the file store when keytar is missing', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'token-fallback-'));
    const filePath = path.join(dir, 'tokens.json');
    process.env.NODEVISION_TOKEN_FILE = filePath;
    process.env.NODEVISION_DISABLE_KEYTAR = '1';

    const manager = new TokenManager();
    await manager.issue({ label: 'fallback', replaceExisting: true });
    const tokens = await manager.list();
    expect(tokens[0]?.label).toBe('fallback');

    delete process.env.NODEVISION_TOKEN_FILE;
    delete process.env.NODEVISION_DISABLE_KEYTAR;
    await fs.rm(dir, { recursive: true, force: true });
  });
});
