import { InspectRequestHistoryStore, InspectRequestLog } from '../types';

export class InMemoryInspectRequestHistory implements InspectRequestHistoryStore {
  private entriesBuffer: InspectRequestLog[] = [];

  constructor(private readonly limit = 50) {}

  record(entry: InspectRequestLog): void {
    this.entriesBuffer.unshift({
      ...entry,
      meta: entry.meta ? { ...entry.meta } : null,
      includeOptions: entry.includeOptions ? [...entry.includeOptions] : null
    });
    if (this.entriesBuffer.length > this.limit) {
      this.entriesBuffer = this.entriesBuffer.slice(0, this.limit);
    }
  }

  entries(): InspectRequestLog[] {
    return this.entriesBuffer.map(item => ({
      ...item,
      meta: item.meta ? { ...item.meta } : null,
      includeOptions: item.includeOptions ? [...item.includeOptions] : null
    }));
  }
}
