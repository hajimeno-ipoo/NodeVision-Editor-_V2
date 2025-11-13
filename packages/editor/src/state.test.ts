import { describe, expect, it } from 'vitest';

import { createDefaultProject, createEditorState, seedDemoNodes, withUpdatedProject } from './state';

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
});
