import { DEFAULT_NODE_TEMPLATES } from './templates';
import type { EditorNode, EditorProject, EditorState, NodeSettings, NodeTemplate } from './types';

export const PROJECT_SCHEMA_VERSION = '1.0.7';

export const createDefaultProject = (name = 'Untitled Project'): EditorProject => {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    nodes: [],
    connections: [],
    metadata: {
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      readonly: false
    }
  };
};

export const createEditorState = (project: EditorProject = createDefaultProject()): EditorState => ({
  project,
  selection: { nodeIds: [] },
  clipboard: [],
  zoom: 1,
  isRunning: false
});

const cloneSettings = (settings?: NodeSettings): NodeSettings | undefined =>
  settings ? JSON.parse(JSON.stringify(settings)) : undefined;

export const withUpdatedProject = (state: EditorState, project: EditorProject): EditorState => ({
  ...state,
  project: {
    ...project,
    metadata: {
      ...project.metadata,
      updatedAt: new Date().toISOString()
    }
  }
});

export const seedDemoNodes = (templates: NodeTemplate[] = DEFAULT_NODE_TEMPLATES): EditorNode[] => {
  return templates.slice(0, 3).map((template, index) => ({
    id: `${template.typeId}-${index}`,
    typeId: template.typeId,
    nodeVersion: template.nodeVersion,
    title: template.title,
    position: { x: 160 * index, y: 80 * index },
    width: template.width ?? 220,
    height: template.height ?? 120,
    inputs: template.inputs?.map(port => ({ ...port })) ?? [],
    outputs: template.outputs?.map(port => ({ ...port })) ?? [],
    searchTokens: template.keywords,
    settings: cloneSettings(template.defaultSettings)
  }));
};
