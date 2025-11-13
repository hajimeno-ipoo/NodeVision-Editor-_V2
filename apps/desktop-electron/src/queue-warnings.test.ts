import type { JobHistoryEntry, QueueFullEvent } from '@nodevision/engine';
import { describe, expect, it } from 'vitest';

import { buildQueueWarnings } from './queue-warnings';
import type { QueueLimits } from './types';

const createHistoryEntry = (overrides: Partial<JobHistoryEntry> = {}): JobHistoryEntry => ({
  jobId: overrides.jobId ?? 'job-1',
  name: overrides.name ?? 'Job 1',
  status: overrides.status ?? 'canceled',
  outputPath: overrides.outputPath ?? null,
  errorMessage: overrides.errorMessage ?? null,
  startedAt: overrides.startedAt ?? Date.now() - 1_000,
  finishedAt: overrides.finishedAt ?? Date.now(),
  metadata: overrides.metadata ?? {},
  logLevel: overrides.logLevel ?? 'warn',
  message: overrides.message ?? null
});

const limits: QueueLimits = {
  maxParallelJobs: 1,
  maxQueueLength: 2,
  queueTimeoutMs: 180_000
};

describe('buildQueueWarnings', () => {
  it('uses the recorded QueueFullError event timestamp when provided', () => {
    const queueFullEvent: QueueFullEvent = { occurredAt: 1_734_000_000_000, queuedJobs: 2 };
    const warnings = buildQueueWarnings([], limits, 0, queueFullEvent, 1_734_100_000_000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      type: 'QUEUE_FULL',
      message: expect.stringContaining('QueueFullError'),
      occurredAt: new Date(queueFullEvent.occurredAt).toISOString()
    });
  });

  it('falls back to current queue length when no QueueFullError event is available', () => {
    const now = 1_734_200_000_000;
    const warnings = buildQueueWarnings([], limits, 3, null, now);
    expect(warnings[0]).toMatchObject({
      type: 'QUEUE_FULL',
      message: '待機キューが満杯 (3/2)',
      occurredAt: new Date(now).toISOString()
    });
  });

  it('adds timeout warnings based on history.message matches', () => {
    const history = [
      createHistoryEntry({
        message: 'Queue timeout exceeded (180s)',
        finishedAt: 1_734_300_000_000,
        logLevel: 'warn'
      })
    ];
    const warnings = buildQueueWarnings(history, limits, 0, null, 1_734_400_000_000);
    expect(warnings.some(warning => warning.type === 'QUEUE_TIMEOUT')).toBe(true);
  });

  it('detects timeout wording in errorMessage when message is empty', () => {
    const history = [
      createHistoryEntry({
        message: null,
        errorMessage: 'Queue timeout exceeded due to idle',
        finishedAt: 1_734_350_000_000,
        logLevel: 'warn'
      })
    ];
    const warnings = buildQueueWarnings(history, limits, 0, null, 1_734_360_000_000);
    expect(warnings.some(warning => warning.type === 'QUEUE_TIMEOUT')).toBe(true);
  });

  it('prefers the latest timeout entry when multiple exist', () => {
    const older = createHistoryEntry({
      message: 'Queue timeout older',
      finishedAt: 1_734_300_000_000
    });
    const newer = createHistoryEntry({
      message: 'Queue timeout newer',
      finishedAt: 1_734_400_000_000
    });
    const warnings = buildQueueWarnings([older, newer], limits, 0, null, 1_734_500_000_000);
    const timeoutWarning = warnings.find(warning => warning.type === 'QUEUE_TIMEOUT');
    expect(timeoutWarning?.occurredAt).toBe(new Date(newer.finishedAt ?? 0).toISOString());
  });
});
