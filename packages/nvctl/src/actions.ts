import path from 'node:path';

import { ensureTempRoot } from '@nodevision/system-check';
import {
  loadSettings,
  NodeVisionSettings,
  updateSettings
} from '@nodevision/settings';
import {
  createTokenManager,
  TokenManager,
  TokenRecord
} from '@nodevision/tokens';

export interface NvctlContext {
  manager: TokenManager;
  loadSettings: typeof loadSettings;
  updateSettings: typeof updateSettings;
  ensureTempRootDir: typeof ensureTempRoot;
}

/* c8 ignore start */
export const createNvctlContext = (): NvctlContext => ({
  manager: createTokenManager(),
  loadSettings,
  updateSettings,
  ensureTempRootDir: ensureTempRoot
});
/* c8 ignore end */

const syncTokenLabel = async (
  ctx: NvctlContext,
  label: string
): Promise<NodeVisionSettings> =>
  ctx.updateSettings(current => ({
    http: {
      ...current.http,
      tokenLabel: label
    }
  }));

export interface IssueTokenActionInput {
  label: string;
  expiresInDays: number;
  force: boolean;
}

export const issueTokenAction = async (
  input: IssueTokenActionInput,
  ctx = createNvctlContext()
): Promise<TokenRecord> => {
  const record = await ctx.manager.issue({
    label: input.label,
    expiresInDays: input.expiresInDays,
    replaceExisting: input.force
  });
  await syncTokenLabel(ctx, input.label);
  return record;
};

export interface RotateTokenActionInput {
  label: string;
  expiresInDays: number;
  graceMinutes: number;
}

export const rotateTokenAction = async (
  input: RotateTokenActionInput,
  ctx = createNvctlContext()
): Promise<TokenRecord> => {
  const record = await ctx.manager.rotate({
    label: input.label,
    expiresInDays: input.expiresInDays,
    graceMinutes: input.graceMinutes
  });
  await syncTokenLabel(ctx, input.label);
  return record;
};

export const revokeTokenAction = async (
  label: string,
  ctx = createNvctlContext()
): Promise<void> => {
  await ctx.manager.revoke(label);
};

export const listTokensAction = async (ctx = createNvctlContext()): Promise<TokenRecord[]> =>
  ctx.manager.list();

export const showSettingsAction = async (ctx = createNvctlContext()): Promise<NodeVisionSettings> =>
  ctx.loadSettings();

export const setTempRootAction = async (
  targetPath: string,
  ctx = createNvctlContext()
): Promise<NodeVisionSettings> => {
  const resolved = path.resolve(targetPath);
  await ctx.ensureTempRootDir(resolved);
  return ctx.updateSettings(() => ({
    tempRoot: resolved
  }));
};
