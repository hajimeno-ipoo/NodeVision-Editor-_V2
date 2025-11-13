import type { NodeVisionSettings } from '@nodevision/settings';
import type { FFmpegDetectionResult } from '@nodevision/system-check';
import type { TokenRecord } from '@nodevision/tokens';

export interface BootStatus {
  settings: NodeVisionSettings;
  ffmpeg: FFmpegDetectionResult;
  token: TokenRecord;
}
