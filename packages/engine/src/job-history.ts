import { HistoryStore, JobHistoryEntry } from './types';

export class InMemoryHistoryStore implements HistoryStore {
  private list: JobHistoryEntry[] = [];

  constructor(private readonly limit = 20) {}

  record(entry: JobHistoryEntry): void {
    this.list.unshift(entry);
    if (this.list.length > this.limit) {
      this.list = this.list.slice(0, this.limit);
    }
  }

  entries(): JobHistoryEntry[] {
    return this.list.map(entry => ({ ...entry }));
  }
}
