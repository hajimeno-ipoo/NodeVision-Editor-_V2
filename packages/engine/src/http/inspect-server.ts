import { randomUUID } from 'node:crypto';
import http from 'node:http';

import type { InspectConcatRequest, InspectConcatResponse } from '../inspect/types';
import type { InspectRequestHistoryStore, LogLevel } from '../types';

type TokenStatus = 'valid' | 'grace' | 'expired';

export interface TokenValidationSummary {
  label: string;
  status: TokenStatus;
  expiresAt: string;
  graceExpiresAt?: string;
}

export interface InspectHttpServerOptions {
  enabled: boolean;
  port: number;
  host?: string;
  maxConcurrent?: number;
  maxPayloadBytes?: number;
  requestTimeoutMs?: number;
  tokenHeader?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  validateToken: (tokenValue: string) => Promise<TokenValidationSummary | null>;
  handleInspect: (payload: InspectConcatRequest) => Promise<InspectConcatResponse>;
  isLocalAddress?: (address?: string | null) => boolean;
  onRequest?: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  requestHistory?: InspectRequestHistoryStore;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_PAYLOAD = 128 * 1024; // 128 KiB
const DEFAULT_TIMEOUT_MS = 1000;
const DEFAULT_VERSION = '1.0';

const isLocal = (address?: string | null): boolean => {
  if (!address) {
    return false;
  }
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
};

const errorMessages: Record<string, string> = {
  E4000: 'X-NodeVision-Token ヘッダーが必要です。',
  E4001: 'トークンの有効期限が切れています。',
  E4003: '提供されたトークンが無効です。',
  E4004: 'ローカルホスト以外からのアクセスは禁止されています。',
  E4080: 'リクエストがタイムアウトしました。',
  E4130: 'ペイロードが大きすぎます (128KB 超)。',
  E4150: 'JSONの解析に失敗しました。',
  E4290: '同時実行上限を超えました。',
  E5000: '内部エラーが発生しました。',
  E4040: 'エンドポイントが見つかりません。'
};

const mapInspectErrorToStatus = (code?: string | null): number => {
  if (!code) {
    return 500;
  }
  switch (code) {
    case 'E2001':
      return 200;
    case 'E2002':
    case 'E2006':
      return 400;
    case 'E1002':
      return 404;
    case 'E1003':
      return 403;
    case 'E1004':
      return 422;
    case 'E1005':
      return 415;
    case 'E1001':
      return 500;
    default:
      return 422;
  }
};

const firstHeaderValue = (value?: string | string[]): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const shouldSkipEnd = (terminated: boolean): boolean => terminated;

const parseInspectPayload = (rawBody: string): InspectConcatRequest =>
  JSON.parse(rawBody || '{}') as InspectConcatRequest;

const buildErrorBody = (
  code: string,
  version: string,
  meta?: Record<string, unknown> | null
): InspectConcatResponse => ({
  ok: false,
  canConcat: false,
  equality: null,
  details: null,
  error: {
    code,
    message: errorMessages[code] ?? 'リクエストに失敗しました。',
    meta: meta ?? null
  },
  version
});

const writeJson = (res: http.ServerResponse, statusCode: number, body: InspectConcatResponse): void => {
  if (res.headersSent) {
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
};

/* c8 ignore start */
const normalizeTokenLabel = (label: string | null | undefined): string | null => label ?? null;
/* c8 ignore end */

export const createInspectHttpServer = (options: InspectHttpServerOptions): http.Server | null => {
  if (!options.enabled) {
    return null;
  }

  const host = options.host ?? DEFAULT_HOST;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tokenHeader = (options.tokenHeader ?? 'x-nodevision-token').toLowerCase();
  const isLocalAddress = options.isLocalAddress ?? isLocal;
  let activeRequests = 0;

  const server = http.createServer((req, res) => {
    const requestStartedAt = Date.now();
    let requestBytes = 0;
    let tokenLabel: string | null = null;
    const remoteAddr = req.socket.remoteAddress;
    const requestInsights: {
      clipCount: number | null;
      includeOptions: string[] | null;
      payloadVersion: string | null;
    } = {
      clipCount: null,
      includeOptions: null,
      payloadVersion: null
    };

    const respond = (statusCode: number, body: InspectConcatResponse): void => {
      const logLevel: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      writeJson(res, statusCode, body);
      if (options.requestHistory) {
        let responseCode: string | null = body.error?.code ?? null;
        if (body.ok) {
          responseCode = 'OK';
        }

        options.requestHistory.record({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - requestStartedAt,
          statusCode,
          tokenLabel,
          requestBytes,
          responseCode,
          logLevel,
          remoteAddress: remoteAddr ?? null,
          clipCount: requestInsights.clipCount,
          includeOptions: requestInsights.includeOptions,
          payloadVersion: requestInsights.payloadVersion,
          meta: body.error?.meta ?? null
        });
      }
    };
    if (!isLocalAddress(remoteAddr)) {
      respond(403, buildErrorBody('E4004', DEFAULT_VERSION));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/api/inspect/concat') {
      respond(404, buildErrorBody('E4040', DEFAULT_VERSION));
      return;
    }

    const providedToken = firstHeaderValue(
      req.headers[tokenHeader] ?? req.headers[tokenHeader.toLowerCase()]
    );
    if (!providedToken) {
      respond(401, buildErrorBody('E4000', DEFAULT_VERSION));
      return;
    }

    let tokenValidationPromise: Promise<TokenValidationSummary | null>;
    try {
      tokenValidationPromise = options.validateToken(providedToken);
    } catch (error) {
      options.logger?.error?.('[HTTP] token validation failed', error);
      respond(500, buildErrorBody('E5000', DEFAULT_VERSION));
      return;
    }

    tokenValidationPromise
      .then(summary => {
        if (!summary) {
          respond(403, buildErrorBody('E4003', DEFAULT_VERSION));
          return;
        }
        if (summary.status === 'expired') {
          respond(401, buildErrorBody('E4001', DEFAULT_VERSION, { label: summary.label }));
          return;
        }

        /* c8 ignore start */
        tokenLabel = normalizeTokenLabel(summary.label);
        /* c8 ignore end */

        if (activeRequests >= maxConcurrent) {
          respond(429, buildErrorBody('E4290', DEFAULT_VERSION));
          return;
        }

        activeRequests += 1;
        let finished = false;
        const cleanup = () => {
          if (!finished) {
            finished = true;
            activeRequests = Math.max(0, activeRequests - 1);
          }
        };

        let body = '';
        let terminated = false;
        let handlerStarted = false;

        const timer = setTimeout(() => {
          terminated = true;
          cleanup();
          respond(408, buildErrorBody('E4080', DEFAULT_VERSION));
          req.destroy();
        }, requestTimeoutMs);

        req.setEncoding('utf8');
        req.on('data', chunk => {
          if (terminated) {
            return;
          }

          requestBytes += Buffer.byteLength(chunk, 'utf8');
          body += chunk;
          if (requestBytes > maxPayloadBytes) {
            terminated = true;
            clearTimeout(timer);
            cleanup();
            respond(413, buildErrorBody('E4130', DEFAULT_VERSION));
            req.destroy();
          }
        });

        req.on('close', () => {
          if (handlerStarted || terminated) {
            return;
          }
          clearTimeout(timer);
          cleanup();
        });

        req.on('error', error => {
          terminated = true;
          clearTimeout(timer);
          cleanup();
          options.logger?.warn?.('[HTTP] request stream error', error);
          respond(500, buildErrorBody('E5000', DEFAULT_VERSION));
        });

        req.on('end', () => {
          if (shouldSkipEnd(terminated)) {
            return;
          }
          clearTimeout(timer);

          let parsed: InspectConcatRequest;
          try {
            parsed = parseInspectPayload(body);
            requestInsights.clipCount = Array.isArray(parsed.clips) ? parsed.clips.length : null;
            requestInsights.includeOptions = Array.isArray(parsed.options?.include)
              ? parsed.options!.include!.map(include => String(include))
              : null;
            requestInsights.payloadVersion = parsed.version ?? null;
          } catch {
            cleanup();
            respond(400, buildErrorBody('E4150', DEFAULT_VERSION));
            return;
          }

          handlerStarted = true;

          options
            .handleInspect(parsed)
            .then(response => {
              cleanup();
              const statusCode = response.ok ? 200 : mapInspectErrorToStatus(response.error?.code);
              respond(statusCode, response);
            })
            .catch(error => {
              cleanup();
              options.logger?.error?.('[HTTP] inspect handler failed', error);
              respond(500, buildErrorBody('E5000', parsed.version ?? DEFAULT_VERSION));
            });
        });

        options.onRequest?.(req, res);
      })
      .catch(error => {
        options.logger?.error?.('[HTTP] token validation rejected', error);
        respond(500, buildErrorBody('E5000', DEFAULT_VERSION));
      });
  });

  server.listen(options.port, host, () => {
    options.logger?.info?.(
      `[HTTP] Inspect server listening on http://${host}:${options.port}/api/inspect/concat`
    );
  });

  return server;
};

export {
  isLocal as isLoopbackAddress,
  mapInspectErrorToStatus,
  buildErrorBody as buildHttpErrorBody,
  firstHeaderValue,
  shouldSkipEnd,
  parseInspectPayload
};
