import { alignNodes, snapPosition } from './grid';
import { withUpdatedProject } from './state';
import type { EditorNode, EditorState, Vec2 } from './types';

export type Modifier = 'ctrl' | 'cmd';
export type KeyChord = `${Modifier}.${'c' | 'v' | 'd'}` | '1' | 'shift+1';

export type ShortcutHandler = (state: EditorState) => EditorState;

export interface Shortcut {
  chord: KeyChord;
  description: string;
  handler: ShortcutHandler;
}

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const defaultIdGenerator = (node: EditorNode, index: number): string => `${node.id}-copy-${index}-${Date.now()}`;

const cloneNode = (node: EditorNode, offset: Vec2, index: number, idGenerator = defaultIdGenerator): EditorNode => ({
  ...deepClone(node),
  id: idGenerator(node, index),
  position: snapPosition({
    x: node.position.x + offset.x,
    y: node.position.y + offset.y
  }),
  title: `${node.title} Copy`
});

const getSelectedNodes = (state: EditorState): EditorNode[] => {
  const selected = new Set(state.selection.nodeIds);
  return state.project.nodes.filter(node => selected.has(node.id));
};

export const copySelectedNodes = (state: EditorState): EditorState => {
  const copied = getSelectedNodes(state).map(node => deepClone(node));
  if (copied.length === 0) {
    return state;
  }
  return {
    ...state,
    clipboard: copied
  };
};

export interface PasteOptions {
  offset?: Vec2;
  idGenerator?: (node: EditorNode, index: number) => string;
}

export const pasteNodes = (state: EditorState, options: PasteOptions = {}): EditorState => {
  if (state.clipboard.length === 0) {
    return state;
  }
  const offset = options.offset ?? { x: 40, y: 40 };
  const clones = state.clipboard.map((node, index) => cloneNode(node, offset, index, options.idGenerator));
  const project = {
    ...state.project,
    nodes: [...state.project.nodes, ...clones]
  };
  return withUpdatedProject({
    ...state,
    project,
    selection: { nodeIds: clones.map(node => node.id), primary: clones[0]?.id }
  }, project);
};

export const duplicateNodes = (state: EditorState, offset: Vec2 = { x: 24, y: 24 }): EditorState => pasteNodes(copySelectedNodes(state), { offset });

export const setZoom = (state: EditorState, zoom: number): EditorState => {
  const safeZoom = Number.isFinite(zoom) ? Math.min(2, Math.max(0.25, zoom)) : state.zoom;
  return {
    ...state,
    zoom: safeZoom
  };
};

export const fitSelection = (
  state: EditorState,
  viewport: { width: number; height: number } = { width: 960, height: 540 }
): EditorState => {
  const nodes = getSelectedNodes(state);
  if (nodes.length === 0) {
    return setZoom(state, 1);
  }
  const padding = 32;
  const minX = Math.min(...nodes.map(node => node.position.x));
  const maxX = Math.max(...nodes.map(node => node.position.x + node.width));
  const minY = Math.min(...nodes.map(node => node.position.y));
  const maxY = Math.max(...nodes.map(node => node.position.y + node.height));
  const width = maxX - minX + padding;
  const height = maxY - minY + padding;
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const scale = Math.min(viewport.width / safeWidth, viewport.height / safeHeight);
  return setZoom(state, Math.min(1, scale));
};

export type AlignIntent = 'left' | 'right' | 'top' | 'bottom' | 'center';

export const alignSelection = (state: EditorState, intent: AlignIntent): EditorState => {
  const nodes = getSelectedNodes(state);
  if (nodes.length === 0) {
    return state;
  }
  const aligned = alignNodes(nodes, intent);
  const nodeMap = new Map(aligned.map(node => [node.id, node]));
  const project = {
    ...state.project,
    nodes: state.project.nodes.map(node => nodeMap.get(node.id) ?? node)
  };
  return withUpdatedProject({ ...state, project }, project);
};

export const toKeyChord = (event: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): KeyChord | null => {
  const key = event.key.toLowerCase();
  if (event.shiftKey && key === '1') {
    return 'shift+1';
  }
  if (!event.shiftKey && key === '1') {
    return '1';
  }
  if ((event.metaKey || event.ctrlKey) && ['c', 'v', 'd'].includes(key)) {
    return `${event.metaKey ? 'cmd' : 'ctrl'}.${key}` as KeyChord;
  }
  return null;
};

export class ShortcutRegistry {
  private readonly shortcuts = new Map<KeyChord, ShortcutHandler>();

  register(chord: KeyChord, handler: ShortcutHandler): void {
    this.shortcuts.set(chord, handler);
  }

  handle(chord: KeyChord | null, state: EditorState): EditorState {
    if (!chord) {
      return state;
    }
    const handler = this.shortcuts.get(chord);
    return handler ? handler(state) : state;
  }
}

export const registerDefaultShortcuts = (registry: ShortcutRegistry): void => {
  const register = (key: KeyChord, handler: ShortcutHandler) => registry.register(key, handler);
  (['ctrl', 'cmd'] as Modifier[]).forEach(mod => {
    register(`${mod}.c`, copySelectedNodes);
    register(`${mod}.v`, state => pasteNodes(state));
    register(`${mod}.d`, state => duplicateNodes(state));
  });
  register('1', state => setZoom(state, 1));
  register('shift+1', state => fitSelection(state));
};
