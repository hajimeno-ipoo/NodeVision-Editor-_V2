import { once } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { JobCancelledError, QueueFullError } from './job-errors';
import { JobQueue } from './job-queue';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe('JobQueue', () => {
  it('runs jobs sequentially and waits for preview completion before starting the next job', async () => {
    const queue = new JobQueue();
    const events: string[] = [];

    queue.enqueue({
      name: 'alpha',
      execute: async () => {
        events.push('alpha:run');
        await delay(5);
        return { totalTimeMs: 1_000, outputTimeMs: 1_000, outputPath: 'alpha.mp4' };
      },
      generatePreview: async () => {
        events.push('alpha:preview');
        await delay(2);
      }
    });

    queue.enqueue({
      name: 'beta',
      execute: async () => {
        events.push('beta:run');
        await delay(1);
        return { totalTimeMs: 500, outputTimeMs: 500, outputPath: 'beta.mp4' };
      },
      generatePreview: async () => {
        events.push('beta:preview');
      }
    });

    await queue.waitForIdle();

    expect(events).toEqual(['alpha:run', 'alpha:preview', 'beta:run', 'beta:preview']);
    const history = queue.getHistory();
    expect(history).toHaveLength(2);
    expect(history.every(entry => entry.status === 'completed')).toBe(true);
  });

  it('runs multiple jobs concurrently when maxParallelJobs is greater than 1', async () => {
    const queue = new JobQueue({ maxParallelJobs: 2 });
    const events: string[] = [];

    const makeJob = (name: string, delayMs: number) => ({
      name,
      execute: async () => {
        events.push(`${name}:start`);
        await delay(delayMs);
        events.push(`${name}:end`);
        return { totalTimeMs: delayMs, outputTimeMs: delayMs };
      }
    });

    queue.enqueue(makeJob('job-1', 20));
    queue.enqueue(makeJob('job-2', 20));
    queue.enqueue(makeJob('job-3', 5));

    await queue.waitForIdle();

    const job2Start = events.indexOf('job-2:start');
    const job1End = events.indexOf('job-1:end');
    const job3Start = events.indexOf('job-3:start');
    expect(job2Start).toBeGreaterThan(-1);
    expect(job1End).toBeGreaterThan(-1);
    expect(job2Start).toBeLessThan(job1End);
    expect(job3Start).toBeGreaterThan(job1End);
    expect(events.at(-1)).toBe('job-3:end');
  });

  it('exposes snapshots for active jobs', async () => {
    const queue = new JobQueue();
    let release: (() => void) | null = null;
    queue.enqueue({
      name: 'active',
      execute: () =>
        new Promise(resolve => {
          release = () => resolve({ totalTimeMs: 100, outputTimeMs: 100 });
        })
    });

    await delay(0);
    expect(queue.getActiveJobs()).toHaveLength(1);
    release?.();
    await queue.waitForIdle();
    expect(queue.getActiveJobs()).toHaveLength(0);
  });

  it('throws QueueFullError when queued jobs exceed the configured limit', async () => {
    const queue = new JobQueue({ maxQueueLength: 2 });
    let release: (() => void) | null = null;

    queue.enqueue({
      name: 'blocking',
      execute: () =>
        new Promise(resolve => {
          release = () => resolve({ totalTimeMs: 50, outputTimeMs: 50 });
        })
    });

    queue.enqueue({
      name: 'queued-1',
      execute: async () => ({ totalTimeMs: 10, outputTimeMs: 10 })
    });

    queue.enqueue({
      name: 'queued-2',
      execute: async () => ({ totalTimeMs: 10, outputTimeMs: 10 })
    });

    expect(() =>
      queue.enqueue({
        name: 'overflow',
        execute: async () => ({ totalTimeMs: 10, outputTimeMs: 10 })
      })
    ).toThrowError(QueueFullError);

    release?.();
    await queue.waitForIdle();
  });

  it('auto-cancels queued jobs after the timeout elapses', async () => {
    vi.useFakeTimers();
    try {
      const queue = new JobQueue({ queueTimeoutMs: 25 });
      let release: (() => void) | null = null;

      queue.enqueue({
        name: 'blocking',
        execute: () =>
          new Promise(resolve => {
            release = () => resolve({ totalTimeMs: 50, outputTimeMs: 50 });
          })
      });

      queue.enqueue({
        name: 'timeout-target',
        execute: async () => ({ totalTimeMs: 10, outputTimeMs: 10 })
      });

      await vi.advanceTimersByTimeAsync(30);
      const history = queue.getHistory();
      expect(history[0]?.name).toBe('timeout-target');
      expect(history[0]?.status).toBe('canceled');
      expect(history[0]?.logLevel).toBe('warn');
      expect(history[0]?.message).toContain('Queue timeout');

      release?.();
      await queue.waitForIdle();
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips scheduling queue timeouts when disabled', async () => {
    const queue = new JobQueue({ queueTimeoutMs: 0 });
    queue.enqueue({
      name: 'no-timeout',
      execute: async () => ({ totalTimeMs: 10, outputTimeMs: 10 })
    });
    await queue.waitForIdle();
    const [entry] = queue.getHistory();
    expect(entry?.status).toBe('completed');
  });

  it('ignores timeout expiration when the job has already left the queue', () => {
    const queue = new JobQueue({ queueTimeoutMs: 50 });
    queue.enqueue({ name: 'ghost', execute: async () => ({ totalTimeMs: 10, outputTimeMs: 10 }) });
    const internals = queue as unknown as { queue: any[]; expireQueuedJob: (job: any) => void };
    const queuedJob = internals.queue[0];
    internals.queue.length = 0;
    internals.expireQueuedJob(queuedJob);
    expect(queue.getHistory()).toHaveLength(0);
  });

  it('prioritizes the running job when cancelAll is invoked and records cancellations in history', async () => {
    const queue = new JobQueue();

    const startedPromise = once(queue, 'job:started');
    let releaseJob: (() => void) | null = null;
    const job1Id = queue.enqueue({
      name: 'job-1',
      execute: async () =>
        new Promise((_, reject) => {
          releaseJob = () => reject(new JobCancelledError('aborted'));
        })
    });

    const job2Id = queue.enqueue({
      name: 'job-2',
      execute: async () => ({ totalTimeMs: 500, outputTimeMs: 500 })
    });

    const job3Id = queue.enqueue({
      name: 'job-3',
      execute: async () => ({ totalTimeMs: 500, outputTimeMs: 500 })
    });

    const queuedBeforeCancel = queue.getQueuedJobs();
    expect(queuedBeforeCancel.map(job => job.jobId)).toEqual([job2Id, job3Id]);

    await startedPromise;
    await delay(0);
    await delay(10);
    expect(releaseJob).not.toBeNull();

    const cancelStart = Date.now();
    const summary = queue.cancelAll();
    const active = queue.getActiveJob();
    expect(summary.runningJobId).toBe(job1Id);
    expect(summary.runningJobIds).toContain(job1Id);
    expect(summary.queuedJobIds).toEqual([job2Id, job3Id]);
    expect(active?.status).toBe('cancelling');
    expect(Date.now() - cancelStart).toBeLessThan(2_000);

    releaseJob?.();
    await delay(0);
    await delay(0);
    const history = queue.getHistory();
    const statusById = Object.fromEntries(history.map(entry => [entry.jobId, entry.status]));
    expect(statusById[job1Id]).toBe('canceled');
    expect(statusById[job2Id]).toBe('canceled');
    expect(statusById[job3Id]).toBe('canceled');
    expect(history.every(entry => entry.logLevel === 'warn')).toBe(true);
  }, 10_000);

  it('resolves waitForIdle immediately when no jobs are queued', async () => {
    const queue = new JobQueue();
    await queue.waitForIdle();
  });

  it('records failures when a job throws an unexpected error', async () => {
    const queue = new JobQueue();
    queue.enqueue({
      name: 'failure',
      execute: async () => {
        throw new Error('boom');
      }
    });

    await queue.waitForIdle();
    const [entry] = queue.getHistory();
    expect(entry?.status).toBe('failed');
    expect(entry?.errorMessage).toBe('boom');
    expect(entry?.logLevel).toBe('error');
  });

  it('string-based errors are stringified in history', async () => {
    const queue = new JobQueue();
    queue.enqueue({
      name: 'string-failure',
      execute: async () => {
        throw 'boom-string';
      }
    });

    await queue.waitForIdle();
    const [entry] = queue.getHistory();
    expect(entry?.status).toBe('failed');
    expect(entry?.errorMessage).toBe('boom-string');
    expect(entry?.logLevel).toBe('error');
  });

  it('aborts preview when cancelAll is triggered during cooling down', async () => {
    const queue = new JobQueue();
    queue.enqueue({
      name: 'preview-job',
      execute: async () => ({ totalTimeMs: 100, outputTimeMs: 100 }),
      generatePreview: async (_, { signal }) => {
        queue.cancelAll();
        await delay(0);
        expect(signal.aborted).toBe(true);
      }
    });

    await queue.waitForIdle();
    const [entry] = queue.getHistory();
    expect(entry?.status).toBe('canceled');
    expect(entry?.logLevel).toBe('warn');
  });

  it('cancels immediately when the signal is aborted after execution completes', async () => {
    const queue = new JobQueue();
    queue.enqueue({
      name: 'post-exec-cancel',
      execute: async () => {
        queue.cancelAll();
        return { totalTimeMs: 50, outputTimeMs: 50 };
      }
    });

    await queue.waitForIdle();
    const [entry] = queue.getHistory();
    expect(entry?.status).toBe('canceled');
    expect(entry?.logLevel).toBe('warn');
  });

  it('returns empty summaries when cancelAll is invoked while idle', () => {
    const queue = new JobQueue();
    expect(queue.getActiveJob()).toBeNull();
    const summary = queue.cancelAll();
    expect(summary.runningJobId).toBeNull();
    expect(summary.runningJobIds).toEqual([]);
    expect(summary.queuedJobIds).toEqual([]);
    expect(queue.getHistory()).toHaveLength(0);
  });

  it('ignores cancelAll on jobs already marked as cancelling', async () => {
    const queue = new JobQueue();
    let release: (() => void) | null = null;
    queue.enqueue({
      name: 'linger',
      execute: () =>
        new Promise((_, reject) => {
          release = () => reject(new JobCancelledError('stop'));
        })
    });

    await delay(0);
    queue.cancelAll();
    const summary = queue.cancelAll();
    expect(summary.runningJobIds).toEqual([]);
    release?.();
    await queue.waitForIdle();
  });

  it('exposes queue limits for diagnostics consumers', () => {
    const queue = new JobQueue({ maxParallelJobs: 2, maxQueueLength: 6, queueTimeoutMs: 45_000 });
    expect(queue.getLimits()).toEqual({ maxParallelJobs: 2, maxQueueLength: 6, queueTimeoutMs: 45_000 });
  });

  it('records QueueFullError events until the queue recovers', async () => {
    const queue = new JobQueue({ maxQueueLength: 1 });
    expect(queue.getLastQueueFullEvent()).toBeNull();
    let release: (() => void) | null = null;
    queue.enqueue({
      name: 'blocking',
      execute: () =>
        new Promise(resolve => {
          release = () => resolve({ totalTimeMs: 50, outputTimeMs: 50 });
        })
    });

    queue.enqueue({ name: 'queued', execute: async () => ({ totalTimeMs: 10, outputTimeMs: 10 }) });
    expect(() =>
      queue.enqueue({ name: 'overflow', execute: async () => ({ totalTimeMs: 5, outputTimeMs: 5 }) })
    ).toThrow(QueueFullError);

    const event = queue.getLastQueueFullEvent();
    expect(event).not.toBeNull();
    expect(event?.queuedJobs).toBe(1);

    release?.();
    await queue.waitForIdle();
    expect(queue.getLastQueueFullEvent()).toBeNull();
  });
});
