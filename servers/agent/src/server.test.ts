import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, scryptSync } from 'node:crypto';
import { createCookieSessionAuth } from './server.js';

type RouteHandler = (c: any) => unknown;

type TestMountRouter = {
  get: (path: string, handler: RouteHandler) => void;
  post: (path: string, handler: RouteHandler) => void;
};

test('cookie-session auth issues csrf token and enforces it on authenticated POSTs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ainder-agent-auth-'));
  const storeFile = join(dir, 'sessions.json');
  try {
    const auth = createCookieSessionAuth({
      sessionSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      userId: 'admin',
      passwordHash: hashPassword('secret-pass'),
      storeFile,
      secureCookies: false,
      allowedOrigins: new Set(['https://app.example.com']),
      authRateLimit: 5,
      authRateWindowMs: 60_000,
    });

    const routes = new Map<string, RouteHandler>();
    const router: TestMountRouter = {
      get(path: string, handler: RouteHandler) {
        routes.set(`GET ${path}`, handler);
      },
      post(path: string, handler: RouteHandler) {
        routes.set(`POST ${path}`, handler);
      },
    };
    assert.ok(auth.mount, 'auth adapter should expose mount');
    auth.mount(router as never);

    const login = await invoke(routes, 'POST /auth/login', {
      url: 'https://agent.example.com/auth/login',
      origin: 'https://app.example.com',
      json: { userId: 'admin', password: 'secret-pass' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.authenticated, true);
    assert.equal(typeof login.body.csrfToken, 'string');
    assert.match(login.headers['Set-Cookie'] ?? '', /ainder_sid=/);

    const cookie = login.headers['Set-Cookie'];
    const csrfToken = login.body.csrfToken as string;

    const me = await invoke(routes, 'GET /auth/me', {
      url: 'https://agent.example.com/auth/me',
      origin: 'https://app.example.com',
      cookie,
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.userId, 'admin');
    assert.equal(me.body.csrfToken, csrfToken);

    const postWithoutCsrf = await auth.authenticate(
      new Request('https://agent.example.com/agent', {
        method: 'POST',
        headers: {
          origin: 'https://app.example.com',
          cookie,
        },
      }),
    );
    assert.equal(postWithoutCsrf, null);

    const postWithCsrf = await auth.authenticate(
      new Request('https://agent.example.com/agent', {
        method: 'POST',
        headers: {
          origin: 'https://app.example.com',
          cookie,
          'x-csrf-token': csrfToken,
        },
      }),
    );
    assert.equal(postWithCsrf?.principal.kind, 'user');
    if (postWithCsrf?.principal.kind !== 'user') {
      throw new Error('expected authenticated user principal');
    }
    assert.equal(postWithCsrf.principal.userId, 'admin');

    const logoutBlocked = await invoke(routes, 'POST /auth/logout', {
      url: 'https://agent.example.com/auth/logout',
      origin: 'https://app.example.com',
      cookie,
    });
    assert.equal(logoutBlocked.status, 403);

    const logoutAllowed = await invoke(routes, 'POST /auth/logout', {
      url: 'https://agent.example.com/auth/logout',
      origin: 'https://app.example.com',
      cookie,
      headers: { 'x-csrf-token': csrfToken },
    });
    assert.equal(logoutAllowed.status, 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cookie-session auth rejects disallowed origins', async () => {
  const auth = createCookieSessionAuth({
    sessionSecret: 'abcdefghijklmnopqrstuvwxyz012345',
    userId: 'admin',
    passwordHash: hashPassword('secret-pass'),
    secureCookies: false,
    allowedOrigins: new Set(['https://app.example.com']),
    authRateLimit: 5,
    authRateWindowMs: 60_000,
  });

  const routes = new Map<string, RouteHandler>();
  const router: TestMountRouter = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path: string, handler: RouteHandler) {
      routes.set(`POST ${path}`, handler);
    },
  };
  assert.ok(auth.mount, 'auth adapter should expose mount');
  auth.mount(router as never);

  const login = await invoke(routes, 'POST /login', {
    url: 'https://agent.example.com/login',
    origin: 'https://evil.example.com',
    json: { userId: 'admin', password: 'secret-pass' },
  });
  assert.equal(login.status, 403);
  assert.equal(login.body.error, 'origin_not_allowed');
});

test('login route is rate limited by actor and subject window', async () => {
  const auth = createCookieSessionAuth({
    sessionSecret: 'abcdefghijklmnopqrstuvwxyz012345',
    userId: 'admin',
    passwordHash: hashPassword('secret-pass'),
    secureCookies: false,
    allowedOrigins: new Set(['https://app.example.com']),
    authRateLimit: 2,
    authRateWindowMs: 60_000,
  });

  const routes = new Map<string, RouteHandler>();
  const router: TestMountRouter = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path: string, handler: RouteHandler) {
      routes.set(`POST ${path}`, handler);
    },
  };
  assert.ok(auth.mount, 'auth adapter should expose mount');
  auth.mount(router as never);

  const headers = { 'x-forwarded-for': '203.0.113.10' };
  const first = await invoke(routes, 'POST /auth/login', {
    url: 'https://agent.example.com/auth/login',
    origin: 'https://app.example.com',
    headers,
    json: { userId: 'admin', password: 'secret-pass' },
  });
  const second = await invoke(routes, 'POST /auth/login', {
    url: 'https://agent.example.com/auth/login',
    origin: 'https://app.example.com',
    headers,
    json: { userId: 'admin', password: 'secret-pass' },
  });
  const third = await invoke(routes, 'POST /auth/login', {
    url: 'https://agent.example.com/auth/login',
    origin: 'https://app.example.com',
    headers,
    json: { userId: 'admin', password: 'secret-pass' },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.body.error, 'rate_limited');
});

function hashPassword(password: string): string {
  const salt = 'test-salt';
  return `scrypt:v1:${salt}:${scryptSync(password, salt, 64).toString('base64url')}`;
}

async function invoke(
  routes: Map<string, RouteHandler>,
  key: string,
  opts: {
    url: string;
    origin?: string;
    cookie?: string;
    json?: unknown;
    headers?: Record<string, string>;
  },
): Promise<{ status: number; body: any; headers: Record<string, string> }> {
  const handler = routes.get(key);
  assert.ok(handler, `missing route handler for ${key}`);
  const headers = new Headers(opts.headers ?? {});
  if (opts.origin) headers.set('origin', opts.origin);
  if (opts.cookie) headers.set('cookie', opts.cookie);
  if (opts.json !== undefined) headers.set('content-type', 'application/json');
  const request = new Request(opts.url, {
    method: key.split(' ')[0],
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });

  const responseState: { status: number; body: any; headers: Record<string, string> } = {
    status: 200,
    body: null,
    headers: {},
  };
  const ctx = {
    req: {
      raw: request,
      json: async () => opts.json ?? {},
      text: async () => (opts.json !== undefined ? JSON.stringify(opts.json) : ''),
    },
    json(body: any, status = 200, responseHeaders: Record<string, string> = {}) {
      responseState.status = status;
      responseState.body = body;
      responseState.headers = responseHeaders;
      return body;
    },
    header(name: string, value: string) {
      responseState.headers[name] = value;
    },
  };

  await handler(ctx);
  return responseState;
}
