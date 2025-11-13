import { describe, expect, it } from 'vitest';

import { InMemoryInspectRequestHistory } from './inspect-history';

const createEntry = (id: string) => ({
  id,
  timestamp: new Date().toISOString(),
  durationMs: 10,
  statusCode: 200,
  tokenLabel: 'default',
  requestBytes: 128,
  responseCode: 'OK',
  logLevel: 'info' as const,
  meta: null
});

describe('InMemoryInspectRequestHistory', () => {
  it('keeps only the configured number of entries', () => {
    const history = new InMemoryInspectRequestHistory(2);
    history.record(createEntry('one'));
    history.record(createEntry('two'));
    history.record(createEntry('three'));

    const entries = history.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).toBe('three');
    expect(entries[1]?.id).toBe('two');
  });

  it('returns defensive copies', () => {
    const history = new InMemoryInspectRequestHistory();
    history.record(createEntry('alpha'));
    history.record({ ...createEntry('beta'), meta: { foo: 'bar' } });

    const snapshot = history.entries();
    expect(snapshot[0]?.id).toBe('beta');
    if (snapshot[0]) {
      snapshot[0].id = 'mutated';
      if (snapshot[0].meta) {
        snapshot[0].meta.foo = 'mutated';
      }
    }

    const fresh = history.entries();
    expect(fresh[0]?.id).toBe('beta');
    expect(fresh[0]?.meta?.foo).toBe('bar');
  });
});
