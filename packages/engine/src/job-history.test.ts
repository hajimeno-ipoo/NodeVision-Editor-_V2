import { describe, expect, it } from 'vitest';

import { InMemoryHistoryStore } from './job-history';
import type { JobHistoryEntry } from './types';

const createEntry = (jobId: string, status: 'queued' | 'running' | 'completed' | 'canceled') => ({
  jobId,
  name: jobId,
  status,
  outputPath: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  logLevel: 'info' as const,
  message: null
});

describe('InMemoryHistoryStore', () => {
  it('keeps only the most recent entries up to the limit', () => {
    const store = new InMemoryHistoryStore(2);
    store.record(createEntry('job-1', 'queued'));
    store.record(createEntry('job-2', 'running'));
    store.record(createEntry('job-3', 'completed'));

    const entries = store.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.jobId).toBe('job-3');
    expect(entries[1]?.jobId).toBe('job-2');
  });

  it('returns defensive copies so callers cannot mutate internal state', () => {
    const store = new InMemoryHistoryStore();
    store.record(createEntry('job-1', 'queued'));

    const snapshot = store.entries();
    expect(snapshot[0]?.jobId).toBe('job-1');
    if (snapshot[0]) {
      snapshot[0].jobId = 'mutated';
    }

    const freshSnapshot = store.entries();
    expect(freshSnapshot[0]?.jobId).toBe('job-1');
  });

  it('fills missing logLevel values with info', () => {
    const store = new InMemoryHistoryStore();
    const entry = createEntry('job-42', 'queued');
    // @ts-expect-error testing fallback path
    delete entry.logLevel;
    store.record(entry as JobHistoryEntry);
    expect(store.entries()[0]?.logLevel).toBe('info');
  });
});
