import { describe, expect, it } from 'vitest';

import { DEFAULT_NODE_TEMPLATES } from './templates';
import { NodeSearchIndex, SearchSession } from './search';
import type { NodeTemplate } from './types';

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

  it('falls back to default dimensions when templates omit width/height', () => {
    const template = {
      typeId: 'simple',
      nodeVersion: '1.0.0',
      title: 'Simple',
      category: 'Test',
      description: 'No size provided',
      keywords: ['simple'],
      outputs: []
    } satisfies NodeTemplate;
    const index = new NodeSearchIndex([template], mockId);
    const node = index.instantiate(template, { x: 0, y: 0 });
    expect(node.width).toBe(220);
    expect(node.height).toBe(120);
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

  it('matches templates when only keywords contain the query', () => {
    const customIndex = new NodeSearchIndex(
      [
        {
          typeId: 'keywordOnly',
          nodeVersion: '1.0.0',
          title: 'Luma Adjust',
          category: 'Color',
          description: 'Adjust exposure',
          keywords: ['exposure', 'mask-only'],
          outputs: []
        }
      ],
      mockId
    );
    const hits = customIndex.search('mask-only');
    expect(hits).toHaveLength(1);
    expect(hits[0].typeId).toBe('keywordOnly');
  });

  it('clones ports and default settings when instantiating nodes', () => {
    const template: NodeTemplate = {
      typeId: 'trim',
      nodeVersion: '1.0.0',
      title: 'Trim',
      category: 'Edit',
      description: 'Cut media between points',
      keywords: ['trim'],
      inputs: [{ id: 'source', label: 'Source', direction: 'input', dataType: 'video' }],
      outputs: [{ id: 'result', label: 'Result', direction: 'output', dataType: 'video' }],
      defaultSettings: {
        kind: 'trim',
        startMs: null,
        endMs: null,
        strictCut: false,
        region: null
      }
    };
    const node = new NodeSearchIndex([template], mockId).instantiate(template, { x: 0, y: 0 });
    expect(node.inputs).toHaveLength(1);
    expect(node.outputs).toHaveLength(1);
    expect(node.settings).toEqual(template.defaultSettings);
    expect(node.settings).not.toBe(template.defaultSettings);
  });
});
