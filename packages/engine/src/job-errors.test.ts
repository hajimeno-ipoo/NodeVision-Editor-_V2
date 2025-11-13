import { describe, expect, it } from 'vitest';

import { isJobCancelledError, isQueueFullError, JobCancelledError, QueueFullError } from './job-errors';

describe('job error helpers', () => {
  it('detects JobCancelledError instances', () => {
    const error = new JobCancelledError('stop');
    expect(isJobCancelledError(error)).toBe(true);
    expect(isJobCancelledError(new Error('nope'))).toBe(false);
  });

  it('reports queue capacity information on QueueFullError', () => {
    const error = new QueueFullError(4);
    expect(error.maxQueueLength).toBe(4);
    expect(error.message).toBe('QUEUE_FULL');
    expect(isQueueFullError(error)).toBe(true);
    expect(isQueueFullError(new Error('nope'))).toBe(false);
  });
});
