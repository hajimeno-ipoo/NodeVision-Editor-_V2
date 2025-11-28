/* c8 ignore start */
import path from 'node:path';
import { buildLegacyColorCorrectionPipeline, type ColorGradingPipeline } from '@nodevision/color-grading';

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
  | 'colorCorrection'
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
  region?: { x?: number; y?: number; width?: number; height?: number };
  rotationDeg?: number;
  zoom?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  aspectMode?: string;
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
  width: number | string;
  height: number | string;
  x?: number | string;
  y?: number | string;
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

export interface ColorCorrectionNode extends BaseMediaNode {
  typeId: 'colorCorrection';
  brightness?: number;
  contrast?: number;
  saturation?: number;
  gamma?: number;
  exposure?: number;
  shadows?: number;
  highlights?: number;
  temperature?: number;
  tint?: number;
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
  | ColorCorrectionNode
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
/* c8 ignore end */

interface BaseStage {
  stage: 'input' | 'filter' | 'output';
  typeId: MediaNodeType | 'setsar' | 'eq' | 'curves' | 'colorchannelmixer' | 'lut3d_generator';
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

export interface LUT3DGeneratorStage extends BaseStage {
  stage: 'filter';
  typeId: 'lut3d_generator';
  params: {
    pipeline: ColorGradingPipeline;
    nodeId: string;
  };
}

export type BuilderStage = InputStage | FilterStage | OutputStage | LUT3DGeneratorStage;

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

const calculateResize = (nodes: MediaNode[]): ResizeNode | null => {
  return pickLast(nodes, node => node.typeId === 'resize') as ResizeNode | null;
};

const calculateCrop = (nodes: MediaNode[]): CropNode | null => {
  return pickLast(nodes, node => node.typeId === 'crop') as CropNode | null;
};

const calculateTrimCrop = (nodes: MediaNode[]): CropNode | null => {
  const trimNodes = nodes.filter(node => node.typeId === 'trim') as TrimNode[];
  if (!trimNodes.length) return null;
  const last = trimNodes[trimNodes.length - 1];
  const region = last.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const toExpr = (value: number | undefined, dimension: 'w' | 'h'): number | string => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return dimension === 'w' ? 'iw' : 'ih';
    }
    if (value > 1) return value;
    return `${dimension === 'w' ? 'iw' : 'ih'}*${value}`;
  };
  return {
    id: last.id,
    typeId: 'crop',
    nodeVersion: last.nodeVersion,
    width: toExpr(region.width, 'w'),
    height: toExpr(region.height, 'h'),
    x: toExpr(region.x, 'w'),
    y: toExpr(region.y, 'h')
  };
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

const collectColorCorrections = (nodes: MediaNode[]): ColorCorrectionNode[] => {
  return nodes.filter(node => node.typeId === 'colorCorrection') as ColorCorrectionNode[];
};

const computeDuration = (load: LoadMediaNode, speedRatio: number): number | null => {
  if (typeof load.durationMs !== 'number') {
    return null;
  }
  const duration = load.durationMs;
  return speedRatio !== 1 ? duration / speedRatio : duration;
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

  const trimCrop = calculateTrimCrop(chain.nodes);
  const resize = calculateResize(chain.nodes);
  const crop = calculateCrop(chain.nodes) ?? trimCrop;
  const overlays = collectOverlays(chain.nodes);
  const texts = collectTexts(chain.nodes);
  const colorCorrections = collectColorCorrections(chain.nodes);
  const speedRatio = calculateSpeed(chain.nodes);
  const fpsNode = pickChangeFps(chain.nodes);

  const inputArgs: string[] = [];
  const outputArgs: string[] = [];

  const stages: BuilderStage[] = [
    {
      stage: 'input',
      typeId: loadNode.typeId,
      nodeVersion: loadNode.nodeVersion,
      args: inputArgs,
      path: path.resolve(loadNode.path)
    }
  ];

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

  // Color Correction: Use 3D LUT
  colorCorrections.forEach(cc => {
    // Check if there are any adjustments
    const hasAdjustments =
      (cc.brightness ?? 0) !== 0 ||
      (cc.contrast ?? 1) !== 1 ||
      (cc.saturation ?? 1) !== 1 ||
      (cc.gamma ?? 1) !== 1 ||
      (cc.exposure ?? 0) !== 0 ||
      (cc.shadows ?? 0) !== 0 ||
      (cc.highlights ?? 0) !== 0 ||
      (cc.temperature ?? 0) !== 0 ||
      (cc.tint ?? 0) !== 0;

    if (hasAdjustments) {
      // Build pipeline configuration from legacy settings
      const pipeline = buildLegacyColorCorrectionPipeline({
        exposure: cc.exposure,
        brightness: cc.brightness,
        contrast: cc.contrast,
        saturation: cc.saturation,
        gamma: cc.gamma,
        shadows: cc.shadows,
        highlights: cc.highlights,
        temperature: cc.temperature,
        tint: cc.tint
      });

      stages.push({
        stage: 'filter',
        typeId: 'lut3d_generator',
        nodeVersion: cc.nodeVersion,
        params: {
          pipeline,
          nodeId: cc.id
        }
      });
    }
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

  const estimatedDurationMs = computeDuration(loadNode, speedRatio);

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
      strictCut: false,
      vsync: fpsNode?.vsync ?? 'cfr',
      sarNormalized: true
    }
  };
}
