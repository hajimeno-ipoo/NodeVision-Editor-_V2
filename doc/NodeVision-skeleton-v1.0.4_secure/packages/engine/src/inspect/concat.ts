import type { InspectConcatRequest, InspectConcatResponse } from '../../shared/src/inspect.types';
import { ffprobeMany, isLocalPath } from '../probe/ffprobe';
import * as path from 'path';

function allowedExt(p: string): boolean {
  return /\.(mp4|mov|m4v|mkv)$/i.test(p);
}

export async function inspectConcat(req: InspectConcatRequest): Promise<InspectConcatResponse> {
  const clips = req.clips || [];
  if (clips.length < 2) {
    return { ok: false, canConcat: false, equality: null, details: null, error: { code:'E2002', message:'クリップ数が不足しています。' }, version:'1.0' };
  }
  if (clips.length > 32) {
    return { ok: false, canConcat: false, equality: null, details: null, error: { code:'E2006', message:'クリップ数が多すぎます。' }, version:'1.0' };
  }
  for (const c of clips) {
    const p = path.normalize(c.path || '');
    if (!allowedExt(p)) return { ok:false, canConcat:false, equality:null, details:null, error:{ code:'E1005', message:'非対応コンテナです。', meta:{ path:p } }, version:'1.0' };
    if (!isLocalPath(p)) return { ok:false, canConcat:false, equality:null, details:null, error:{ code:'E1002', message:'ローカルパスではありません。', meta:{ path:p } }, version:'1.0' };
  }
  try {
    const metas = await ffprobeMany(clips.map(c=>c.path));
    const tol = req.options?.fpsTolerance ?? 0.01;
    const resEq = metas.every(m => m.w===metas[0].w && m.h===metas[0].h);
    const fpsEq = metas.every(m => Math.abs(m.fps - metas[0].fps) <= tol);
    const pixEq = metas.every(m => m.pix_fmt === metas[0].pix_fmt);
    const equality = { resolution: resEq, fps: fpsEq, pix_fmt: pixEq };
    const canConcat = resEq && fpsEq && pixEq;
    return { ok:true, canConcat, equality, details: metas, error: canConcat ? null : { code:'E2001', message:'解像度・fps・pix_fmt を一致させてください。' }, version:'1.0' };
  } catch (e: any) {
    const code = e?.code || 'E1004';
    const message = e?.message || 'MediaProbeFailed';
    const meta = e?.meta;
    return { ok:false, canConcat:false, equality:null, details:null, error:{ code, message, meta }, version:'1.0' };
  }
}
