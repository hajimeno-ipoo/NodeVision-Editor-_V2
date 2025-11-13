import { describe, expect, it } from 'vitest';

import { DEFAULT_NODE_TEMPLATES } from './templates';
import { deserializeProject, serializeProject } from './persistence';
import { createDefaultProject } from './state';
import type { SerializedProject } from './types';

describe('persistence', () => {
  it('serializes and deserializes the current schema without readonly flag', () => {
    const project = createDefaultProject('Demo');
    project.nodes = DEFAULT_NODE_TEMPLATES.slice(0, 1).map((template, index) => ({
      id: `${template.typeId}-${index}`,
      typeId: template.typeId,
      nodeVersion: template.nodeVersion,
      title: template.title,
      position: { x: 10, y: 10 },
      width: template.width ?? 220,
      height: template.height ?? 120,
      inputs: [],
      outputs: [],
      searchTokens: template.keywords
    }));
    const serialized = serializeProject(project);
    const { project: hydrated, migrated } = deserializeProject(serialized);
    expect(migrated).toBe(false);
    expect(hydrated.metadata.readonly).toBe(false);
    expect(hydrated.nodes[0].title).toBe(project.nodes[0].title);
  });

  it('migrates supported schema versions and marks readonly on unknown versions', () => {
    const legacy: SerializedProject = {
      schemaVersion: '1.0.5',
      nodes: [
        {
          id: 'legacy-load',
          typeId: DEFAULT_NODE_TEMPLATES[0].typeId,
          nodeVersion: '0.9.0',
          title: 'Legacy Load',
          position: { x: 0, y: 0 }
        },
        {
          id: 'mystery-node',
          typeId: 'unknown-node',
          nodeVersion: '0.1.0',
          title: 'Mystery',
          position: { x: 10, y: 10 }
        }
      ],
      connections: [],
      metadata: {
        name: 'Legacy',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        readonly: false
      }
    };

    const migrated = deserializeProject(legacy);
    expect(migrated.migrated).toBe(true);
    expect(migrated.project.schemaVersion).toBe('1.0.7');
    expect(migrated.project.metadata.readonly).toBe(false);
    const fallbackNode = migrated.project.nodes.find(node => node.id === 'mystery-node');
    expect(fallbackNode?.width).toBe(220);

    const future: SerializedProject = {
      ...legacy,
      schemaVersion: '9.9.9'
    };
    const readonlyResult = deserializeProject(future);
    expect(readonlyResult.readonlyFallback).toBe(true);
    expect(readonlyResult.project.metadata.readonly).toBe(true);
  });

  it('falls back when structuredClone is unavailable', () => {
    const project = createDefaultProject('Clone Test');
    const original = globalThis.structuredClone;
    // @ts-expect-error - intentionally remove structuredClone to exercise fallback path
    globalThis.structuredClone = undefined;
    try {
      const serialized = serializeProject(project);
      expect(serialized.schemaVersion).toBe('1.0.7');
    } finally {
      globalThis.structuredClone = original;
    }
  });
});
