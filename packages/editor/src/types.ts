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

export type NodeSettings = TrimNodeSettings | ColorCorrectionNodeSettings;

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
