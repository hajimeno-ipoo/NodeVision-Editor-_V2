import type { JobHistoryEntry, QueueFullEvent } from '@nodevision/engine';

import type { QueueLimits, QueueWarning } from './types';

const includesTimeout = (value?: string | null): boolean =>
  typeof value === 'string' && value.toLowerCase().includes('queue timeout');

const resolveEventTime = (entry: JobHistoryEntry): number => entry.finishedAt ?? entry.startedAt ?? 0;

const findLatestTimeoutEntry = (history: JobHistoryEntry[]): JobHistoryEntry | undefined => {
  let latest: JobHistoryEntry | null = null;
  for (const entry of history) {
    if (!includesTimeout(entry.message) && !includesTimeout(entry.errorMessage)) {
      continue;
    }
    if (!latest || resolveEventTime(entry) > resolveEventTime(latest)) {
      latest = entry;
    }
  }
  return latest ?? undefined;
};

const toIsoString = (value: number): string => new Date(value).toISOString();

export const buildQueueWarnings = (
  history: JobHistoryEntry[],
  limits: QueueLimits | undefined,
  queuedLength: number,
  queueFullEvent: QueueFullEvent | null,
  now: number = Date.now()
): QueueWarning[] => {
  if (!limits) {
    return [];
  }

  const warnings: QueueWarning[] = [];

  if (queueFullEvent) {
    warnings.push({
      type: 'QUEUE_FULL',
      level: 'warn',
      message: `QueueFullError発生: 待機 ${queueFullEvent.queuedJobs}/${limits.maxQueueLength}`,
      occurredAt: toIsoString(queueFullEvent.occurredAt)
    });
  } else if (queuedLength >= limits.maxQueueLength) {
    warnings.push({
      type: 'QUEUE_FULL',
      level: 'warn',
      message: `待機キューが満杯 (${queuedLength}/${limits.maxQueueLength})`,
      occurredAt: toIsoString(now)
    });
  }

  const timeoutEntry = findLatestTimeoutEntry(history);
  if (timeoutEntry) {
    const eventTime = timeoutEntry.finishedAt ?? timeoutEntry.startedAt ?? now;
    warnings.push({
      type: 'QUEUE_TIMEOUT',
      level: timeoutEntry.logLevel,
      message: timeoutEntry.message ?? 'Queue timeout exceeded',
      occurredAt: toIsoString(eventTime)
    });
  }

  return warnings;
};
