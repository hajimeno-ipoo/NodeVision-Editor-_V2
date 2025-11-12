import { EventEmitter } from 'events';

export type JobStatus = 'queued'|'running'|'canceled'|'failed'|'completed';
export type HistoryItem = { jobId: string; createdAt: string; name: string; outputPath?: string; status: JobStatus };

export class HistoryStore extends EventEmitter {
  private list: HistoryItem[] = [];
  private max = 20;
  push(item: HistoryItem) {
    this.list.unshift(item);
    if (this.list.length > this.max) this.list = this.list.slice(0, this.max);
    this.emit('changed', this.list);
  }
  update(jobId: string, patch: Partial<HistoryItem>) {
    const idx = this.list.findIndex(x => x.jobId === jobId);
    if (idx >= 0) { this.list[idx] = { ...this.list[idx], ...patch }; this.emit('changed', this.list); }
  }
  getAll() { return this.list.slice(0, this.max); }
}
