import { describe, expect, it } from 'vitest';

import { getLoadNodeReservedHeight, getMediaPreviewReservedHeight } from './preview-layout';

describe('preview layout helpers', () => {
  it('keeps load node reserved height smaller when preview is ready', () => {
    expect(getLoadNodeReservedHeight(true)).toBeLessThan(getLoadNodeReservedHeight(false));
    expect(getLoadNodeReservedHeight(true)).toBe(120);
  });

  it('reduces media preview reserved height once a preview is present', () => {
    expect(getMediaPreviewReservedHeight(true)).toBeLessThan(getMediaPreviewReservedHeight(false));
    expect(getMediaPreviewReservedHeight(true)).toBe(80);
  });
});
