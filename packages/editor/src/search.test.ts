import { describe, expect, it } from 'vitest';

import { DEFAULT_NODE_TEMPLATES } from './templates';
import { NodeSearchIndex, SearchSession } from './search';

const mockId = (_template: any, index: number) => `mock-${index}`;

describe('search', () => {
  it('uses the default id factory when none is provided', () => {
    const index = new NodeSearchIndex(DEFAULT_NODE_TEMPLATES);
    const node = index.instantiate(DEFAULT_NODE_TEMPLATES[0], { x: 0, y: 0 });
    expect(node.id).toContain(DEFAULT_NODE_TEMPLATES[0].typeId);
  });

  it('filters templates by query and instantiates nodes', () => {
    const index = new NodeSearchIndex(DEFAULT_NODE_TEMPLATES, mockId);
    const results = index.search('resize');
    expect(results).toHaveLength(1);
    const node = index.instantiate(results[0], { x: 100, y: 100 }, 2);
    expect(node.id).toBe('mock-2');
    expect(node.position).toEqual({ x: 100, y: 100 });
  });

  it('cycles through results in a keyboard-friendly session', () => {
    const index = new NodeSearchIndex(DEFAULT_NODE_TEMPLATES, mockId);
    const session = new SearchSession(index);
    expect(session.confirm({ x: 0, y: 0 })).toBeNull();
    const all = session.update('');
    expect(all.length).toBeGreaterThan(1);
    const first = session.move(1);
    expect(first.template).toBe(all[1]);
    const node = session.confirm({ x: 0, y: 0 });
    expect(node?.id).toBe('mock-1');

    session.update('does-not-exist');
    const fallback = session.move(1);
    expect(fallback.template).toBeNull();
  });
});
