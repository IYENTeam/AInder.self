#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `@ainder/mcp-ainder` — standalone streamable-HTTP MCP server
 * exposing the AInder domain tools.
 *
 * Production mode is fail-closed: demo seed data and unauthenticated admin
 * endpoints are local-dev only, state is file-backed through AINDER_STORE_PATH,
 * and browser-facing requests must pass explicit origin/rate-limit guards.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAinderStore } from './store.js';
import { registerAinderTools } from './handlers.js';

type Store = ReturnType<typeof createAinderStore>;

const isProduction = process.env.NODE_ENV === 'production';
const adminToken = process.env.AINDER_ADMIN_TOKEN?.trim();
const storePath = process.env.AINDER_STORE_PATH?.trim();
const seedDemo = !isProduction && process.env.AINDER_SEED_DEMO !== 'false';
const allowedOrigins = parseCsv(process.env.AINDER_ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS);
const rateWindowMs = Number.parseInt(process.env.AINDER_RATE_WINDOW_MS ?? '60000', 10);
const rateLimit = Number.parseInt(process.env.AINDER_RATE_LIMIT ?? (isProduction ? '120' : '1000'), 10);
const maxBodyBytes = Number.parseInt(process.env.AINDER_MAX_BODY_BYTES ?? '1048576', 10);
const buckets = new Map<string, { count: number; resetAt: number }>();

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function validateEnvironment(): void {
  const failures: string[] = [];
  if (isProduction) {
    if (!storePath) failures.push('AINDER_STORE_PATH is required in production.');
    if (allowedOrigins.length === 0) failures.push('AINDER_ALLOWED_ORIGINS is required in production.');
    if (!adminToken) failures.push('AINDER_ADMIN_TOKEN is required in production if admin routes are compiled in.');
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`[mcp-ainder] ${failure}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  validateEnvironment();
  const port = parsePort();
  const store = createAinderStore({ persistPath: storePath, seedDemo });
  store.persist();

  const server = createServer((req, res) => {
    const requestId = requestIdFor(req);
    setSecurityHeaders(res, requestId);
    if (!applyCors(req, res)) return;
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (!consumeRateLimit(req, res)) return;

    void handleRequest(req, res, store, requestId).catch((err) => {
      console.error('[mcp-ainder] request handler error:', { requestId, err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal error', request_id: requestId }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`[mcp-ainder] ready: http://localhost:${port}/mcp (${isProduction ? 'production' : 'development'})`);
      resolve();
    });
  });
}

function requestIdFor(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
}

function setSecurityHeaders(res: ServerResponse, requestId: string): void {
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
}

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return true;
  const allowed = allowedOrigins.includes(origin) || (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  if (!allowed) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'origin not allowed' }));
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
  return true;
}

function consumeRateLimit(req: IncomingMessage, res: ServerResponse): boolean {
  const key = `${req.socket.remoteAddress ?? 'unknown'}:${new URL(req.url ?? '/', 'http://localhost').pathname}`;
  const now = Date.now();
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + rateWindowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  res.setHeader('RateLimit-Limit', String(rateLimit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, rateLimit - bucket.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  if (bucket.count > rateLimit) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'rate limit exceeded' }));
    return false;
  }
  return true;
}

function requireAdmin(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isProduction) return true;
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token && adminToken && token === adminToken) return true;
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
  return false;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  requestId: string,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);

  if (req.method === 'GET' && url.pathname === '/admin/state') {
    if (!requireAdmin(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ request_id: requestId, state: store.state() }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/reset') {
    if (!requireAdmin(req, res)) return;
    store.reset();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ request_id: requestId, cleared: true }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/mcp') {
    const body = await readBody(req, maxBodyBytes);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid JSON body', request_id: requestId }));
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
      console.error('[mcp-ainder] mcp handle failed:', { requestId, err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error', data: { request_id: requestId } },
            id: null,
            request_id: requestId,
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
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(new Error('request body too large'));
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
