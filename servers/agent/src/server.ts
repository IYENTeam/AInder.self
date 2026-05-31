import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  startAgentServer,
  type AgentServerHandle,
  type AuthAdapter,
  type McpServerConfig,
  type Principal,
} from '@ggui-ai/agent-server';
import { createOpenAiAgentAdapter } from './agent.js';

export interface ServerOptions {
  readonly port: number;
  readonly mcpServers: Record<string, McpServerConfig>;
  readonly model?: string;
  readonly systemPrompt?: string | null;
  readonly sandboxProxyPort?: number;
  readonly auth?: AuthAdapter;
}

interface CookieSessionAuthOptions {
  readonly sessionSecret: string;
  readonly userId: string;
  readonly passwordHash: string;
  readonly storeFile?: string;
  readonly secureCookies: boolean;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly authRateLimit: number;
  readonly authRateWindowMs: number;
}

interface SessionRecord {
  readonly sessionIdHash: string;
  readonly userId: string;
  readonly csrfToken: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const SESSION_COOKIE = 'ainder_sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type MountRouter = {
  get(path: string, handler: (c: any) => Response | Promise<Response>): void;
  post(path: string, handler: (c: any) => Response | Promise<Response>): void;
};

export async function startServer(opts: ServerOptions): Promise<AgentServerHandle> {
  if (process.env.AINDER_CORS_PROXY === '1') {
    return startServerBehindCredentialCorsProxy(opts);
  }
  const handle = await startAgentServer({
    port: opts.port,
    mcpServers: opts.mcpServers,
    adapter: createOpenAiAgentAdapter({
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    }),
    ...(opts.auth !== undefined ? { auth: opts.auth } : {}),
    ...(opts.sandboxProxyPort !== undefined ? { sandboxProxyPort: opts.sandboxProxyPort } : {}),
    ...(opts.systemPrompt !== undefined ? { systemPrompt: opts.systemPrompt } : {}),
  });
  return handle;
}

export function createCookieSessionAuth(opts: CookieSessionAuthOptions): AuthAdapter {
  let sessions = loadSessions(opts.storeFile).filter((s) => s.expiresAt > Date.now());
  const authBuckets = new Map<string, RateBucket>();

  const persist = () => {
    if (!opts.storeFile) return;
    mkdirSync(dirname(opts.storeFile), { recursive: true });
    writeFileSync(opts.storeFile, JSON.stringify({ sessions }, null, 2));
  };

  const rejectOrigin = (req: Request): boolean => {
    const origin = req.headers.get('origin');
    return origin !== null && opts.allowedOrigins.size > 0 && !opts.allowedOrigins.has(origin);
  };

  const consumeAuthRateLimit = (req: Request, subject: string): boolean => {
    const actor =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('cf-connecting-ip') ??
      'unknown';
    const key = `${actor}:${subject}`;
    const now = Date.now();
    const current = authBuckets.get(key);
    const bucket =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + opts.authRateWindowMs };
    bucket.count += 1;
    authBuckets.set(key, bucket);
    return bucket.count <= opts.authRateLimit;
  };

  const headersFor = (req: Request, requestId: string): Record<string, string> => {
    const headers: Record<string, string> = {
      'X-Request-ID': requestId,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    };
    const origin = req.headers.get('origin');
    if (origin && opts.allowedOrigins.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers.Vary = 'Origin';
    }
    return headers;
  };

  const parseRequestJson = async (c: any): Promise<Record<string, unknown>> => {
    const contentType = String(c.req.raw.headers.get('content-type') ?? '');
    if (contentType.includes('application/json')) {
      return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    }
    const raw = await c.req.text().catch(() => '');
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(raw));
    }
    return {};
  };

  const findSession = (req: Request): SessionRecord | null => {
    const rawSessionId = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
    if (!rawSessionId) return null;
    const now = Date.now();
    sessions = sessions.filter((s) => s.expiresAt > now);
    const sessionIdHash = hashSessionId(opts.sessionSecret, rawSessionId);
    return sessions.find((s) => constantTimeEqual(s.sessionIdHash, sessionIdHash)) ?? null;
  };

  return {
    async authenticate(req) {
      const requestId = req.headers.get('x-request-id') ?? randomBytes(8).toString('hex');
      if (rejectOrigin(req)) return null;
      const session = findSession(req);
      if (!session) return null;
      if (req.method !== 'GET') {
        const csrfToken = req.headers.get('x-csrf-token');
        if (!csrfToken || !constantTimeEqual(csrfToken, session.csrfToken)) return null;
      }
      return {
        principal: { kind: 'user', userId: session.userId } satisfies Principal,
        responseHeaders: headersFor(req, requestId),
      };
    },
    mount(router: MountRouter) {
      const mountAuthRoutes = (prefix: '' | '/auth') => {
        router.post(`${prefix}/login`, async (c: any) => {
          const req: Request = c.req.raw;
          const requestId = req.headers.get('x-request-id') ?? randomBytes(8).toString('hex');
          if (rejectOrigin(req)) return c.json({ error: 'origin_not_allowed' }, 403, headersFor(req, requestId));
          const body = await parseRequestJson(c);
          const userId = typeof body.userId === 'string' ? body.userId : '';
          const password = typeof body.password === 'string' ? body.password : '';
          if (!consumeAuthRateLimit(req, userId || 'anonymous')) {
            return c.json({ error: 'rate_limited' }, 429, headersFor(req, requestId));
          }
          if (userId !== opts.userId || !verifyPassword(password, opts.passwordHash)) {
            return c.json({ error: 'invalid_credentials' }, 401, headersFor(req, requestId));
          }
          const rawSessionId = randomBytes(32).toString('base64url');
          const now = Date.now();
          const csrfToken = randomBytes(24).toString('base64url');
          sessions.push({
            sessionIdHash: hashSessionId(opts.sessionSecret, rawSessionId),
            userId,
            csrfToken,
            createdAt: now,
            expiresAt: now + SESSION_TTL_MS,
          });
          persist();
          return c.json(
            { authenticated: true, userId, csrfToken },
            200,
            {
              ...headersFor(req, requestId),
              'Set-Cookie': serializeSessionCookie(rawSessionId, opts.secureCookies),
            },
          );
        });

        router.get(`${prefix}/me`, (c: any) => {
          const req: Request = c.req.raw;
          const requestId = req.headers.get('x-request-id') ?? randomBytes(8).toString('hex');
          if (rejectOrigin(req)) return c.json({ error: 'origin_not_allowed' }, 403, headersFor(req, requestId));
          const session = findSession(req);
          if (!session) return c.json({ authenticated: false }, 401, headersFor(req, requestId));
          return c.json({ authenticated: true, userId: session.userId, csrfToken: session.csrfToken }, 200, headersFor(req, requestId));
        });

        router.post(`${prefix}/logout`, (c: any) => {
          const req: Request = c.req.raw;
          const requestId = req.headers.get('x-request-id') ?? randomBytes(8).toString('hex');
          if (rejectOrigin(req)) return c.json({ error: 'origin_not_allowed' }, 403, headersFor(req, requestId));
          const session = findSession(req);
          if (!session) return c.json({ authenticated: false }, 401, headersFor(req, requestId));
          const csrfToken = req.headers.get('x-csrf-token');
          if (!csrfToken || !constantTimeEqual(csrfToken, session.csrfToken)) {
            return c.json({ error: 'csrf_invalid' }, 403, headersFor(req, requestId));
          }
          const rawSessionId = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
          if (rawSessionId) {
            const hash = hashSessionId(opts.sessionSecret, rawSessionId);
            sessions = sessions.filter((s) => !constantTimeEqual(s.sessionIdHash, hash));
            persist();
          }
          return c.json(
            { authenticated: false },
            200,
            {
              ...headersFor(req, requestId),
              'Set-Cookie': expireSessionCookie(opts.secureCookies),
            },
          );
        });
      };

      mountAuthRoutes('');
      mountAuthRoutes('/auth');
    },
  };
}



async function startServerBehindCredentialCorsProxy(opts: ServerOptions): Promise<AgentServerHandle> {
  const upstreamPort = opts.port + 10;
  const upstream = await startAgentServer({
    port: upstreamPort,
    mcpServers: opts.mcpServers,
    adapter: createOpenAiAgentAdapter({
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    }),
    ...(opts.auth !== undefined ? { auth: opts.auth } : {}),
    ...(opts.sandboxProxyPort !== undefined ? { sandboxProxyPort: opts.sandboxProxyPort } : {}),
    ...(opts.systemPrompt !== undefined ? { systemPrompt: opts.systemPrompt } : {}),
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void proxyCredentialedCorsRequest(req, res, upstreamPort);
  });
  await new Promise<void>((resolve) => server.listen(opts.port, resolve));
  console.log(`[ainder-agent] credential CORS proxy ready: http://localhost:${opts.port} -> http://localhost:${upstreamPort}`);
  return {
    port: opts.port,
    sandboxProxy: upstream.sandboxProxy,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await upstream.close();
    },
  };
}

async function proxyCredentialedCorsRequest(req: IncomingMessage, res: ServerResponse, upstreamPort: number): Promise<void> {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const target = new URL(req.url ?? '/', `http://127.0.0.1:${upstreamPort}`);
  const body = ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : req;
  try {
    const upstreamResponse = await fetch(target, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      // Node fetch requires this when proxying IncomingMessage bodies.
      ...(body ? { body, duplex: 'half' as const } : {}),
    });
    res.statusCode = upstreamResponse.status;
    res.statusMessage = upstreamResponse.statusText;
    upstreamResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'access-control-allow-origin' && key.toLowerCase() !== 'access-control-allow-credentials') {
        res.setHeader(key, value);
      }
    });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    const data = Buffer.from(await upstreamResponse.arrayBuffer());
    res.end(data);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    res.end(JSON.stringify({ error: 'proxy_failed' }));
  }
}

function loadSessions(storeFile: string | undefined): SessionRecord[] {
  if (!storeFile || !existsSync(storeFile)) return [];
  const parsed = JSON.parse(readFileSync(storeFile, 'utf8')) as { sessions?: unknown };
  if (!Array.isArray(parsed.sessions)) return [];
  return parsed.sessions.filter((item): item is SessionRecord => {
    if (typeof item !== 'object' || item === null) return false;
    const row = item as Partial<SessionRecord>;
    return (
      typeof row.sessionIdHash === 'string' &&
      typeof row.userId === 'string' &&
      typeof row.csrfToken === 'string' &&
      typeof row.createdAt === 'number' &&
      typeof row.expiresAt === 'number'
    );
  });
}

function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(';') ?? []) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function serializeSessionCookie(rawSessionId: string, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(rawSessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=None',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function expireSessionCookie(secure: boolean): string {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=None',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function hashSessionId(secret: string, sessionId: string): string {
  return createHash('sha256').update(secret).update('\0').update(sessionId).digest('hex');
}

function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, version, salt, expected] = encoded.split(':');
  if (scheme !== 'scrypt' || version !== 'v1' || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBytes = Buffer.from(expected, 'base64url');
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
