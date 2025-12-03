import { parentPort } from 'worker_threads';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const colorGrading = (global as any).nodeRequire
  ? (global as any).nodeRequire('@nodevision/color-grading')
  : require('@nodevision/color-grading');

const { buildColorTransform, buildLegacyColorCorrectionTransform, generateLUT3D } = colorGrading;

type LutRequest = {
  key: string;
  requestId: number;
  resolution: number;
  payload: unknown;
  mode?: 'pipeline' | 'legacyColor';
};

type LutResponse =
  | { key: string; requestId: number; resolution: number; data: ArrayBuffer }
  | { key: string; requestId: number; error: string };

if (!parentPort) {
  throw new Error('lut-worker must be started as worker thread');
}

parentPort.on('message', (msg: LutRequest) => {
  const { key, requestId, resolution, payload, mode } = msg;
  try {
    const transform =
      mode === 'legacyColor'
        ? buildLegacyColorCorrectionTransform(payload)
        : buildColorTransform(payload);
    const lut = generateLUT3D(resolution, transform);
    const data = lut.data.buffer;
    parentPort?.postMessage({ key, requestId, resolution: lut.resolution, data } as LutResponse, [data]);
  } catch (error) {
    parentPort?.postMessage({
      key,
      requestId,
      error: error instanceof Error ? error.message : String(error)
    } as LutResponse);
  }
});
