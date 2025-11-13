export class JobCancelledError extends Error {
  constructor(message = 'Job cancelled') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

export const isJobCancelledError = (error: unknown): boolean => error instanceof JobCancelledError;

export class QueueFullError extends Error {
  constructor(public readonly maxQueueLength: number) {
    super('QUEUE_FULL');
    this.name = 'QueueFullError';
  }
}

export const isQueueFullError = (error: unknown): error is QueueFullError => error instanceof QueueFullError;
