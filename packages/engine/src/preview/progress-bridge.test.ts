import { describe, expect, it } from 'vitest';

import { JobProgressTracker } from '../job-progress';
import { PreviewProgressBridge } from './progress-bridge';

describe('PreviewProgressBridge', () => {
  it('rejects invalid fps', () => {
    const tracker = new JobProgressTracker();
    expect(() => new PreviewProgressBridge(tracker, { fps: 0 })).toThrow('fps');
  });

  it('rejects negative frame indices', () => {
    const tracker = new JobProgressTracker();
    const bridge = new PreviewProgressBridge(tracker, { fps: 30 });
    expect(() => bridge.recordPreviewFrame(-1)).toThrow('frameIndex');
  });

  it('keeps encoder progress aligned within one frame', () => {
    const tracker = new JobProgressTracker();
    const bridge = new PreviewProgressBridge(tracker, { fps: 24, toleranceFrames: 1 });

    const encoderSnapshot = bridge.recordEncoderTime(250);
    expect(Math.round(encoderSnapshot.outputTimeMs)).toBe(250);

    const previewSnapshot = bridge.recordPreviewFrame(5);
    // frame 5 => (5 + 1) / 24 seconds ≈ 250ms
    expect(Math.round(previewSnapshot.outputTimeMs)).toBe(250);
    expect(bridge.isInSync()).toBe(true);
  });

  it('nudges progress when preview drifts by more than one frame', () => {
    const tracker = new JobProgressTracker();
    const bridge = new PreviewProgressBridge(tracker, {
      fps: 30,
      toleranceFrames: 1,
      estimatedTotalFrames: 60
    });

    bridge.recordEncoderTime(16);
    const snapshot = bridge.recordPreviewFrame(10); // frameIndex 10 -> ~366ms
    expect(Math.round(snapshot.outputTimeMs)).toBe(367);
    expect(bridge.isInSync()).toBe(true);
  });
});
