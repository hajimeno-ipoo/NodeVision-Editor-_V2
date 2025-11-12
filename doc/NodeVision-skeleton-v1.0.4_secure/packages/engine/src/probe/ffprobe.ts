import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export type ProbeMeta = {
  path: string;
  w: number; h: number;
  fps: number;
  fps_rational: { num: number; den: number };
  pix_fmt: string;
  sar: { num: number; den: number };
  duration_ms: number;
  vcodec?: string;
};

function parseRational(s: string): { num: number; den: number } {
  if (!s || s === '0/0') return { num: 0, den: 1 };
  const [n, d] = s.split('/').map(x => parseInt(x, 10));
  return { num: n || 0, den: d || 1 };
}

function rationalToFloat(r: { num: number; den: number }): number {
  return r.den ? r.num / r.den : 0;
}

export function isLocalPath(p: string): boolean {
  try {
    const real = fs.realpathSync(p);
    if (process.platform === 'win32') {
      // UNC or network drive guard (basic heuristic)
      if (real.startsWith('\\\\')) return false;
    }
    // For *nix, consider everything under root as local (caller should mount policy)
    return true;
  } catch { return false; }
}

export function ffprobeOne(p: string): Promise<ProbeMeta> {
  return new Promise((resolve, reject) => {
    const args = [
      '-v','error',
      '-select_streams','v:0',
      '-show_entries','stream=width,height,avg_frame_rate,pix_fmt,sample_aspect_ratio,codec_name',
      '-show_entries','format=duration',
      '-of','json', p
    ];
    const child = execFile('ffprobe', args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject({ code: 'E1004', message: 'MediaProbeFailed', meta: { stderr_head: String(stderr).slice(0,200) } });
      try {
        const j = JSON.parse(String(stdout));
        const st = (j.streams && j.streams[0]) || {};
        const fr = parseRational(st.avg_frame_rate || '0/1');
        const sar = parseRational(st.sample_aspect_ratio || '1/1');
        const duration_ms = Math.max(0, Math.round(parseFloat(j.format?.duration || '0') * 1000));
        resolve({
          path: p,
          w: st.width || 0,
          h: st.height || 0,
          fps: rationalToFloat(fr),
          fps_rational: fr,
          pix_fmt: st.pix_fmt || 'unknown',
          sar,
          duration_ms,
          vcodec: st.codec_name || undefined
        });
      } catch { return reject({ code: 'E1004', message: 'MediaProbeFailed', meta: { parse: true } }); }
    });
    child.on('error', () => reject({ code: 'E1001', message: 'FfmpegNotFound' }));
  });
}

export async function ffprobeMany(paths: string[]): Promise<ProbeMeta[]> {
  const out: ProbeMeta[] = [];
  for (const p of paths) {
    out.push(await ffprobeOne(p));
  }
  return out;
}
