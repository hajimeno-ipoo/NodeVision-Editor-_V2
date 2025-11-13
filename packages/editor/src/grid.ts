import type { EditorNode, Vec2 } from './types';

export const DEFAULT_GRID_SIZE = 8;
export const DEFAULT_SNAP_SIZE = 4;

export const snapValue = (value: number, step: number = DEFAULT_SNAP_SIZE): number => {
  if (!Number.isFinite(value)) {
    throw new Error('Value must be finite');
  }
  const snapped = Math.round(value / step) * step;
  return Object.is(snapped, -0) ? 0 : snapped;
};

export const snapPosition = (position: Vec2, step: number = DEFAULT_SNAP_SIZE): Vec2 => ({
  x: snapValue(position.x, step),
  y: snapValue(position.y, step)
});

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'center';

export const alignNodes = (nodes: EditorNode[], mode: AlignMode): EditorNode[] => {
  if (nodes.length === 0) {
    return nodes;
  }

  switch (mode) {
    case 'left': {
      const minX = Math.min(...nodes.map(node => node.position.x));
      return nodes.map(node => ({
        ...node,
        position: { ...node.position, x: snapValue(minX) }
      }));
    }
    case 'right': {
      const maxX = Math.max(...nodes.map(node => node.position.x + node.width));
      return nodes.map(node => ({
        ...node,
        position: { ...node.position, x: snapValue(maxX - node.width) }
      }));
    }
    case 'top': {
      const minY = Math.min(...nodes.map(node => node.position.y));
      return nodes.map(node => ({
        ...node,
        position: { ...node.position, y: snapValue(minY) }
      }));
    }
    case 'bottom': {
      const maxY = Math.max(...nodes.map(node => node.position.y + node.height));
      return nodes.map(node => ({
        ...node,
        position: { ...node.position, y: snapValue(maxY - node.height) }
      }));
    }
    case 'center': {
      const centerX =
        nodes.reduce((sum, node) => sum + node.position.x + node.width / 2, 0) /
        nodes.length;
      const centerY =
        nodes.reduce((sum, node) => sum + node.position.y + node.height / 2, 0) /
        nodes.length;
      return nodes.map(node => ({
        ...node,
        position: {
          x: snapValue(centerX - node.width / 2),
          y: snapValue(centerY - node.height / 2)
        }
      }));
    }
    default:
      return nodes;
  }
};

export interface GridStyle {
  backgroundImage: string;
  backgroundSize: string;
}

export const buildGridStyle = (gridSize: number = DEFAULT_GRID_SIZE): GridStyle => {
  const color = 'rgba(255,255,255,0.08)';
  return {
    backgroundImage: `linear-gradient(90deg, ${color} 1px, transparent 1px), linear-gradient(${color} 1px, transparent 1px)`,
    backgroundSize: `${gridSize}px ${gridSize}px`
  };
};
