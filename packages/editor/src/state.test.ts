import { describe, expect, it } from 'vitest';

import { createDefaultProject, createEditorState, seedDemoNodes, withUpdatedProject } from './state';
import type { NodeTemplate } from './types';

describe('state helpers', () => {
  it('creates default projects and editor state', () => {
    const project = createDefaultProject('Hello');
    expect(project.schemaVersion).toBe('1.0.7');
    expect(project.metadata.name).toBe('Hello');

    const state = createEditorState(project);
    expect(state.project).toBe(project);
    expect(state.zoom).toBe(1);
  });

  it('updates project metadata timestamps and seeds demo nodes', () => {
    const project = createDefaultProject('Update Me');
    const before = project.metadata.updatedAt;
    const baseState = createEditorState(project);
    const updatedState = withUpdatedProject(baseState, project);
    expect(updatedState.project.metadata.updatedAt >= before).toBe(true);

    const demoNodes = seedDemoNodes();
    expect(demoNodes).toHaveLength(3);
    expect(demoNodes[0].title).toBeDefined();
  });

  it('allows overriding templates and falls back when ports or dimensions are missing', () => {
    const overrideTemplates: NodeTemplate[] = [
      {
        typeId: 'withOutputs',
        nodeVersion: '1.0.0',
        title: 'Has Outputs',
        category: 'Test',
        description: 'Keeps provided width/height',
        keywords: ['with', 'outputs'],
        width: 300,
        height: 160,
        outputs: [
          { id: 'media', label: 'Media', direction: 'output', dataType: 'video', required: true }
        ]
      },
      {
        typeId: 'fallbackPorts',
        nodeVersion: '1.0.0',
        title: 'Fallback Ports',
        category: 'Test',
        description: 'Exercises ?? branches',
        keywords: ['fallback'],
        inputs: [
          { id: 'in', label: 'In', direction: 'input', dataType: 'video', required: true }
        ]
      }
    ];

    const nodes = seedDemoNodes(overrideTemplates);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].width).toBe(300);
    expect(nodes[0].outputs).toHaveLength(1);

    const fallbackNode = nodes[1];
    expect(fallbackNode.width).toBe(220);
    expect(fallbackNode.height).toBe(120);
    expect(fallbackNode.outputs).toEqual([]);
    expect(fallbackNode.inputs).toHaveLength(1);
    expect(fallbackNode.searchTokens).toEqual(['fallback']);
  });
});
