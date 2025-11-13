import { describe, expect, it } from 'vitest';

import { alignNodes, buildGridStyle, DEFAULT_GRID_SIZE, snapPosition, snapValue } from './grid';
import type { EditorNode } from './types';

const makeNode = (id: string, x: number, y: number): EditorNode => ({
  id,
  typeId: 'demo',
  nodeVersion: '1.0.0',
  title: id,
  position: { x, y },
  width: 120,
  height: 80,
  inputs: [],
  outputs: [],
  searchTokens: []
});

describe('grid utilities', () => {
  it('snaps scalar and vector positions and rejects non-finite values', () => {
    expect(snapValue(11, 4)).toBe(12);
    expect(snapValue(-1, 4)).toBe(0);
    expect(snapPosition({ x: 5, y: 9 }, 4)).toEqual({ x: 4, y: 8 });
    expect(() => snapValue(Number.POSITIVE_INFINITY)).toThrowError('Value must be finite');
  });

  it('aligns nodes according to intent', () => {
    const nodes = [makeNode('a', 10, 10), makeNode('b', 40, 40)];
    const leftAligned = alignNodes(nodes, 'left');
    expect(leftAligned.every(node => node.position.x === leftAligned[0].position.x)).toBe(true);

    const centered = alignNodes(nodes, 'center');
    const centerX = centered[0].position.x + centered[0].width / 2;
    const centerX2 = centered[1].position.x + centered[1].width / 2;
    expect(centerX).toBe(centerX2);

    const rightAligned = alignNodes(nodes, 'right');
    expect(rightAligned.every(node => node.position.x + node.width === rightAligned[0].position.x + rightAligned[0].width)).toBe(true);

    const topAligned = alignNodes(nodes, 'top');
    expect(topAligned.every(node => node.position.y === topAligned[0].position.y)).toBe(true);

    const bottomAligned = alignNodes(nodes, 'bottom');
    expect(bottomAligned.every(node => node.position.y + node.height === bottomAligned[0].position.y + bottomAligned[0].height)).toBe(true);

    expect(alignNodes([], 'left')).toEqual([]);
    expect(alignNodes(nodes, 'diagonal' as any)).toEqual(nodes);
  });

  it('builds grid background style', () => {
    const style = buildGridStyle();
    expect(style.backgroundSize).toBe(`${DEFAULT_GRID_SIZE}px ${DEFAULT_GRID_SIZE}px`);
    expect(style.backgroundImage).toContain('linear-gradient');
  });
});
