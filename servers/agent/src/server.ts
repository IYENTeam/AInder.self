/**
 * OpenAI Agents SDK AInder backend — `@ggui-ai/agent-server` wired to
 * {@link createOpenAiAgentAdapter} with production auth hooks.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  startAgentServer,
  type AgentServerHandle,
  type AuthAdapter,
  type McpServerConfig,
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
  return startAgentServer({
    port: opts.port,
    mcpServers: opts.mcpServers,
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
