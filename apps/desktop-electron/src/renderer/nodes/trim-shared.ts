import type { TrimNodeSettings } from '@nodevision/editor';

import type { RendererNode } from '../types';

const cloneRegion = (region?: TrimNodeSettings['region']): TrimNodeSettings['region'] => {
  if (!region) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  return {
    x: region.x ?? 0,
    y: region.y ?? 0,
    width: region.width ?? 1,
    height: region.height ?? 1
  };
};

export const DEFAULT_TRIM_SETTINGS: TrimNodeSettings = {
  kind: 'trim',
  startMs: null,
  endMs: null,
  strictCut: false,
  region: { x: 0, y: 0, width: 1, height: 1 }
};

const cloneSettings = (): TrimNodeSettings => ({
  kind: 'trim',
  startMs: DEFAULT_TRIM_SETTINGS.startMs,
  endMs: DEFAULT_TRIM_SETTINGS.endMs,
  strictCut: DEFAULT_TRIM_SETTINGS.strictCut,
  region: cloneRegion(DEFAULT_TRIM_SETTINGS.region)
});

export const ensureTrimSettings = (node: RendererNode): TrimNodeSettings => {
  const current = node.settings;
  if (current && current.kind === 'trim') {
    current.region = cloneRegion(current.region);
    return current;
  }
  const next = cloneSettings();
  node.settings = next;
  return next;
};

export const formatTrimTimecode = (value: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '00:00.000';
  }
  const positive = Math.max(0, Math.floor(value));
  const minutes = Math.floor(positive / 60000);
  const seconds = Math.floor((positive % 60000) / 1000);
  const millis = positive % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis
    .toString()
    .padStart(3, '0')}`;
};
