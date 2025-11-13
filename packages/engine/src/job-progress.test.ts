import { describe, expect, it } from 'vitest';

import { JobProgressTracker } from './job-progress';

describe('JobProgressTracker', () => {
  it('computes ratio using actual total time when available', () => {
    const tracker = new JobProgressTracker();
    tracker.setTotalTime(10_000);
    tracker.updateOutputTime(2_000);

    const snapshot = tracker.snapshot();
    expect(snapshot.ratio).toBeCloseTo(0.2, 3);
    expect(snapshot.totalTimeMs).toBe(10_000);
  });

  it('falls back to estimated total time and recalculates once actual total is known', () => {
    const tracker = new JobProgressTracker(5_000);
    tracker.updateOutputTime(2_500);

    let snapshot = tracker.snapshot();
    expect(snapshot.ratio).toBeCloseTo(0.5, 3);
    expect(snapshot.estimatedTotalTimeMs).toBe(5_000);

    tracker.setEstimatedTotalTime(8_000);
    snapshot = tracker.snapshot();
    expect(snapshot.ratio).toBeCloseTo(0.3125, 3);

    tracker.setTotalTime(10_000);
    snapshot = tracker.snapshot();
    expect(snapshot.ratio).toBeCloseTo(0.25, 3);
    expect(snapshot.estimatedTotalTimeMs).toBeNull();
  });

  it('clamps the ratio to 1 when output exceeds total time', () => {
    const tracker = new JobProgressTracker();
    tracker.setTotalTime(1_000);
    tracker.updateOutputTime(2_500);

    expect(tracker.snapshot().ratio).toBe(1);
  });

  it('ignores estimated total updates once the actual total is known and clamps negatives', () => {
    const tracker = new JobProgressTracker();
    tracker.updateOutputTime(-500);
    expect(tracker.snapshot().outputTimeMs).toBe(0);

    tracker.setEstimatedTotalTime(2_000);
    tracker.setTotalTime(4_000);
    tracker.setEstimatedTotalTime(10_000);
    expect(tracker.snapshot().totalTimeMs).toBe(4_000);
    expect(tracker.snapshot().estimatedTotalTimeMs).toBeNull();

    tracker.setTotalTime(null);
    expect(tracker.snapshot().totalTimeMs).toBeNull();
    tracker.setEstimatedTotalTime(null);
    expect(tracker.snapshot().estimatedTotalTimeMs).toBeNull();
  });

  it('returns zero ratio when files disappear or ratios become non-finite', () => {
    const tracker = new JobProgressTracker();
    expect(tracker.snapshot().ratio).toBe(0);

    tracker.setEstimatedTotalTime(1);
    (tracker as unknown as { outputTimeMs: number }).outputTimeMs = Number.POSITIVE_INFINITY;
    expect(tracker.snapshot().ratio).toBe(0);
  });
});
