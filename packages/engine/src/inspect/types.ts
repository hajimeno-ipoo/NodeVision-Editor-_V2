export interface InspectClipRequest {
  path: string;
}

export type InspectInclude = 'duration' | 'bitrate' | 'vcodec' | 'sar' | 'fps_rational' | 'pix_fmt';

export interface InspectConcatRequest {
  clips: InspectClipRequest[];
  options?: {
    fpsTolerance?: number;
    include?: InspectInclude[];
  };
  version?: string;
}

export interface InspectEquality {
  resolution: boolean;
  fps: boolean;
  pix_fmt: boolean;
}

export interface InspectRatio {
  num: number;
  den: number;
}

export interface InspectClipDetails {
  path: string;
  w: number;
  h: number;
  fps: number;
  pix_fmt: string;
  fps_rational?: InspectRatio;
  sar?: InspectRatio;
  duration_ms?: number;
  bitrate_bps?: number;
  vcodec?: string | null;
}

export interface InspectError {
  code: string;
  message: string;
  meta?: Record<string, unknown> | null;
}

export interface InspectConcatResponse {
  ok: boolean;
  canConcat: boolean;
  equality: InspectEquality | null;
  details: InspectClipDetails[] | null;
  error: InspectError | null;
  version: string;
}

export interface InspectConcatOptions {
  ffprobePath: string;
  minClips?: number;
  maxClips?: number;
  allowedExtensions?: string[];
  probeTimeoutMs?: number;
  fs?: typeof import('node:fs/promises');
}
