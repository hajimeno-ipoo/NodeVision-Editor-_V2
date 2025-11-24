import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { rememberHttpTokenPreview } from '@nodevision/settings';

export enum NodeType {
  LOADMEDIA = 'loadmedia',
  BATCHCROP = 'batchcrop'
}

export interface TokenRecord {
  label: string;
  value: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  grace?: {
    value: string;
    expiresAt: string;
  };
}

export interface TokenValidationResult {
  label: string;
  status: 'valid' | 'expired' | 'grace';
  expiresAt: string;
  graceExpiresAt?: string;
}

export interface TokenManagerOptions {
  serviceName?: string;
  store?: TokenStore;
  fallbackFilePath?: string;
}

export interface IssueTokenOptions {
  label: string;
  expiresInDays?: number;
  replaceExisting?: boolean;
}

export interface RotateTokenOptions {
  label: string;
  expiresInDays?: number;
  graceMinutes?: number;
}

export interface TokenStore {
  save(label: string, record: TokenRecord): Promise<void>;
  get(label: string): Promise<TokenRecord | null>;
  list(): Promise<TokenRecord[]>;
  delete(label: string): Promise<void>;
}

/* c8 ignore start */
class KeytarTokenStore implements TokenStore {
  constructor(private serviceName: string, private keytar: typeof import('keytar')) { }

  async save(label: string, record: TokenRecord): Promise<void> {
    await this.keytar.setPassword(this.serviceName, label, JSON.stringify(record));
  }

  async get(label: string): Promise<TokenRecord | null> {
    const value = await this.keytar.getPassword(this.serviceName, label);
    return value ? (JSON.parse(value) as TokenRecord) : null;
  }

  async list(): Promise<TokenRecord[]> {
    const credentials = await this.keytar.findCredentials(this.serviceName);
    return credentials.map(entry => JSON.parse(entry.password) as TokenRecord);
  }

  async delete(label: string): Promise<void> {
    await this.keytar.deletePassword(this.serviceName, label);
  }
}
/* c8 ignore end */

class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string) { }

  private async readAll(): Promise<Record<string, TokenRecord>> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as Record<string, TokenRecord>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async writeAll(data: Record<string, TokenRecord>): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async save(label: string, record: TokenRecord): Promise<void> {
    const data = await this.readAll();
    data[label] = record;
    await this.writeAll(data);
  }

  async get(label: string): Promise<TokenRecord | null> {
    const data = await this.readAll();
    return data[label] ?? null;
  }

  async list(): Promise<TokenRecord[]> {
    const data = await this.readAll();
    return Object.values(data);
  }

  async delete(label: string): Promise<void> {
    const data = await this.readAll();
    delete data[label];
    await this.writeAll(data);
  }
}

export class TokenNotFoundError extends Error {
  constructor(label: string) {
    super(`Token '${label}' was not found`);
  }
}

export class TokenManager {
  private readonly serviceName: string;
  private readonly fallbackFilePath: string;
  private memoizedStore?: Promise<TokenStore>;

  constructor(private readonly options: TokenManagerOptions = {}) {
    this.serviceName = options.serviceName ?? 'NodeVision Editor';
    const fallbackFromEnv = process.env.NODEVISION_TOKEN_FILE;
    this.fallbackFilePath =
      options.fallbackFilePath ?? fallbackFromEnv ?? path.join(os.homedir(), '.nodevision', 'tokens.json');
  }

  private async resolveStore(): Promise<TokenStore> {
    if (this.options.store) {
      return this.options.store;
    }

    if (!this.memoizedStore) {
      this.memoizedStore = this.createStore();
    }

    return this.memoizedStore;
  }

  private async createStore(): Promise<TokenStore> {
    if (process.env.NODEVISION_DISABLE_KEYTAR === '1') {
      return new FileTokenStore(this.fallbackFilePath);
    }
    /* c8 ignore start */
    try {
      const keytar = await import('keytar');
      return new KeytarTokenStore(this.serviceName, keytar);
    } catch {
      return new FileTokenStore(this.fallbackFilePath);
    }
    /* c8 ignore end */
  }

  private static createTokenValue(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  private static isoInFuture(minutes: number, baseDate = new Date()): string {
    return new Date(baseDate.getTime() + minutes * 60 * 1000).toISOString();
  }

  async issue(options: IssueTokenOptions): Promise<TokenRecord> {
    const store = await this.resolveStore();
    const now = new Date();
    const existing = await store.get(options.label);
    if (existing && !options.replaceExisting) {
      throw new Error(`Token '${options.label}' already exists. Use rotate or set replaceExisting.`);
    }

    const tokenValue = TokenManager.createTokenValue();
    const expiresAt = TokenManager.isoInFuture((options.expiresInDays ?? 30) * 24 * 60, now);
    const record: TokenRecord = {
      label: options.label,
      value: tokenValue,
      expiresAt,
      createdAt: existing?.createdAt ?? now.toISOString(),
      updatedAt: now.toISOString()
    };

    await store.save(options.label, record);
    await rememberHttpTokenPreview(tokenValue);
    return record;
  }

  async rotate(options: RotateTokenOptions): Promise<TokenRecord> {
    const store = await this.resolveStore();
    const existing = await store.get(options.label);
    if (!existing) {
      throw new TokenNotFoundError(options.label);
    }

    const now = new Date();
    const newToken = TokenManager.createTokenValue();
    const graceMinutes = options.graceMinutes ?? 15;
    const record: TokenRecord = {
      ...existing,
      value: newToken,
      expiresAt: TokenManager.isoInFuture((options.expiresInDays ?? 30) * 24 * 60, now),
      grace: {
        value: existing.value,
        expiresAt: TokenManager.isoInFuture(graceMinutes, now)
      },
      updatedAt: now.toISOString()
    };

    await store.save(options.label, record);
    await rememberHttpTokenPreview(newToken);
    return record;
  }

  async revoke(label: string): Promise<void> {
    const store = await this.resolveStore();
    await store.delete(label);
  }

  async list(): Promise<TokenRecord[]> {
    const store = await this.resolveStore();
    const records = await store.list();
    return records.sort((a, b) => a.label.localeCompare(b.label));
  }

  async validate(tokenValue: string, now = new Date()): Promise<TokenValidationResult | null> {
    const store = await this.resolveStore();
    const candidates = await store.list();

    for (const record of candidates) {
      if (record.value === tokenValue) {
        if (new Date(record.expiresAt) < now) {
          return {
            label: record.label,
            status: 'expired',
            expiresAt: record.expiresAt
          } satisfies TokenValidationResult;
        }

        return {
          label: record.label,
          status: 'valid',
          expiresAt: record.expiresAt,
          graceExpiresAt: record.grace?.expiresAt
        } satisfies TokenValidationResult;
      }

      if (record.grace && record.grace.value === tokenValue) {
        if (new Date(record.grace.expiresAt) < now) {
          return {
            label: record.label,
            status: 'expired',
            expiresAt: record.expiresAt,
            graceExpiresAt: record.grace.expiresAt
          } satisfies TokenValidationResult;
        }

        return {
          label: record.label,
          status: 'grace',
          expiresAt: record.expiresAt,
          graceExpiresAt: record.grace.expiresAt
        } satisfies TokenValidationResult;
      }
    }

    return null;
  }
}

export const createTokenManager = (options?: TokenManagerOptions): TokenManager =>
  new TokenManager(options);

export { FileTokenStore };
