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
}

export interface SerializedProject {
  schemaVersion: string;
  nodes: Array<{
    id: string;
    typeId: string;
    nodeVersion: string;
    title: string;
    position: Vec2;
  }>;
  connections: NodeConnection[];
  metadata: ProjectMetadata;
}
