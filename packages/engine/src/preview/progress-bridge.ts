import type { JobProgressSnapshot, JobProgressSnapshotProvider } from '../types';

export interface PreviewProgressOptions {
  fps: number;
  toleranceFrames?: number;
  estimatedTotalFrames?: number | null;
}

const clampFrameIndex = (index: number): number => {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('frameIndex must be a non-negative integer');
  }
  return index;
};

const validateFps = (fps: number): number => {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('PreviewProgressBridge requires fps > 0');
  }
  return fps;
};

export class PreviewProgressBridge {
  private readonly frameDurationMs: number;
  private readonly toleranceMs: number;
  private lastPreviewTimeMs = 0;
  private lastEncoderTimeMs = 0;

  constructor(
    private readonly progress: JobProgressSnapshotProvider,
    private readonly options: PreviewProgressOptions
  ) {
    const fps = validateFps(options.fps);
    this.frameDurationMs = 1000 / fps;
    const toleranceFrames = options.toleranceFrames ?? 1;
    this.toleranceMs = Math.max(0, toleranceFrames) * this.frameDurationMs;

    if (options.estimatedTotalFrames && options.estimatedTotalFrames > 0) {
      const totalMs = options.estimatedTotalFrames * this.frameDurationMs;
      this.progress.setTotalTime(totalMs);
    }
  }

  recordEncoderTime(outputTimeMs: number): JobProgressSnapshot {
    this.lastEncoderTimeMs = Math.max(0, outputTimeMs);
    return this.progress.updateOutputTime(this.lastEncoderTimeMs);
  }

  recordPreviewFrame(frameIndex: number): JobProgressSnapshot {
    const index = clampFrameIndex(frameIndex);
    this.lastPreviewTimeMs = (index + 1) * this.frameDurationMs;
    const snapshot = this.progress.snapshot();
    const delta = Math.abs(this.lastPreviewTimeMs - snapshot.outputTimeMs);
    if (delta > this.toleranceMs) {
      return this.progress.updateOutputTime(this.lastPreviewTimeMs);
    }
    return snapshot;
  }

  isInSync(): boolean {
    const snapshot = this.progress.snapshot();
    const reference = Math.max(this.lastPreviewTimeMs, this.lastEncoderTimeMs);
    return Math.abs(reference - snapshot.outputTimeMs) <= this.toleranceMs;
  }
}
