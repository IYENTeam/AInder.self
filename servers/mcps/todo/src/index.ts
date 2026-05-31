#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `@ainder/mcp-ainder` — standalone streamable-HTTP MCP server exposing the
 * AInder MVP domain tools behind production-safe request guards.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAinderStore } from './store.js';
import { registerAinderTools } from './handlers.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 120;
const SENSITIVE_ROUTE_LIMIT = 30;

type RuntimeConfig = {
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly allowDemoBootstrap: boolean;
  readonly adminEnabled: boolean;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly rateLimitMax: number;
};

type RateBucket = { count: number; resetAt: number };

function parsePort(): number {
  const argIdx = process.argv.indexOf('--port');
  if (argIdx >= 0 && argIdx + 1 < process.argv.length) {
    const n = Number.parseInt(process.argv[argIdx + 1]!, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const env = process.env.PORT;
  if (env !== undefined) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 6782;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ADMIN_ENABLED =
  !IS_PRODUCTION && process.env.AINDER_ENABLE_ADMIN_ENDPOINTS === 'true';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.AINDER_RATE_LIMIT_PER_MINUTE ?? 120);
const buckets = new Map<string, { count: number; resetAt: number }>();

function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.AINDER_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function setSecurityHeaders(res: ServerResponse, requestId: string): void {
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function rejectUnapprovedOrigin(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!IS_PRODUCTION || origin === undefined) return false;
  const allowed = allowedOrigins();
  if (allowed.has(origin)) return false;
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'origin not allowed' }));
  return true;
}

function rateLimit(req: IncomingMessage, res: ServerResponse, requestId: string): boolean {
  const nowMs = Date.now();
  const key = `${req.socket.remoteAddress ?? 'unknown'}:${req.url ?? '/'}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  if (bucket.count <= RATE_LIMIT_MAX) return false;
  res.writeHead(429, {
    'Content-Type': 'application/json',
    'Retry-After': String(Math.ceil((bucket.resetAt - nowMs) / 1000)),
  });
  res.end(JSON.stringify({ error: 'rate limited', request_id: requestId }));
  return true;
}

async function main(): Promise<void> {
  const port = parsePort();
  const store = createAinderStore({
    seedDemo: process.env.AINDER_ENABLE_DEMO_BOOTSTRAP === 'true' || !IS_PRODUCTION,
    persistencePath: process.env.AINDER_STATE_FILE,
    requirePersistence: IS_PRODUCTION,
  });

  const server = createServer((req, res) => {
    const requestId = randomUUID();
    setSecurityHeaders(res, requestId);
    void handleRequest(req, res, store, config, buckets, requestId).catch((err) => {
      console.error('[mcp-ainder] request handler error:', { request_id: requestId, err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error', request_id: requestId }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, () => {
      console.log(`[mcp-ainder] ready: http://localhost:${config.port}/mcp (${config.nodeEnv})`);
      resolve();
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: ReturnType<typeof createAinderStore>,
  config: RuntimeConfig,
  buckets: Map<string, RateBucket>,
  requestId: string,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const requestId = randomUUID();
  setSecurityHeaders(res, requestId);
  if (rejectUnapprovedOrigin(req, res) || rateLimit(req, res, requestId)) {
    return;
  }

  if (url.pathname.startsWith('/admin/')) {
    if (!ADMIN_ENABLED) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/admin/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(store.state()));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/admin/reset') {
      store.reset();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ cleared: true }));
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/mcp') {
    const body = await readBody(req, MAX_BODY_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_json', request_id: requestId }));
      return;
    }

    const mcp = new McpServer({
      name: '@ainder/mcp-ainder',
      version: '0.0.1',
      description: 'AInder MCP server for privacy-first agentic matching.',
    });
    registerAinderTools(mcp, { store });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close().catch(() => undefined);
      mcp.close().catch(() => undefined);
    });

    try {
      console.log('[mcp-ainder] mcp request', { request_id: requestId });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, parsed);
      store.persist();
    } catch (err) {
      console.error('[mcp-ainder] mcp handle failed:', { request_id: requestId, err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error', data: { request_id: requestId } },
            id: null,
          }),
        );
      }
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        reject(new Error(`request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

main().catch((err) => {
  console.error('[mcp-ainder] fatal:', err);
  process.exit(1);
});
