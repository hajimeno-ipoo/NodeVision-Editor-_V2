import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { JobCancelledError, isJobCancelledError } from './job-errors';
import { InMemoryHistoryStore } from './job-history';
import { JobProgressTracker } from './job-progress';
import {
  CancelAllSummary,
  HistoryStore,
  JobHistoryEntry,
  JobPreviewContext,
  JobRunContext,
  JobRunResult,
  JobSnapshot,
  JobState,
  QueueJobOptions
} from './types';

interface InternalJob<TResult = unknown> {
  id: string;
  name: string;
  status: JobState;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  metadata?: Record<string, unknown>;
  progress: JobProgressTracker;
  options: QueueJobOptions<TResult>;
  controller: AbortController;
  errorMessage?: string | null;
}

const DEFAULT_HISTORY_LIMIT = 20;

export interface JobQueueOptions {
  historyStore?: HistoryStore;
  historyLimit?: number;
}

export class JobQueue extends EventEmitter {
  private readonly queue: InternalJob[] = [];
  private current: InternalJob | null = null;
  private readonly history: HistoryStore;
  private readonly idleWaiters: Array<() => void> = [];

  constructor(options: JobQueueOptions = {}) {
    super();
    this.history =
      options.historyStore ?? new InMemoryHistoryStore(options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
  }

  enqueue<TResult>(options: QueueJobOptions<TResult>): string {
    const job: InternalJob<TResult> = {
      id: randomUUID(),
      name: options.name,
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      metadata: options.metadata,
      progress: new JobProgressTracker(options.estimatedTotalTimeMs ?? null),
      options,
      controller: new AbortController()
    };

    this.queue.push(job);
    this.emit('job:queued', this.toSnapshot(job));
    this.processQueue();
    return job.id;
  }

  cancelAll(): CancelAllSummary {
    const summary: CancelAllSummary = { runningJobId: null, queuedJobIds: [] };

    if (this.current && this.current.status !== 'cancelling' && this.current.status !== 'canceled') {
      this.current.status = 'cancelling';
      this.emit('job:status', this.toSnapshot(this.current));
      summary.runningJobId = this.current.id;
      this.current.controller.abort(new JobCancelledError('Cancel All'));
    }

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      job.status = 'canceled';
      job.finishedAt = Date.now();
      job.errorMessage = null;
      summary.queuedJobIds.push(job.id);
      this.emit('job:finished', this.toSnapshot(job));
      this.recordHistory(job);
    }

    this.notifyIdleIfNeeded();
    return summary;
  }

  getActiveJob(): JobSnapshot | null {
    return this.current ? this.toSnapshot(this.current) : null;
  }

  getQueuedJobs(): JobSnapshot[] {
    return this.queue.map(job => this.toSnapshot(job));
  }

  getHistory(): JobHistoryEntry[] {
    return this.history.entries();
  }

  async waitForIdle(): Promise<void> {
    if (!this.current && this.queue.length === 0) {
      return;
    }

    await new Promise<void>(resolve => {
      this.idleWaiters.push(resolve);
    });
  }

  private processQueue(): void {
    if (this.current || this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift()!;
    this.current = next;
    next.status = 'running';
    next.startedAt = Date.now();
    this.emit('job:started', this.toSnapshot(next));
    void this.runJob(next);
  }

  private async runJob(job: InternalJob): Promise<void> {
    try {
      const ctx: JobRunContext = {
        signal: job.controller.signal,
        progress: job.progress
      };

      const result = await job.options.execute(ctx);

      if (typeof result.totalTimeMs === 'number') {
        job.progress.setTotalTime(result.totalTimeMs);
      }
      if (typeof result.outputTimeMs === 'number') {
        job.progress.updateOutputTime(result.outputTimeMs);
      }

      if (job.controller.signal.aborted) {
        this.finishJob(job, 'canceled');
        return;
      }

      if (job.options.generatePreview) {
        job.status = 'coolingDown';
        this.emit('job:status', this.toSnapshot(job));
        await job.options.generatePreview(result, { signal: job.controller.signal });
        if (job.controller.signal.aborted) {
          throw new JobCancelledError('Preview cancelled');
        }
      }

      this.finishJob(job, 'completed', result);
    } catch (error) {
      if (job.controller.signal.aborted || isJobCancelledError(error)) {
        this.finishJob(job, 'canceled');
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.finishJob(job, 'failed', undefined, message);
      }
    } finally {
      this.current = null;
      this.processQueue();
      this.notifyIdleIfNeeded();
    }
  }

  private finishJob(job: InternalJob, status: JobState, result?: JobRunResult, errorMessage?: string): void {
    job.status = status;
    job.finishedAt = Date.now();
    job.errorMessage = errorMessage ?? null;
    this.emit('job:finished', this.toSnapshot(job));
    this.recordHistory(job, result);
  }

  private recordHistory(job: InternalJob, result?: JobRunResult): void {
    const entry: JobHistoryEntry = {
      jobId: job.id,
      name: job.name,
      status: job.status,
      outputPath: result?.outputPath ?? null,
      errorMessage: job.errorMessage ?? null,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      metadata: job.metadata
    };
    this.history.record(entry);
  }

  private notifyIdleIfNeeded(): void {
    if (this.current || this.queue.length > 0) {
      return;
    }

    while (this.idleWaiters.length > 0) {
      const resolve = this.idleWaiters.shift();
      resolve?.();
    }
  }

  private toSnapshot(job: InternalJob): JobSnapshot {
    return {
      jobId: job.id,
      name: job.name,
      status: job.status,
      progress: job.progress.snapshot(),
      metadata: job.metadata
    };
  }
}
