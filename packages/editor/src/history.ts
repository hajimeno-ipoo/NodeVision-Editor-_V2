import type { EditorProject } from './types';

type Snapshot = EditorProject;

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export class HistoryManager {
  private readonly snapshots: Snapshot[] = [];
  private pointer = -1;
  private readonly limit: number;

  constructor(limit: number = 100) {
    this.limit = limit;
  }

  push(project: EditorProject): void {
    if (this.pointer < this.snapshots.length - 1) {
      this.snapshots.splice(this.pointer + 1);
    }
    this.snapshots.push(deepClone(project));
    if (this.snapshots.length > this.limit) {
      this.snapshots.shift();
    }
    this.pointer = this.snapshots.length - 1;
  }

  canUndo(): boolean {
    return this.pointer > 0;
  }

  canRedo(): boolean {
    return this.pointer < this.snapshots.length - 1;
  }

  undo(): EditorProject | null {
    if (!this.canUndo()) {
      return null;
    }
    this.pointer--;
    return deepClone(this.snapshots[this.pointer]);
  }

  redo(): EditorProject | null {
    if (!this.canRedo()) {
      return null;
    }
    this.pointer++;
    return deepClone(this.snapshots[this.pointer]);
  }
}

export type AutosaveListener = (project: EditorProject) => Promise<void> | void;

export class AutosaveScheduler {
  private readonly idleDelayMs: number;
  private readonly runningDelayMs: number;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private listener: AutosaveListener | null = null;

  constructor(idleDelayMs = 2000, runningDelayMs = 10000) {
    this.idleDelayMs = idleDelayMs;
    this.runningDelayMs = runningDelayMs;
  }

  onSave(listener: AutosaveListener): void {
    this.listener = listener;
  }

  schedule(project: EditorProject, isRunning: boolean): void {
    if (!this.listener) {
      return;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    const delay = isRunning ? this.runningDelayMs : this.idleDelayMs;
    this.timeout = setTimeout(() => {
      this.listener?.(project);
      this.timeout = null;
    }, delay);
  }

  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
