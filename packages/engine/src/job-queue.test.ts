import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

import { JobCancelledError } from './job-errors';
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
  });

  it('returns empty summaries when cancelAll is invoked while idle', () => {
    const queue = new JobQueue();
    expect(queue.getActiveJob()).toBeNull();
    const summary = queue.cancelAll();
    expect(summary.runningJobId).toBeNull();
    expect(summary.queuedJobIds).toEqual([]);
    expect(queue.getHistory()).toHaveLength(0);
  });
});
