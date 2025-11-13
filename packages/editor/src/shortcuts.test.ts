import { describe, expect, it } from 'vitest';

import { alignSelection, copySelectedNodes, duplicateNodes, fitSelection, pasteNodes, registerDefaultShortcuts, setZoom, ShortcutRegistry, toKeyChord } from './shortcuts';
import { createDefaultProject, createEditorState } from './state';
import type { EditorNode, EditorState } from './types';

const makeNode = (id: string, overrides: Partial<EditorNode> = {}): EditorNode => ({
  id,
  typeId: 'demo',
  nodeVersion: '1.0.0',
  title: id,
  position: { x: 0, y: 0 },
  width: 120,
  height: 80,
  inputs: [],
  outputs: [],
  searchTokens: [],
  ...overrides
});

const makeState = (nodes: EditorNode[], selection: string[]): EditorState => {
  const project = createDefaultProject('Test');
  project.nodes = nodes;
  return {
    ...createEditorState(project),
    selection: { nodeIds: selection, primary: selection[0] },
    clipboard: []
  };
};

describe('shortcuts helpers', () => {
  it('copies and pastes nodes with deterministic IDs', () => {
    const node = makeNode('a', { position: { x: 10, y: 10 } });
    const state = makeState([node], ['a']);
    const copied = copySelectedNodes(state);
    expect(copied.clipboard).toHaveLength(1);
    const pasted = pasteNodes(copied, {
      idGenerator: (_node, index) => `clone-${index}`,
      offset: { x: 32, y: 32 }
    });
    expect(pasted.project.nodes).toHaveLength(2);
    expect(pasted.project.nodes[1].id).toBe('clone-0');
    expect(pasted.selection.nodeIds).toEqual(['clone-0']);
  });

  it('falls back when structuredClone is unavailable', () => {
    const node = makeNode('a');
    const state = makeState([node], ['a']);
    const original = globalThis.structuredClone;
    // @ts-expect-error
    globalThis.structuredClone = undefined;
    try {
      const copied = copySelectedNodes(state);
      expect(copied.clipboard[0].id).toBe('a');
    } finally {
      globalThis.structuredClone = original;
    }
  });

  it('no-ops when clipboard or selection is empty', () => {
    const node = makeNode('a');
    const state = makeState([node], []);
    expect(copySelectedNodes(state)).toBe(state);
    expect(pasteNodes(state)).toBe(state);
  });

  it('duplicates and aligns selections', () => {
    const nodes = [
      makeNode('a', { position: { x: 10, y: 0 } }),
      makeNode('b', { position: { x: 100, y: 50 } }),
      makeNode('c', { position: { x: 300, y: 150 } })
    ];
    const state = makeState(nodes, ['a', 'b']);
    const duplicated = duplicateNodes(state, { x: 4, y: 4 });
    expect(duplicated.project.nodes.length).toBe(5);

    const aligned = alignSelection(state, 'left');
    const xPositions = aligned.project.nodes.filter(node => ['a', 'b'].includes(node.id)).map(node => node.position.x);
    expect(new Set(xPositions).size).toBe(1);
    const untouched = aligned.project.nodes.find(node => node.id === 'c');
    expect(untouched?.position.x).toBe(300);
  });

  it('handles zoom shortcuts and fit selection', () => {
    const nodes = [makeNode('a', { position: { x: 0, y: 0 }, width: 400, height: 300 })];
    const state = makeState(nodes, ['a']);
    expect(setZoom(state, 5).zoom).toBe(2);
    expect(setZoom(state, 0.1).zoom).toBe(0.25);
    expect(setZoom(state, Number.NaN).zoom).toBe(state.zoom);
    const fitted = fitSelection(state, { width: 800, height: 600 });
    expect(fitted.zoom).toBeLessThanOrEqual(1);

    const emptyFit = fitSelection(makeState(nodes, []));
    expect(emptyFit.zoom).toBe(1);
  });

  it('converts keyboard events to chords', () => {
    expect(toKeyChord({ key: '1' })).toBe('1');
    expect(toKeyChord({ key: '1', shiftKey: true })).toBe('shift+1');
    expect(toKeyChord({ key: 'v', ctrlKey: true })).toBe('ctrl.v');
    expect(toKeyChord({ key: 'C', metaKey: true })).toBe('cmd.c');
    expect(toKeyChord({ key: 'x', metaKey: true })).toBeNull();
  });

  it('registers default shortcuts into the registry', () => {
    const node = makeNode('a');
    const state = makeState([node], ['a']);
    const registry = new ShortcutRegistry();
    registerDefaultShortcuts(registry);
    const copied = registry.handle('ctrl.c', state);
    expect(copied.clipboard).toHaveLength(1);
    const pasted = registry.handle('ctrl.v', copied);
    expect(pasted.project.nodes.length).toBeGreaterThan(copied.project.nodes.length);
    const zoomed = registry.handle('1', copied);
    expect(zoomed.zoom).toBe(1);
    const untouched = registry.handle(null, zoomed);
    expect(untouched).toBe(zoomed);

    const emptyState = makeState([node], []);
    const alignNoSelection = alignSelection(emptyState, 'left');
    expect(alignNoSelection).toBe(emptyState);

    const sparseRegistry = new ShortcutRegistry();
    sparseRegistry.register('ctrl.c', copySelectedNodes);
    expect(sparseRegistry.handle('cmd.c', state)).toBe(state);
  });
});
