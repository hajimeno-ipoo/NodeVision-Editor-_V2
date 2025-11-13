import { JobProgressSnapshot, JobProgressSnapshotProvider } from './types';

const clampToNonNegative = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

export class JobProgressTracker implements JobProgressSnapshotProvider {
  private outputTimeMs = 0;
  private totalTimeMs: number | null = null;
  private estimatedTotalTimeMs: number | null;

  constructor(estimatedTotalTimeMs: number | null = null) {
    this.estimatedTotalTimeMs = estimatedTotalTimeMs ?? null;
  }

  snapshot(): JobProgressSnapshot {
    return {
      ratio: this.computeRatio(),
      outputTimeMs: this.outputTimeMs,
      totalTimeMs: this.totalTimeMs,
      estimatedTotalTimeMs: this.estimatedTotalTimeMs
    };
  }

  updateOutputTime(milliseconds: number): JobProgressSnapshot {
    this.outputTimeMs = clampToNonNegative(milliseconds);
    return this.snapshot();
  }

  setTotalTime(milliseconds: number | null): JobProgressSnapshot {
    this.totalTimeMs = milliseconds === null ? null : clampToNonNegative(milliseconds);
    if (this.totalTimeMs !== null) {
      this.estimatedTotalTimeMs = null;
    }
    return this.snapshot();
  }

  setEstimatedTotalTime(milliseconds: number | null): JobProgressSnapshot {
    if (this.totalTimeMs !== null) {
      return this.snapshot();
    }
    this.estimatedTotalTimeMs = milliseconds === null ? null : clampToNonNegative(milliseconds);
    return this.snapshot();
  }

  private computeRatio(): number {
    const denominator = this.totalTimeMs ?? this.estimatedTotalTimeMs;
    if (!denominator || denominator <= 0) {
      return 0;
    }
    const raw = this.outputTimeMs / denominator;
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.max(0, Math.min(1, raw));
  }
}
