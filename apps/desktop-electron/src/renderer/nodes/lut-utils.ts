// Renderer側では nodeRequire で組み込みモジュールを取得する（存在しない場合もあるのでガード）
const nodeRequire = (window as any).nodeRequire as NodeRequire | undefined;
const path = nodeRequire ? (nodeRequire('path') as typeof import('path')) : null;

// color-grading を直接参照（ワーカーフォールバック用）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const colorGrading: any = nodeRequire ? nodeRequire('@nodevision/color-grading') : (window as any).nodeRequire?.('@nodevision/color-grading');
const { generateLUT3D, buildColorTransform, buildLegacyColorCorrectionTransform } = colorGrading ?? {};

// worker_threads が使えない環境（rendererでV8が非対応など）のフォールバック
let WorkerCtor: any = null;
if (nodeRequire) {
  try {
    const wt = nodeRequire('worker_threads');
    WorkerCtor = wt?.Worker ?? null;
  } catch {
    WorkerCtor = null;
  }
}
import type { LUT3D } from '@nodevision/color-grading';

// 共通: LUT解像度を 17〜129 にクランプ
export const clampLutRes = (value: number): number => {
  if (!Number.isFinite(value)) return 33;
  return Math.min(129, Math.max(17, Math.round(value)));
};

export const resolvePreviewLutRes = (value?: number): number => clampLutRes(value ?? 33);
export const resolveExportLutRes = (value?: number): number => clampLutRes(value ?? 65);

// --- Worker 管理 ---
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

let worker: any = null;
let requestSeq = 0;
const pending = new Map<number, { resolve: (lut: LUT3D) => void; reject: (err: Error) => void; key: string }>();
const latestByKey = new Map<string, number>();

const getWorker = (): any | null => {
  if (!WorkerCtor) {
    return null;
  }
  if (worker) return worker;
  if (!path) return null;
  const workerPath = path.join(__dirname, 'lut-worker.js');
  try {
    worker = new WorkerCtor(workerPath);
  } catch (err) {
    console.warn('[LUT] Worker not supported, falling back to sync:', err);
    WorkerCtor = null;
    worker = null;
    return null;
  }
  worker.on('message', (msg: LutResponse) => {
    const record = pending.get((msg as any).requestId);
    if (!record) return;
    const { key } = record;
    // 世代が古ければスキップ
    const latest = latestByKey.get(key);
    if (latest !== undefined && latest !== (msg as any).requestId) {
      pending.delete((msg as any).requestId);
      return;
    }
    if ('error' in msg) {
      record.reject(new Error(msg.error));
    } else {
      const lut: LUT3D = { resolution: msg.resolution, data: new Float32Array(msg.data) };
      record.resolve(lut);
    }
    pending.delete((msg as any).requestId);
  });
  worker.on('error', (err: any) => {
    pending.forEach(({ reject }) => reject(err));
    pending.clear();
    latestByKey.clear();
    console.warn('[LUT] Worker error, disabling worker usage:', err);
    WorkerCtor = null;
    worker = null;
  });
  return worker;
};

export const requestLut = async (
  key: string,
  payload: unknown,
  resolution: number,
  mode: 'pipeline' | 'legacyColor' = 'pipeline'
): Promise<LUT3D> => {
  // Workerが使えない場合は同期フォールバック
  const maybeWorker = getWorker();
  if (!maybeWorker) {
    const transform =
      mode === 'legacyColor'
        ? buildLegacyColorCorrectionTransform(payload)
        : buildColorTransform(payload);
    return generateLUT3D(resolution, transform);
  }

  const reqId = ++requestSeq;
  latestByKey.set(key, reqId);
  return new Promise<LUT3D>((resolve, reject) => {
    pending.set(reqId, { resolve, reject, key });
    const msg: LutRequest = { key, requestId: reqId, resolution, payload, mode };
    maybeWorker.postMessage(msg);
  });
};

// HQ生成をデバウンス＋アイドルタイミングで実行（Worker版）
const pendingTimers = new Map<string, number>();

export function scheduleHighResLUTViaWorker(
  key: string,
  delayMs: number,
  payloadBuilder: () => unknown,
  resolution: number,
  applyLut: (lut: LUT3D) => void,
  mode: 'pipeline' | 'legacyColor' = 'pipeline',
  onStart?: () => void,
  onError?: (err: unknown) => void
): void {
  const existing = pendingTimers.get(key);
  if (existing) window.clearTimeout(existing);

  const timer = window.setTimeout(() => {
    pendingTimers.delete(key);
    const runner = async () => {
      try {
        onStart?.();
        const lut = await requestLut(key, payloadBuilder(), resolution, mode);
        applyLut(lut);
      } catch (err) {
        console.warn('[LUT] High-res generation skipped:', err);
        onError?.(err);
      }
    };

    if ('requestIdleCallback' in window) {
      // @ts-ignore
      (window as any).requestIdleCallback(runner, { timeout: 500 });
    } else {
      runner();
    }
  }, delayMs);

  pendingTimers.set(key, timer);
}
