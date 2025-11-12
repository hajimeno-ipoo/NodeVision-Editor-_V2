import http from 'http';
import { inspectConcat } from '../../packages/engine/src/inspect/concat';

const PORT = parseInt(process.env.NV_HTTP_PORT || '17865', 10);
const ENABLED = process.env.NV_HTTP === '1';
const TOKEN = process.env.NV_HTTP_TOKEN || '';
let active = 0;
const MAX_ACTIVE = 2;

function isLocal(addr?: string) {
  return !!addr && (addr === '127.0.0.1' || addr === '::1' || addr.startsWith('::ffff:127.0.0.1'));
}

export function maybeStartHttpServer() {
  if (!ENABLED) return null;
  const server = http.createServer(async (req, res) => {
    try {
      if (!isLocal(req.socket.remoteAddress)) { res.writeHead(403); res.end('Forbidden'); return; }
      if (req.method === 'POST' && req.url === '/api/inspect/concat') {
        if (!TOKEN) { res.writeHead(401); res.end('Unauthorized'); return; }
        const hdr = req.headers['x-nodevision-token'];
        if (hdr !== TOKEN) { res.writeHead(403); res.end('Forbidden'); return; }
        if (active >= MAX_ACTIVE) { res.writeHead(429); res.end('Too Many Requests'); return; }
        let body = ''; let tooBig = false; let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; try { (req.socket as any).destroy(); } catch {} }, 1000);
        req.on('data', (chunk) => { body += chunk; if (body.length > 128 * 1024) { tooBig = true; req.destroy(); } });
        req.on('end', async () => {
          clearTimeout(timer);
          if (tooBig) { res.writeHead(413); res.end('Payload Too Large'); return; }
          try {
            const json = JSON.parse(body);
            active++;
            const out = await inspectConcat(json);
            const status = out.ok ? 200 : (out.error?.code?.startsWith('E2') ? 200 : 422);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out));
          } catch {
            if (timedOut) { res.writeHead(408); res.end('Request Timeout'); }
            else { res.writeHead(400); res.end('Bad Request'); }
          } finally {
            active = Math.max(0, active - 1);
          }
        });
      } else { res.writeHead(404); res.end('Not Found'); }
    } catch { res.writeHead(500); res.end('Internal Error'); }
  });
  server.listen(PORT, '127.0.0.1');
  return server;
}
