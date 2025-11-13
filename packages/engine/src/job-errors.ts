export class JobCancelledError extends Error {
  constructor(message = 'Job cancelled') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

export const isJobCancelledError = (error: unknown): boolean => error instanceof JobCancelledError;
