import { describe, expect, it } from 'vitest';

import { calculatePreviewSize } from './preview-size';

describe('calculatePreviewSize', () => {
  it('does not upscale beyond original dimensions', () => {
    const size = calculatePreviewSize({
      nodeWidth: 800,
      nodeHeight: 800,
      chromePadding: 100,
      reservedHeight: 120,
      widthLimit: 500,
      minHeight: 240,
      minWidth: 200,
      aspectRatio: 16 / 9,
      originalWidth: 300,
      originalHeight: 180
    });
    expect(size.width).toBeLessThanOrEqual(300);
    expect(size.height).toBeLessThanOrEqual(180);
  });

  it('respects height availability when node is short', () => {
    const size = calculatePreviewSize({
      nodeWidth: 500,
      nodeHeight: 360,
      chromePadding: 120,
      reservedHeight: 80,
      widthLimit: 340,
      minHeight: 200,
      minWidth: 200,
      aspectRatio: 1,
      originalWidth: 400,
      originalHeight: 400
    });
    expect(size.height).toBeCloseTo(216, 5);
    expect(size.width).toBeCloseTo(216, 5);
  });

  it('enforces minimum preview height when space allows', () => {
    const size = calculatePreviewSize({
      nodeWidth: 400,
      nodeHeight: 600,
      chromePadding: 120,
      reservedHeight: 100,
      widthLimit: 260,
      minHeight: 220,
      minWidth: 200,
      aspectRatio: 9 / 16,
      originalWidth: 500,
      originalHeight: 900
    });
    expect(size.height).toBeGreaterThanOrEqual(220);
  });

  it('uses available width when original size is unknown', () => {
    const size = calculatePreviewSize({
      nodeWidth: 420,
      nodeHeight: 700,
      chromePadding: 140,
      reservedHeight: 150,
      widthLimit: 260,
      minHeight: 200,
      minWidth: 200,
      aspectRatio: 4 / 3
    });
    expect(size.width).toBeCloseTo(260, 5);
  });

  it('clamps aspect ratio to avoid extreme flattening', () => {
    const size = calculatePreviewSize({
      nodeWidth: 500,
      nodeHeight: 600,
      chromePadding: 120,
      reservedHeight: 100,
      widthLimit: 460,
      minHeight: 240,
      minWidth: 200,
      aspectRatio: 20, // unrealistically wide
      originalWidth: 1000,
      originalHeight: 100
    });
    expect(size.height).toBeGreaterThan(0);
    expect(size.width / size.height).toBeLessThanOrEqual(4);
  });

  it('guarantees a minimum portion of node height for preview', () => {
    const size = calculatePreviewSize({
      nodeWidth: 380,
      nodeHeight: 480,
      chromePadding: 200,
      reservedHeight: 200,
      widthLimit: 300,
      minHeight: 200,
      minWidth: 200,
      aspectRatio: 1,
      minimumNodePortion: 0.5
    });
    expect(size.height).toBeGreaterThanOrEqual(240); // 480 * 0.5
  });

  it('keeps preview visible even for very small nodes', () => {
    const size = calculatePreviewSize({
      nodeWidth: 350,
      nodeHeight: 260,
      chromePadding: 120,
      reservedHeight: 100,
      widthLimit: 260,
      minHeight: 200,
      minWidth: 200,
      aspectRatio: 1.2,
      originalWidth: 1000,
      originalHeight: 1000
    });
    expect(size.height).toBeGreaterThan(0);
    expect(size.width).toBeGreaterThan(0);
  });

  it('allows callers to demand near-full node height', () => {
    const size = calculatePreviewSize({
      nodeWidth: 900,
      nodeHeight: 800,
      chromePadding: 50,
      reservedHeight: 30,
      widthLimit: 900,
      minHeight: 150,
      minWidth: 150,
      aspectRatio: 1,
      minimumNodePortion: 0.9
    });
    expect(size.height).toBeCloseTo(720, 5);
  });
});
