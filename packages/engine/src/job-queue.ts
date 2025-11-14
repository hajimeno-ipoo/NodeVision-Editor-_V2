import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { JobCancelledError, QueueFullError, isJobCancelledError } from './job-errors';
import { InMemoryHistoryStore } from './job-history';
import { JobProgressTracker } from './job-progress';
import type {
  CancelAllSummary,
  HistoryStore,
  JobHistoryEntry,
  LogLevel,
  JobRunContext,
  JobRunResult,
  JobSnapshot,
  JobState,
  QueueJobOptions,
  QueueFullEvent
} from './types';

interface InternalJob {
  id: string;
  name: string;
  status: JobState;
  createdAt: number;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  metadata?: Record<string, unknown>;
  progress: JobProgressTracker;
  options: QueueJobOptions;
  controller: AbortController;
  errorMessage?: string | null;
  message?: string | null;
  queueTimer: NodeJS.Timeout | null;
}

const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_MAX_PARALLEL_JOBS = 1;
const DEFAULT_MAX_QUEUE_LENGTH = 4;
const DEFAULT_QUEUE_TIMEOUT_MS = 3 * 60_000;

export interface JobQueueOptions {
  historyStore?: HistoryStore;
  historyLimit?: number;
  maxParallelJobs?: number;
  maxQueueLength?: number;
  queueTimeoutMs?: number;
}

export class JobQueue extends EventEmitter {
  private readonly queue: InternalJob[] = [];
  private readonly activeJobs = new Set<InternalJob>();
  private readonly history: HistoryStore;
  private readonly idleWaiters: Array<() => void> = [];
  private readonly maxParallelJobs: number;
  private readonly maxQueueLength: number;
  private readonly queueTimeoutMs: number;
  private lastQueueFullEvent: QueueFullEvent | null = null;

  constructor(options: JobQueueOptions = {}) {
    super();
    this.history =
      options.historyStore ?? new InMemoryHistoryStore(options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
    this.maxParallelJobs = Math.max(1, options.maxParallelJobs ?? DEFAULT_MAX_PARALLEL_JOBS);
    this.maxQueueLength = Math.max(1, options.maxQueueLength ?? DEFAULT_MAX_QUEUE_LENGTH);
    this.queueTimeoutMs = options.queueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS;
  }

  enqueue(options: QueueJobOptions): string {
    if (this.queue.length >= this.maxQueueLength) {
      this.lastQueueFullEvent = {
        occurredAt: Date.now(),
        queuedJobs: this.queue.length
      };
      throw new QueueFullError(this.maxQueueLength);
    }

    const job: InternalJob = {
      id: randomUUID(),
      name: options.name,
      status: 'queued',
      createdAt: Date.now(),
      queuedAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      metadata: options.metadata,
      progress: new JobProgressTracker(options.estimatedTotalTimeMs ?? null),
      options,
      controller: new AbortController(),
      queueTimer: null
    };

    this.queue.push(job);
    this.emit('job:queued', this.toSnapshot(job));
    this.scheduleQueueTimeout(job);
    this.processQueue();
    return job.id;
  }

  cancelAll(): CancelAllSummary {
    const summary: CancelAllSummary = { runningJobId: null, runningJobIds: [], queuedJobIds: [] };

    for (const job of this.activeJobs) {
      if (job.status === 'cancelling' || job.status === 'canceled') {
        continue;
      }
      job.status = 'cancelling';
      this.emit('job:status', this.toSnapshot(job));
      summary.runningJobIds.push(job.id);
      if (!summary.runningJobId) {
        summary.runningJobId = job.id;
      }
      job.controller.abort(new JobCancelledError('Cancel All'));
    }

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.clearQueueTimeout(job);
      job.status = 'canceled';
      job.finishedAt = Date.now();
      job.errorMessage = null;
      job.message = 'Canceled via Cancel All';
      summary.queuedJobIds.push(job.id);
      this.emit('job:finished', this.toSnapshot(job));
      this.recordHistory(job, { level: 'warn' });
      this.clearQueueFullEventIfRecovered();
    }

    this.notifyIdleIfNeeded();
    return summary;
  }

  getActiveJob(): JobSnapshot | null {
    const iterator = this.activeJobs.values().next();
    if (iterator.done || !iterator.value) {
      return null;
    }
    return this.toSnapshot(iterator.value);
  }

  getActiveJobs(): JobSnapshot[] {
    return Array.from(this.activeJobs).map(job => this.toSnapshot(job));
  }

  getQueuedJobs(): JobSnapshot[] {
    return this.queue.map(job => this.toSnapshot(job));
  }

  getHistory(): JobHistoryEntry[] {
    return this.history.entries();
  }

  getLimits(): { maxParallelJobs: number; maxQueueLength: number; queueTimeoutMs: number } {
    return {
      maxParallelJobs: this.maxParallelJobs,
      maxQueueLength: this.maxQueueLength,
      queueTimeoutMs: this.queueTimeoutMs
    };
  }

  getLastQueueFullEvent(): QueueFullEvent | null {
    return this.lastQueueFullEvent ? { ...this.lastQueueFullEvent } : null;
  }

  async waitForIdle(): Promise<void> {
    if (this.activeJobs.size === 0 && this.queue.length === 0) {
      return;
    }

    await new Promise<void>(resolve => {
      this.idleWaiters.push(resolve);
    });
  }

  private processQueue(): void {
    while (this.activeJobs.size < this.maxParallelJobs && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.clearQueueTimeout(next);
      this.clearQueueFullEventIfRecovered();
      this.startJob(next);
    }
  }

  private startJob(job: InternalJob): void {
    this.activeJobs.add(job);
    job.status = 'running';
    job.startedAt = Date.now();
    this.emit('job:started', this.toSnapshot(job));
    void this.runJob(job);
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
      this.activeJobs.delete(job);
      this.processQueue();
      this.notifyIdleIfNeeded();
    }
  }

  private finishJob(job: InternalJob, status: JobState, result?: JobRunResult, errorMessage?: string): void {
    job.status = status;
    job.finishedAt = Date.now();
    job.errorMessage = errorMessage ?? null;
    this.emit('job:finished', this.toSnapshot(job));
    this.recordHistory(job, { result });
  }

  private recordHistory(
    job: InternalJob,
    options: { result?: JobRunResult; level?: LogLevel; message?: string } = {}
  ): void {
    const entry: JobHistoryEntry = {
      jobId: job.id,
      name: job.name,
      status: job.status,
      outputPath: options.result?.outputPath ?? null,
      errorMessage: job.errorMessage ?? null,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      metadata: job.metadata,
      logLevel: options.level ?? this.resolveLogLevel(job.status),
      message: options.message ?? job.message ?? null
    };
    this.history.record(entry);
    job.message = null;
  }

  private resolveLogLevel(status: JobState): LogLevel {
    if (status === 'failed') {
      return 'error';
    }
    if (status === 'canceled' || status === 'cancelling') {
      return 'warn';
    }
    return 'info';
  }

  private notifyIdleIfNeeded(): void {
    if (this.activeJobs.size > 0 || this.queue.length > 0) {
      return;
    }

    while (this.idleWaiters.length > 0) {
      const resolve = this.idleWaiters.shift();
      resolve?.();
    }
  }

  private scheduleQueueTimeout(job: InternalJob): void {
    if (!this.queueTimeoutMs || this.queueTimeoutMs <= 0) {
      return;
    }
    this.clearQueueTimeout(job);
    job.queueTimer = setTimeout(() => {
      this.expireQueuedJob(job);
    }, this.queueTimeoutMs);
    if (typeof job.queueTimer.unref === 'function') {
      job.queueTimer.unref();
    }
  }

  private clearQueueTimeout(job: InternalJob): void {
    if (job.queueTimer) {
      clearTimeout(job.queueTimer);
      job.queueTimer = null;
    }
  }

  private expireQueuedJob(job: InternalJob): void {
    const index = this.queue.findIndex(entry => entry.id === job.id);
    if (index === -1) {
      return;
    }

    this.queue.splice(index, 1);
    job.status = 'canceled';
    job.finishedAt = Date.now();
    job.errorMessage = null;
    job.message = `Queue timeout exceeded (${Math.round(this.queueTimeoutMs / 1000)}s)`;
    this.emit('job:finished', this.toSnapshot(job));
    this.recordHistory(job, { level: 'warn' });
    this.clearQueueFullEventIfRecovered();
    this.notifyIdleIfNeeded();
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

  private clearQueueFullEventIfRecovered(): void {
    if (this.lastQueueFullEvent && this.queue.length < this.maxQueueLength) {
      this.lastQueueFullEvent = null;
    }
  }
}
