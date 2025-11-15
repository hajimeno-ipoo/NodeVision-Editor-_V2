import path from 'node:path';

export type MediaNodeType =
  | 'loadMedia'
  | 'loadImage'
  | 'loadVideo'
  | 'trim'
  | 'resize'
  | 'overlay'
  | 'text'
  | 'crop'
  | 'speed'
  | 'changeFps'
  | 'export';

interface BaseMediaNode {
  id: string;
  typeId: MediaNodeType;
  nodeVersion: string;
}

export interface LoadMediaNode extends BaseMediaNode {
  typeId: 'loadMedia' | 'loadImage' | 'loadVideo';
  path: string;
  durationMs?: number | null;
  fps?: number | null;
}

export interface TrimNode extends BaseMediaNode {
  typeId: 'trim';
  startMs?: number | null;
  endMs?: number | null;
  strictCut?: boolean;
}

export interface ResizeNode extends BaseMediaNode {
  typeId: 'resize';
  width: number;
  height: number;
  mode?: 'contain' | 'cover' | 'stretch';
}

export interface OverlayNode extends BaseMediaNode {
  typeId: 'overlay';
  sourcePath: string;
  x?: number;
  y?: number;
  opacity?: number;
}

export interface TextNode extends BaseMediaNode {
  typeId: 'text';
  text: string;
  fontSize?: number;
  color?: string;
  x?: string;
  y?: string;
}

export interface CropNode extends BaseMediaNode {
  typeId: 'crop';
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface SpeedNode extends BaseMediaNode {
  typeId: 'speed';
  ratio: number;
}

export interface ChangeFpsNode extends BaseMediaNode {
  typeId: 'changeFps';
  fps: number;
  vsync?: 'cfr' | 'vfr';
}

export interface ExportNode extends BaseMediaNode {
  typeId: 'export';
  container?: 'mp4' | 'mov' | 'mkv';
  videoCodec?: string;
  audioCodec?: string;
  pixelFormat?: string;
}

export type MediaNode =
  | LoadMediaNode
  | TrimNode
  | ResizeNode
  | OverlayNode
  | TextNode
  | CropNode
  | SpeedNode
  | ChangeFpsNode
  | ExportNode;

export interface MediaChain {
  nodes: MediaNode[];
}

export interface BuildFFmpegPlanOptions {
  preview?: {
    width?: number;
    height?: number;
    maxFps?: number;
  };
}

interface BaseStage {
  stage: 'input' | 'filter' | 'output';
  typeId: MediaNodeType | 'setsar';
  nodeVersion: string;
}

export interface InputStage extends BaseStage {
  stage: 'input';
  typeId: 'loadMedia' | 'loadImage' | 'loadVideo';
  args: string[];
  path: string;
}

export interface FilterStage extends BaseStage {
  stage: 'filter';
  params: Record<string, unknown>;
}

export interface OutputStage extends BaseStage {
  stage: 'output';
  typeId: 'export';
  args: string[];
  pixelFormat: string;
  interpolation: 'bicubic';
}

export type BuilderStage = InputStage | FilterStage | OutputStage;

export interface PreviewFilter {
  type: 'colorspace' | 'scale' | 'setsar';
  params: Record<string, unknown>;
}

export interface FFmpegPlan {
  stages: BuilderStage[];
  preview: {
    width: number;
    height: number;
    maxFps: number;
    filters: PreviewFilter[];
  };
  metadata: {
    estimatedDurationMs: number | null;
    strictCut: boolean;
    vsync: 'cfr' | 'vfr';
    sarNormalized: boolean;
  };
}

const DEFAULT_PREVIEW_WIDTH = 1280;
const DEFAULT_PREVIEW_HEIGHT = 720;
const DEFAULT_PREVIEW_FPS = 30;

const formatSeconds = (milliseconds: number): string => (milliseconds / 1000).toFixed(3);

const toSafeTimestamp = (value?: number | null): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return null;
  }
  return value;
};

const pickLast = <T>(items: T[], predicate: (item: T) => boolean): T | null => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return items[index];
    }
  }
  return null;
};

const clampOpacity = (value?: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
};

const escapePathForFilter = (input: string): string => {
  return input.replace(/[\\:]/g, match => `\\${match}`);
};

const normalizeDrawText = (text: string): string => text.replace(/[:\\]/g, match => `\\${match}`);

const calculateTrim = (nodes: MediaNode[]): { startMs: number | null; endMs: number | null; strictCut: boolean } => {
  const trimNodes = nodes.filter(node => node.typeId === 'trim') as TrimNode[];
  if (trimNodes.length === 0) {
    return { startMs: null, endMs: null, strictCut: false };
  }

  const last = trimNodes[trimNodes.length - 1];
  return {
    startMs: toSafeTimestamp(last.startMs ?? null),
    endMs: toSafeTimestamp(last.endMs ?? null),
    strictCut: trimNodes.some(node => Boolean(node.strictCut))
  };
};

const calculateResize = (nodes: MediaNode[]): ResizeNode | null => {
  return pickLast(nodes, node => node.typeId === 'resize') as ResizeNode | null;
};

const calculateCrop = (nodes: MediaNode[]): CropNode | null => {
  return pickLast(nodes, node => node.typeId === 'crop') as CropNode | null;
};

const collectOverlays = (nodes: MediaNode[]): OverlayNode[] => {
  return nodes.filter(node => node.typeId === 'overlay') as OverlayNode[];
};

const collectTexts = (nodes: MediaNode[]): TextNode[] => {
  return nodes.filter(node => node.typeId === 'text') as TextNode[];
};

const calculateSpeed = (nodes: MediaNode[]): number => {
  return (nodes.filter(node => node.typeId === 'speed') as SpeedNode[]).reduce((acc, node) => {
    if (typeof node.ratio === 'number' && node.ratio > 0) {
      return acc * node.ratio;
    }
    return acc;
  }, 1);
};

const pickChangeFps = (nodes: MediaNode[]): ChangeFpsNode | null => {
  return pickLast(nodes, node => node.typeId === 'changeFps') as ChangeFpsNode | null;
};

const computeDuration = (
  load: LoadMediaNode,
  trim: { startMs: number | null; endMs: number | null },
  speedRatio: number
): number | null => {
  if (typeof load.durationMs !== 'number') {
    return null;
  }

  let duration = load.durationMs;
  if (typeof trim.startMs === 'number' && trim.startMs > 0) {
    duration = Math.max(0, duration - trim.startMs);
  }
  if (typeof trim.endMs === 'number' && trim.endMs > 0) {
    duration = Math.min(duration, trim.endMs - (trim.startMs ?? 0));
  }

  return speedRatio !== 1 ? duration / speedRatio : duration;
};

const buildInputArgs = (
  trim: { startMs: number | null; endMs: number | null; strictCut: boolean }
): string[] => {
  if (trim.strictCut || trim.startMs === null) {
    return [];
  }

  const args = ['-ss', formatSeconds(trim.startMs)];
  if (trim.endMs !== null) {
    const duration = Math.max(0, trim.endMs - trim.startMs);
    args.push('-t', formatSeconds(duration));
  }
  return args;
};

const buildOutputArgs = (
  trim: { startMs: number | null; endMs: number | null; strictCut: boolean },
  speedRatio: number
): string[] => {
  const args: string[] = [];
  if (!trim.strictCut && trim.startMs !== null && trim.endMs !== null) {
    const duration = Math.max(0, trim.endMs - trim.startMs);
    args.push('-t', formatSeconds(duration / speedRatio));
  }
  return args;
};

export function buildFFmpegPlan(chain: MediaChain, options: BuildFFmpegPlanOptions = {}): FFmpegPlan {
  if (!chain || !Array.isArray(chain.nodes)) {
    throw new Error('A media chain with nodes is required');
  }

  const loadNode = chain.nodes.find(node =>
    node.typeId === 'loadVideo' || node.typeId === 'loadImage' || node.typeId === 'loadMedia'
  ) as LoadMediaNode | undefined;
  if (!loadNode) {
    throw new Error('A loadImage or loadVideo node is required to build an FFmpeg plan');
  }

  const exportNode = pickLast(chain.nodes, node => node.typeId === 'export') as ExportNode | null;
  if (!exportNode) {
    throw new Error('An export node is required to finish the FFmpeg plan');
  }

  const trim = calculateTrim(chain.nodes);
  const resize = calculateResize(chain.nodes);
  const crop = calculateCrop(chain.nodes);
  const overlays = collectOverlays(chain.nodes);
  const texts = collectTexts(chain.nodes);
  const speedRatio = calculateSpeed(chain.nodes);
  const fpsNode = pickChangeFps(chain.nodes);

  const inputArgs = buildInputArgs(trim);
  const outputArgs = buildOutputArgs(trim, speedRatio);

  const stages: BuilderStage[] = [
    {
      stage: 'input',
      typeId: loadNode.typeId,
      nodeVersion: loadNode.nodeVersion,
      args: inputArgs,
      path: path.resolve(loadNode.path)
    }
  ];

  if (trim.strictCut && (trim.startMs !== null || trim.endMs !== null)) {
    stages.push({
      stage: 'filter',
      typeId: 'trim',
      nodeVersion: trim.endMs !== null ? 'strict-range' : 'strict-start',
      params: {
        startMs: trim.startMs,
        endMs: trim.endMs,
        setpts: true
      }
    });
  }

  if (crop) {
    stages.push({
      stage: 'filter',
      typeId: 'crop',
      nodeVersion: crop.nodeVersion,
      params: {
        width: crop.width,
        height: crop.height,
        x: crop.x ?? 0,
        y: crop.y ?? 0
      }
    });
  }

  if (resize) {
    stages.push({
      stage: 'filter',
      typeId: 'resize',
      nodeVersion: resize.nodeVersion,
      params: {
        width: resize.width,
        height: resize.height,
        mode: resize.mode ?? 'contain',
        interpolation: 'bicubic'
      }
    });
  }

  overlays.forEach((overlay, index) => {
    stages.push({
      stage: 'filter',
      typeId: 'overlay',
      nodeVersion: overlay.nodeVersion,
      params: {
        sourcePath: path.resolve(overlay.sourcePath),
        escapedSource: escapePathForFilter(overlay.sourcePath),
        label: `ovl${index}`,
        x: overlay.x ?? 0,
        y: overlay.y ?? 0,
        opacity: clampOpacity(overlay.opacity)
      }
    });
  });

  texts.forEach(text => {
    stages.push({
      stage: 'filter',
      typeId: 'text',
      nodeVersion: text.nodeVersion,
      params: {
        text: text.text,
        escapedText: normalizeDrawText(text.text),
        fontSize: text.fontSize ?? 48,
        color: text.color ?? '#ffffff',
        x: text.x ?? '(w-text_w)/2',
        y: text.y ?? '(h-text_h)/2'
      }
    });
  });

  if (speedRatio !== 1) {
    stages.push({
      stage: 'filter',
      typeId: 'speed',
      nodeVersion: '1.0.0',
      params: {
        ratio: speedRatio,
        setpts: `PTS/${speedRatio}`
      }
    });
  }

  if (fpsNode) {
    stages.push({
      stage: 'filter',
      typeId: 'changeFps',
      nodeVersion: fpsNode.nodeVersion,
      params: {
        fps: fpsNode.fps,
        vsync: fpsNode.vsync ?? 'cfr'
      }
    });
  }

  stages.push({
    stage: 'filter',
    typeId: 'setsar',
    nodeVersion: '1.0.0',
    params: {
      value: 1
    }
  });

  stages.push({
    stage: 'output',
    typeId: 'export',
    nodeVersion: exportNode.nodeVersion,
    args: outputArgs,
    pixelFormat: exportNode.pixelFormat ?? 'yuv420p',
    interpolation: 'bicubic'
  });

  const previewWidth = options.preview?.width ?? resize?.width ?? DEFAULT_PREVIEW_WIDTH;
  const previewHeight = options.preview?.height ?? resize?.height ?? DEFAULT_PREVIEW_HEIGHT;
  const previewMaxFps = options.preview?.maxFps ?? fpsNode?.fps ?? loadNode.fps ?? DEFAULT_PREVIEW_FPS;

  const estimatedDurationMs = computeDuration(loadNode, trim, speedRatio);

  return {
    stages,
    preview: {
      width: previewWidth,
      height: previewHeight,
      maxFps: previewMaxFps,
      filters: [
        { type: 'colorspace', params: { profile: 'srgb', format: 'rgba' } },
        {
          type: 'scale',
          params: { width: previewWidth, height: previewHeight, interpolation: 'bilinear' }
        },
        { type: 'setsar', params: { value: 1 } }
      ]
    },
    metadata: {
      estimatedDurationMs,
      strictCut: trim.strictCut,
      vsync: fpsNode?.vsync ?? 'cfr',
      sarNormalized: true
    }
  };
}
