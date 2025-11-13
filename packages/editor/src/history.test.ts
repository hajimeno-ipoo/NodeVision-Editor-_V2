import { afterEach, describe, expect, it, vi } from 'vitest';

import { AutosaveScheduler, HistoryManager } from './history';
import { createDefaultProject } from './state';

const makeProject = (name: string) => ({
  ...createDefaultProject(name)
});

describe('HistoryManager', () => {
  it('caps snapshot history and supports undo/redo', () => {
    const manager = new HistoryManager(3);
    const snapshots = ['One', 'Two', 'Three', 'Four'].map(makeProject);
    snapshots.forEach(project => manager.push(project));
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
    expect(manager.undo()?.metadata.name).toBe('Three');
    expect(manager.redo()?.metadata.name).toBe('Four');
  });

  it('drops redo stack when pushing after undo', () => {
    const manager = new HistoryManager(5);
    const one = makeProject('One');
    const two = makeProject('Two');
    const three = makeProject('Three');
    manager.push(one);
    manager.push(two);
    manager.push(three);
    manager.undo();
    manager.push(makeProject('Four')); // should drop redo snapshot
    expect(manager.canRedo()).toBe(false);
  });

  it('returns null when undo/redo are unavailable and falls back without structuredClone', () => {
    const manager = new HistoryManager();
    expect(manager.undo()).toBeNull();
    expect(manager.redo()).toBeNull();

    const project = makeProject('Fallback');
    const original = globalThis.structuredClone;
    // @ts-expect-error remove structuredClone temporarily
    globalThis.structuredClone = undefined;
    try {
      manager.push(project);
      manager.push(makeProject('Fallback Two'));
      expect(manager.undo()).not.toBeNull();
    } finally {
      globalThis.structuredClone = original;
    }
  });
});

describe('AutosaveScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('honors idle and running delays and allows cancellation', () => {
    vi.useFakeTimers();
    const scheduler = new AutosaveScheduler(2000, 10000);
    const listener = vi.fn();
    const project = makeProject('Idle Project');

    // schedule before listener is registered (should no-op)
    scheduler.schedule(project, false);

    scheduler.onSave(listener);
    scheduler.schedule(project, false);
    vi.advanceTimersByTime(1999);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(1);

    // schedule twice to ensure existing timer is cleared
    scheduler.schedule(project, false);
    scheduler.schedule(project, false);
    vi.advanceTimersByTime(2000);
    expect(listener).toHaveBeenCalledTimes(2);

    scheduler.schedule(project, true);
    scheduler.cancel();
    vi.advanceTimersByTime(10000);
    expect(listener).toHaveBeenCalledTimes(2);

    scheduler.schedule(project, true);
    vi.advanceTimersByTime(9999);
    expect(listener).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
