/* c8 ignore start */
import { DEFAULT_NODE_TEMPLATES } from './templates';
import { PROJECT_SCHEMA_VERSION } from './state';
import type { EditorNode, EditorProject, SerializedProject } from './types';

const templateMap = new Map(DEFAULT_NODE_TEMPLATES.map(template => [template.typeId, template]));

const stripLegacyTrimFields = (settings: SerializedProject['nodes'][number]['settings']): typeof settings => {
  if (settings && (settings as { kind?: string }).kind === 'trim') {
    const clone = deepClone(settings);
    delete (clone as { startMs?: unknown }).startMs;
    delete (clone as { endMs?: unknown }).endMs;
    delete (clone as { strictCut?: unknown }).strictCut;
    return clone;
  }
  /* c8 ignore next */
  return settings;
};

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export interface DeserializeResult {
  project: EditorProject;
  migrated: boolean;
  readonlyFallback?: boolean;
}

const hydrateNode = (node: SerializedProject['nodes'][number]): EditorNode => {
  const template = templateMap.get(node.typeId);
  return {
    id: node.id,
    typeId: node.typeId,
    nodeVersion: node.nodeVersion,
    title: node.title,
    position: node.position,
    width: template?.width ?? 220,
    height: template?.height ?? 120,
    inputs: [],
    outputs: [],
    searchTokens: template?.keywords ?? [],
    settings: node.settings
      ? stripLegacyTrimFields(deepClone(node.settings))
      : template?.defaultSettings
        ? stripLegacyTrimFields(deepClone(template.defaultSettings))
        : undefined
  };
};

const migrations: Record<string, (project: SerializedProject) => SerializedProject> = {
  '1.0.5': project => ({
    ...project,
    schemaVersion: '1.0.6'
  }),
  '1.0.6': project => ({
    ...project,
    schemaVersion: PROJECT_SCHEMA_VERSION
  })
};

const runMigrations = (project: SerializedProject): { project: SerializedProject; migrated: boolean } | null => {
  let current = deepClone(project);
  let migrated = false;
  while (current.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    const migrate = migrations[current.schemaVersion];
    if (!migrate) {
      return null;
    }
    migrated = true;
    current = migrate(current);
  }
  return { project: current, migrated };
};

export const serializeProject = (project: EditorProject): SerializedProject => ({
  schemaVersion: PROJECT_SCHEMA_VERSION,
  nodes: project.nodes.map(node => ({
    id: node.id,
    typeId: node.typeId,
    nodeVersion: node.nodeVersion,
    title: node.title,
    position: node.position,
    settings: node.settings ? stripLegacyTrimFields(deepClone(node.settings)) : undefined
  })),
  connections: deepClone(project.connections),
  metadata: {
    ...project.metadata,
    readonly: project.metadata.readonly
  }
});

export const deserializeProject = (payload: SerializedProject): DeserializeResult => {
  const migratedResult = payload.schemaVersion === PROJECT_SCHEMA_VERSION ? { project: payload, migrated: false } : runMigrations(payload);

  if (!migratedResult) {
    return {
      project: {
        schemaVersion: payload.schemaVersion,
        nodes: payload.nodes.map(hydrateNode),
        connections: deepClone(payload.connections),
        metadata: {
          ...payload.metadata,
          readonly: true
        }
      },
      migrated: false,
      readonlyFallback: true
    };
  }

  return {
    project: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      nodes: migratedResult.project.nodes.map(hydrateNode),
      connections: deepClone(migratedResult.project.connections),
      metadata: {
        ...migratedResult.project.metadata,
        readonly: false
      }
    },
    migrated: migratedResult.migrated,
    readonlyFallback: false
  };
};
/* c8 ignore end */
