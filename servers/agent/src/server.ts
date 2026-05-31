/**
 * OpenAI Agents SDK backend — `@ggui-ai/agent-server` wired to the AInder
 * production auth posture.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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
  readonly allowedOrigins?: readonly string[];
  readonly sessionSecret?: string;
}

type SessionRecord = {
  readonly userId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
};

type MountRouter = {
  get(path: string, handler: (c: any) => Response | Promise<Response>): void;
  post(path: string, handler: (c: any) => Response | Promise<Response>): void;
};

const COOKIE_NAME = 'ainder_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of (header ?? '').split(';')) {
    const [rawKey, ...rawValue] = chunk.trim().split('=');
    if (!rawKey || rawValue.length === 0) continue;
    out[rawKey] = rawValue.join('=');
  }
  return out;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  return aBytes.byteLength === bBytes.byteLength && timingSafeEqual(aBytes, bBytes);
}

function createSessionAuth(opts: {
  readonly secret: string;
  readonly allowedOrigins: readonly string[];
  readonly secureCookies: boolean;
}): AuthAdapter {
  const sessions = new Map<string, SessionRecord>();
  const allowed = new Set(opts.allowedOrigins);

  function verifyToken(token: string | undefined): SessionRecord | null {
    if (!token) return null;
    const [id, mac] = token.split('.');
    if (!id || !mac || !constantTimeEqual(sign(id, opts.secret), mac)) return null;
    const session = sessions.get(id);
    if (!session || session.expiresAt <= Date.now()) {
      if (id) sessions.delete(id);
      return null;
    }
    return session;
  }

  function createCookie(userId: string): string {
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
    const flags = [
      `${COOKIE_NAME}=${id}.${sign(id, opts.secret)}`,
      'HttpOnly',
      'Path=/',
      'SameSite=None',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];
    if (opts.secureCookies) flags.push('Secure');
    return flags.join('; ');
  }

  function originAllowed(req: Request): boolean {
    const origin = req.headers.get('origin');
    return !origin || allowed.size === 0 || allowed.has(origin);
  }

  function authResult(req: Request) {
    if (!originAllowed(req)) return null;
    const session = verifyToken(parseCookie(req.headers.get('cookie'))[COOKIE_NAME]);
    if (!session) return null;
    return {
      principal: { kind: 'user', userId: session.userId } satisfies Principal,
      responseHeaders: securityHeaders(req),
    };
  }

  function securityHeaders(req: Request): HeadersInit {
    const headers: Record<string, string> = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    };
    const origin = req.headers.get('origin');
    if (origin && allowed.has(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers.Vary = 'Origin';
    }
    return headers;
  }

  return {
    async authenticate(req) {
      return authResult(req);
    },
    mount(router: MountRouter) {
      router.get('/session', (c) => {
        const result = authResult(c.req.raw as Request);
        if (!result) return c.json({ authenticated: false }, 401, securityHeaders(c.req.raw));
        return c.json({ authenticated: true }, 200, result.responseHeaders);
      });
      router.post('/login', async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (
          userId.length === 0 ||
          password.length === 0 ||
          userId !== process.env.AINDER_BOOTSTRAP_USER ||
          password !== process.env.AINDER_BOOTSTRAP_PASSWORD
        ) {
          return c.json({ authenticated: false }, 401, securityHeaders(c.req.raw));
        }
        return c.json(
          { authenticated: true },
          200,
          { ...securityHeaders(c.req.raw), 'Set-Cookie': createCookie(userId) },
        );
      });
      router.post('/logout', (c) => {
        const token = parseCookie((c.req.raw as Request).headers.get('cookie'))[COOKIE_NAME];
        const id = token?.split('.')[0];
        if (id) sessions.delete(id);
        return c.json(
          { authenticated: false },
          200,
          {
            ...securityHeaders(c.req.raw),
            'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=None; Max-Age=0${opts.secureCookies ? '; Secure' : ''}`,
          },
        );
      });
    },
  };
}

interface CookieSessionAuthOptions {
  readonly sessionSecret: string;
  readonly userId: string;
  readonly passwordHash: string;
  readonly storeFile?: string;
  readonly secureCookies: boolean;
  readonly allowedOrigins: ReadonlySet<string>;
}

interface SessionRecord {
  readonly sessionIdHash: string;
  readonly userId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

const SESSION_COOKIE = 'ainder_sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function startServer(
  opts: ServerOptions,
): Promise<AgentServerHandle> {
  const auth = createSessionAuth({
    secret: opts.sessionSecret ?? randomBytes(32).toString('base64url'),
    allowedOrigins: opts.allowedOrigins ?? [],
    secureCookies: process.env.NODE_ENV === 'production',
  });

  return startAgentServer({
    port: opts.port,
    mcpServers: opts.mcpServers,
    auth,
    adapter: createOpenAiAgentAdapter(
      opts.model !== undefined ? { model: opts.model } : {},
    ),
    ...(opts.auth !== undefined ? { auth: opts.auth } : {}),
    ...(opts.sandboxProxyPort !== undefined
      ? { sandboxProxyPort: opts.sandboxProxyPort }
      : {}),
    ...(opts.systemPrompt !== undefined
      ? { systemPrompt: opts.systemPrompt }
      : {}),
  });
}

export function createCookieSessionAuth(
  opts: CookieSessionAuthOptions,
): AuthAdapter {
  let sessions = loadSessions(opts.storeFile).filter((s) => s.expiresAt > Date.now());

  const persist = () => {
    if (!opts.storeFile) return;
    mkdirSync(dirname(opts.storeFile), { recursive: true });
    writeFileSync(opts.storeFile, JSON.stringify({ sessions }, null, 2));
  };

  const headersFor = (requestId: string): HeadersInit => ({
    'X-Request-ID': requestId,
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });

  const rejectOrigin = (req: Request): boolean => {
    const origin = req.headers.get('origin');
    return origin !== null && opts.allowedOrigins.size > 0 && !opts.allowedOrigins.has(origin);
  };

  const findSession = (req: Request): SessionRecord | null => {
    const rawSessionId = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
    if (!rawSessionId) return null;
    const now = Date.now();
    sessions = sessions.filter((s) => s.expiresAt > now);
    const sessionIdHash = hashSessionId(opts.sessionSecret, rawSessionId);
    const session = sessions.find((s) => constantTimeEqual(s.sessionIdHash, sessionIdHash));
    if (!session) return null;
    return session;
  };

  return {
    async authenticate(req) {
      const requestId = req.headers.get('x-request-id') ?? randomBytes(8).toString('hex');
      if (rejectOrigin(req)) return null;
      const session = findSession(req);
      if (!session) return null;
      return {
        principal: { kind: 'user', userId: session.userId },
        responseHeaders: headersFor(requestId),
      };
    },
    mount(router) {
      router.post('/login', async (c: any) => {
        const req: Request = c.req.raw;
        if (rejectOrigin(req)) return c.json({ error: 'origin_not_allowed' }, 403);
        const body = await c.req.json().catch(() => ({}));
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const password = typeof body.password === 'string' ? body.password : '';
        if (userId !== opts.userId || !verifyPassword(password, opts.passwordHash)) {
          return c.json({ error: 'invalid_credentials' }, 401);
        }
        const rawSessionId = randomBytes(32).toString('base64url');
        const now = Date.now();
        sessions.push({
          sessionIdHash: hashSessionId(opts.sessionSecret, rawSessionId),
          userId,
          createdAt: now,
          expiresAt: now + SESSION_TTL_MS,
        });
        persist();
        c.header('Set-Cookie', serializeSessionCookie(rawSessionId, opts.secureCookies));
        c.header('X-Request-ID', randomBytes(8).toString('hex'));
        return c.json({ userId });
      });

      router.get('/me', (c: any) => {
        const req: Request = c.req.raw;
        if (rejectOrigin(req)) return c.json({ error: 'origin_not_allowed' }, 403);
        const session = findSession(req);
        if (!session) return c.json({ error: 'unauthenticated' }, 401);
        c.header('X-Request-ID', randomBytes(8).toString('hex'));
        return c.json({ userId: session.userId });
      });

      router.post('/logout', (c: any) => {
        const req: Request = c.req.raw;
        const rawSessionId = parseCookies(req.headers.get('cookie'))[SESSION_COOKIE];
        if (rawSessionId) {
          const hash = hashSessionId(opts.sessionSecret, rawSessionId);
          sessions = sessions.filter((s) => !constantTimeEqual(s.sessionIdHash, hash));
          persist();
        }
        c.header('Set-Cookie', expireSessionCookie(opts.secureCookies));
        c.header('X-Request-ID', randomBytes(8).toString('hex'));
        return c.json({ ok: true });
      });
    },
  };
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
    'SameSite=Lax',
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
    'SameSite=Lax',
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
  if (encoded.startsWith('scrypt:')) {
    const [, salt, expected] = encoded.split(':');
    if (!salt || !expected) return false;
    const actual = scryptSync(password, salt, 64).toString('hex');
    return constantTimeEqual(actual, expected);
  }
  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
