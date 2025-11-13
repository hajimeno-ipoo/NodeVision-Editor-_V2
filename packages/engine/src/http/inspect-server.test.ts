import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createInspectHttpServer,
  buildHttpErrorBody,
  firstHeaderValue,
  isLoopbackAddress,
  mapInspectErrorToStatus,
  parseInspectPayload,
  shouldSkipEnd,
  type InspectHttpServerOptions,
  type TokenValidationSummary
} from './inspect-server';
import type { InspectConcatResponse } from '../inspect/types';

const validSummary: TokenValidationSummary = {
  label: 'default',
  status: 'valid',
  expiresAt: new Date(Date.now() + 60_000).toISOString()
};

const startServer = async (overrides: Partial<InspectHttpServerOptions> = {}) => {
  const validateToken = overrides.validateToken ?? vi.fn().mockResolvedValue(validSummary);
  const handleInspect = overrides.handleInspect ??
    vi.fn<[], Promise<InspectConcatResponse>>().mockResolvedValue({
      ok: true,
      canConcat: true,
      equality: { resolution: true, fps: true, pix_fmt: true },
      details: [],
      error: null,
      version: '1.0'
    });

  const server = createInspectHttpServer({
    enabled: true,
    port: 0,
    validateToken,
    handleInspect,
    ...overrides
  } as InspectHttpServerOptions);

  if (!server) {
    throw new Error('server should not be null');
  }

  await new Promise<void>(resolve => server.once('listening', resolve));
  const addressInfo = server.address();
  if (addressInfo && typeof addressInfo === 'object') {
    return { server, port: addressInfo.port, validateToken, handleInspect };
  }
  throw new Error('failed to determine port');
};

const closeServer = async (server: http.Server | null) => {
  if (!server) {
    return;
  }
  await new Promise<void>(resolve => server.close(() => resolve()));
};

const postJson = async (port: number, body: unknown, token = 'abc') => {
  const response = await fetch(`http://127.0.0.1:${port}/api/inspect/concat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-NodeVision-Token': token
    },
    body: JSON.stringify(body)
  });
  return response;
};

describe('helper utilities', () => {
  it('detects loopback addresses', () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('maps inspect error codes to HTTP statuses', () => {
    expect(mapInspectErrorToStatus()).toBe(500);
    expect(mapInspectErrorToStatus('E2002')).toBe(400);
    expect(mapInspectErrorToStatus('E2006')).toBe(400);
    expect(mapInspectErrorToStatus('E1002')).toBe(404);
    expect(mapInspectErrorToStatus('E1003')).toBe(403);
    expect(mapInspectErrorToStatus('E1004')).toBe(422);
    expect(mapInspectErrorToStatus('E1005')).toBe(415);
    expect(mapInspectErrorToStatus('E1001')).toBe(500);
    expect(mapInspectErrorToStatus('OTHER')).toBe(422);
  });

  it('builds http error bodies with fallback messages', () => {
    const body = buildHttpErrorBody('E0000', '1.0.0');
    expect(body.error?.message).toContain('リクエスト');
  });

  it('extracts the first header value and detects termination flags', () => {
    expect(firstHeaderValue(['one', 'two'])).toBe('one');
    expect(firstHeaderValue('solo')).toBe('solo');
    expect(shouldSkipEnd(true)).toBe(true);
    expect(shouldSkipEnd(false)).toBe(false);
    expect(parseInspectPayload('{"clips":[]}')).toMatchObject({ clips: [] });
    expect(parseInspectPayload('')).toMatchObject({});
  });
});

describe('createInspectHttpServer', () => {
  let activeServer: http.Server | null = null;

  afterEach(async () => {
    await closeServer(activeServer);
    activeServer = null;
    vi.clearAllMocks();
  });

  it('returns null when disabled', () => {
    const server = createInspectHttpServer({
      enabled: false,
      port: 0,
      validateToken: async () => validSummary,
      handleInspect: async () => ({
        ok: true,
        canConcat: true,
        equality: { resolution: true, fps: true, pix_fmt: true },
        details: [],
        error: null,
        version: '1.0'
      })
    });
    expect(server).toBeNull();
  });

  it('rejects non-local addresses', async () => {
    const { server, port } = await startServer({
      isLocalAddress: () => false
    });
    activeServer = server;

    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(403);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E4004');
  });

  it('rejects missing token headers', async () => {
    const { server, port } = await startServer();
    activeServer = server;
    const response = await fetch(`http://127.0.0.1:${port}/api/inspect/concat`, { method: 'POST' });
    expect(response.status).toBe(401);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E4000');
  });

  it('returns 404 when path is not recognized', async () => {
    const { server, port } = await startServer();
    activeServer = server;
    const response = await fetch(`http://127.0.0.1:${port}/api/inspect/unknown`, {
      method: 'POST',
      headers: { 'X-NodeVision-Token': 'abc' }
    });
    expect(response.status).toBe(404);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E4040');
  });

  it('invokes the onRequest hook for every request', async () => {
    const onRequest = vi.fn();
    const { server, port } = await startServer({ onRequest });
    activeServer = server;
    await postJson(port, { clips: [] });
    expect(onRequest).toHaveBeenCalled();
  });

  it('returns 500 when the inspect handler throws', async () => {
    const handleInspect = vi.fn().mockRejectedValue(new Error('boom'));
    const { server, port } = await startServer({ handleInspect });
    activeServer = server;
    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(500);
  });

  it('records request metadata when history storage is provided', async () => {
    const record = vi.fn();
    const { server, port } = await startServer({
      requestHistory: {
        record,
        entries: () => []
      }
    });
    activeServer = server;

    await postJson(port, { clips: [{ path: '/tmp/a.mp4' }, { path: '/tmp/b.mp4' }], options: { include: ['duration'] }, version: '1.0.7' });
    const successLog = record.mock.calls.at(-1)?.[0];
    expect(successLog?.statusCode).toBe(200);
    expect(successLog?.logLevel).toBe('info');
    expect(successLog?.requestBytes).toBeGreaterThan(0);
    expect(successLog?.responseCode).toBe('OK');
    expect(successLog?.tokenLabel).toBe('default');
    expect(successLog?.clipCount).toBe(2);
    expect(successLog?.includeOptions).toEqual(['duration']);
    expect(successLog?.payloadVersion).toBe('1.0.7');
    expect(successLog?.remoteAddress).toBe('127.0.0.1');

    await fetch(`http://127.0.0.1:${port}/api/inspect/concat`, { method: 'POST' });
    const errorLog = record.mock.calls.at(-1)?.[0];
    expect(errorLog?.statusCode).toBe(401);
    expect(errorLog?.logLevel).toBe('warn');
    expect(errorLog?.requestBytes).toBe(0);
    expect(errorLog?.responseCode).toBe('E4000');
    expect(errorLog?.clipCount).toBeNull();
    expect(errorLog?.includeOptions).toBeNull();
  });

  it('accepts repeated token headers', async () => {
    const { server, port } = await startServer();
    activeServer = server;

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          method: 'POST',
          host: '127.0.0.1',
          port,
          path: '/api/inspect/concat',
          headers: {
            'Content-Type': 'application/json',
            'X-NodeVision-Token': ['abc', 'abc']
          }
        },
        res => {
          if (res.statusCode !== 200) {
            reject(new Error(`unexpected status ${res.statusCode}`));
            return;
          }
          res.resume();
          res.on('end', () => resolve());
        }
      );
      req.on('error', reject);
      req.write('{"clips":[]}');
      req.end();
    });
  });

  it('rejects invalid tokens', async () => {
    const validateToken = vi.fn().mockResolvedValue(null);
    const { server, port } = await startServer({ validateToken });
    activeServer = server;
    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(403);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E4003');
    expect(validateToken).toHaveBeenCalled();
  });

  it('rejects expired tokens', async () => {
    const validateToken = vi.fn().mockResolvedValue({ ...validSummary, status: 'expired' as const });
    const { server, port } = await startServer({ validateToken });
    activeServer = server;
    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(401);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E4001');
  });

  it('maps inspect errors to HTTP 200 for E2001', async () => {
    const handleInspect = vi.fn().mockResolvedValue({
      ok: false,
      canConcat: false,
      equality: { resolution: false, fps: false, pix_fmt: false },
      details: [],
      error: { code: 'E2001', message: 'mismatch', meta: null },
      version: '1.0'
    } satisfies InspectConcatResponse);
    const { server, port } = await startServer({ handleInspect });
    activeServer = server;
    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(200);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E2001');
  });

  it('enforces concurrency limit', async () => {
    let release!: () => void;
    const blocker = new Promise<InspectConcatResponse>(resolve => {
      release = () =>
        resolve({
          ok: true,
          canConcat: true,
          equality: { resolution: true, fps: true, pix_fmt: true },
          details: [],
          error: null,
          version: '1.0'
        });
    });
    const handleInspect = vi.fn().mockReturnValueOnce(blocker).mockResolvedValueOnce({
      ok: true,
      canConcat: true,
      equality: { resolution: true, fps: true, pix_fmt: true },
      details: [],
      error: null,
      version: '1.0'
    });
    const { server, port } = await startServer({ handleInspect, maxConcurrent: 1 });
    activeServer = server;

    const first = postJson(port, { clips: [] });
    await new Promise(resolve => setTimeout(resolve, 10));
    const second = postJson(port, { clips: [] });

    const secondResponse = await second;
    expect(secondResponse.status).toBe(429);
    const body = (await secondResponse.json()) as InspectConcatResponse;
    expect(body.error?.code).toBe('E4290');

    release();
    const firstResponse = await first;
    expect(firstResponse.status).toBe(200);
  });

  it('rejects payloads exceeding the configured limit', async () => {
    const { server, port } = await startServer({ maxPayloadBytes: 32 });
    activeServer = server;
    const response = await fetch(`http://127.0.0.1:${port}/api/inspect/concat`, {
      method: 'POST',
      headers: {
        'X-NodeVision-Token': 'abc',
        'Content-Type': 'application/json'
      },
      body: 'x'.repeat(64)
    });
    expect(response.status).toBe(413);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E4130');
  });

  it('returns 400 for invalid JSON', async () => {
    const { server, port } = await startServer();
    activeServer = server;
    const response = await fetch(`http://127.0.0.1:${port}/api/inspect/concat`, {
      method: 'POST',
      headers: {
        'X-NodeVision-Token': 'abc',
        'Content-Type': 'application/json'
      },
      body: '{"oops":'
    });
    expect(response.status).toBe(400);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E4150');
  });

  it('times out stalled requests', async () => {
    const { server, port } = await startServer({ requestTimeoutMs: 30 });
    activeServer = server;

    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          method: 'POST',
          host: '127.0.0.1',
          port,
          path: '/api/inspect/concat',
          headers: {
            'X-NodeVision-Token': 'abc',
            'Content-Type': 'application/json'
          }
        },
          res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => {
              data += chunk;
            });
            res.on('end', () => {
              req.destroy();
              try {
                const json = JSON.parse(data) as InspectConcatResponse;
                expect(res.statusCode).toBe(408);
                expect(json.error?.code).toBe('E4080');
                resolve();
            } catch (error) {
              reject(error);
            }
          });
        }
      );

      req.on('error', reject);
      req.write('{"clips":');
      // intentionally never end the request to trigger timeout
    });
  });

  it('logs info when server boots', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const { server } = await startServer({ logger });
    activeServer = server;
    expect(logger.info).toHaveBeenCalled();
  });

  it('returns 500 when validateToken throws synchronously', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const validateToken = vi.fn(() => {
      throw new Error('boom');
    });
    const { server, port } = await startServer({ validateToken, logger });
    activeServer = server;
    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns 500 when validateToken promise rejects', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const validateToken = vi.fn().mockRejectedValue(new Error('fail'));
    const { server, port } = await startServer({ validateToken, logger });
    activeServer = server;
    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns 500 when handleInspect rejects', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const handleInspect = vi.fn().mockRejectedValue(new Error('fail'));
    const { server, port } = await startServer({ handleInspect, logger });
    activeServer = server;
    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles request stream errors gracefully', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const validateToken = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return validSummary;
    });
    const handleInspect = vi.fn().mockReturnValue(new Promise<InspectConcatResponse>(() => {}));
    const { server, port } = await startServer({
      logger,
      validateToken,
      handleInspect,
      onRequest: req => {
        setTimeout(() => {
          req.emit('error', new Error('boom'));
        }, 10);
      }
    });
    activeServer = server;

    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(500);
    const json = (await response.json()) as InspectConcatResponse;
    expect(json.error?.code).toBe('E5000');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('ignores trailing events after termination', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const handleInspect = vi.fn().mockReturnValue(new Promise<InspectConcatResponse>(() => {}));
    const { server, port } = await startServer({
      logger,
      handleInspect,
      onRequest: req => {
        setTimeout(() => {
          req.emit('error', new Error('late-error'));
          req.emit('data', 'ignored');
          req.emit('end');
        }, 5);
      }
    });
    activeServer = server;

    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(500);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('ignores stream errors after the response is sent', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const { server, port } = await startServer({
      logger,
      onRequest: (req, res) => {
        res.on('finish', () => {
          req.emit('error', new Error('late-error'));
        });
      }
    });
    activeServer = server;

    const response = await postJson(port, { clips: [] });
    expect(response.status).toBe(200);
  });
});
