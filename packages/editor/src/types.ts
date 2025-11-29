export type Vec2 = { x: number; y: number };

export type PortDirection = 'input' | 'output';
export type DataType = 'video' | 'image' | 'audio' | 'number' | 'string' | 'boolean';

export interface PortDefinition {
  id: string;
  label: string;
  direction: PortDirection;
  dataType: DataType;
  required?: boolean;
}

export interface TrimRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TrimAspectMode =
  | 'free'
  | 'original'
  | 'square'
  | '4:3'
  | '16:9'
  | '16:10'
  | '9:16'
  | '2:1'
  | '3:1'
  | '3:2'
  | '5:4'
  | '1.618:1';

export interface TrimNodeSettings {
  kind: 'trim';
  region: TrimRegion | null;
  /**
   * Indicates which coordinate space the region numbers are normalized to.
   * 'stage' means the modal canvas rectangle, 'image' means the actual source pixels.
   */
  regionSpace?: 'stage' | 'image';
  rotationDeg: number;
  zoom: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  aspectMode: TrimAspectMode;
}

export interface ColorCorrectionNodeSettings {
  kind: 'colorCorrection';
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
  exposure: number;
  shadows: number;
  highlights: number;
  temperature: number;
  tint: number;
}

/**
 * Color wheel control for Lift/Gamma/Gain
 */
export interface ColorWheelControl {
  hue: number;        // 0-360 degrees
  saturation: number; // 0-1
  luminance: number;  // -1 to 1
}

/**
 * Primary Grading node settings
 * Professional color grading with wheels (Lift/Gamma/Gain)
 */
export interface PrimaryGradingNodeSettings {
  kind: 'primaryGrading';
  // Basic corrections
  exposure: number;      // -5 to 5
  contrast: number;      // 0 to 2
  saturation: number;    // 0 to 2
  temperature: number;   // -100 to 100
  tint: number;          // -100 to 100

  // Color wheels
  lift: ColorWheelControl;
  gamma: ColorWheelControl;
  gain: ColorWheelControl;
}

/**
 * LUT Loader node settings
 * Load and apply external 3D LUTs (.cube files)
 */
export interface LUTLoaderNodeSettings {
  kind: 'lutLoader';
  /** Path to the .cube LUT file */
  lutFilePath?: string;
  /** LUT intensity (0-1, default 1.0 = 100%) */
  intensity: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurvesNodeSettings {
  kind: 'curves';
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
  hueVsHue?: CurvePoint[];
  hueVsSat?: CurvePoint[];
  hueVsLuma?: CurvePoint[];
}

export interface SecondaryGradingNodeSettings {
  kind: 'secondaryGrading';
  // Keyer parameters
  hueCenter: number;
  hueWidth: number;
  hueSoftness: number;
  satCenter: number;
  satWidth: number;
  satSoftness: number;
  lumCenter: number;
  lumWidth: number;
  lumSoftness: number;
  invert: boolean;

  // Correction parameters
  saturation: number;
  hueShift: number;
  brightness: number;

  // View options
  showMask: boolean;
}

export type NodeSettings = TrimNodeSettings | ColorCorrectionNodeSettings | PrimaryGradingNodeSettings | LUTLoaderNodeSettings | CurvesNodeSettings | SecondaryGradingNodeSettings;


export interface EditorNode {
  id: string;
  typeId: string;
  nodeVersion: string;
  title: string;
  position: Vec2;
  width: number;
  height: number;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  searchTokens: string[];
  settings?: NodeSettings;
}

export interface NodeConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export interface ProjectMetadata {
  name: string;
  createdAt: string;
  updatedAt: string;
  readonly: boolean;
}

export interface EditorProject {
  schemaVersion: string;
  nodes: EditorNode[];
  connections: NodeConnection[];
  metadata: ProjectMetadata;
}

export interface EditorSelection {
  nodeIds: string[];
  primary?: string;
}

export interface EditorState {
  project: EditorProject;
  selection: EditorSelection;
  clipboard: EditorNode[];
  zoom: number;
  isRunning: boolean;
}

export interface NodeTemplate {
  typeId: string;
  nodeVersion: string;
  title: string;
  category: string;
  description: string;
  keywords: string[];
  width?: number;
  height?: number;
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
  defaultSettings?: NodeSettings;
}

export interface SerializedProject {
  schemaVersion: string;
  nodes: Array<{
    id: string;
    typeId: string;
    nodeVersion: string;
    title: string;
    position: Vec2;
    settings?: NodeSettings;
  }>;
  connections: NodeConnection[];
  metadata: ProjectMetadata;
}
