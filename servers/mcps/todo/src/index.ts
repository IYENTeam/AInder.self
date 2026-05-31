#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `@ainder/mcp-ainder` — standalone streamable-HTTP MCP server exposing
 * the AInder domain tools. Production boots with durable JSON-backed state,
 * origin checks, admin endpoint gating, request IDs, and baseline rate limits.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAinderStore } from './store.js';
import { registerAinderTools } from './handlers.js';

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' ||
  process.env.AINDER_ENV === 'production' ||
  process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

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

function parseOrigins(): ReadonlySet<string> {
  return new Set(
    (process.env.AINDER_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => new URL(item).origin),
  );
}

function adminEndpointsEnabled(): boolean {
  return !IS_PRODUCTION && process.env.AINDER_ENABLE_ADMIN_ENDPOINTS !== 'false';
}

async function main(): Promise<void> {
  const port = parsePort();
  const allowedOrigins = parseOrigins();
  const store = createAinderStore({
    dataFile: process.env.AINDER_DATA_FILE?.trim() || (IS_PRODUCTION ? '.data/ainder-state.json' : undefined),
    allowSeedData: !IS_PRODUCTION || process.env.AINDER_ALLOW_DEMO_SEEDING === 'true',
  });

  if (IS_PRODUCTION && allowedOrigins.size === 0) {
    throw new Error('AINDER_ALLOWED_ORIGINS is required in production.');
  }

  const server = createServer((req, res) => {
    const requestId = req.headers['x-request-id']?.toString() ?? randomBytes(8).toString('hex');
    res.setHeader('X-Request-ID', requestId);
    setSecurityHeaders(res);
    void handleRequest(req, res, store, allowedOrigins).catch((err) => {
      console.error('[mcp-ainder] request handler error:', { requestId, err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`internal error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`[mcp-ainder] ready: http://localhost:${port}/mcp`);
      resolve();
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: ReturnType<typeof createAinderStore>,
  allowedOrigins: ReadonlySet<string>,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);

  if (!originAllowed(req, allowedOrigins)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'origin_not_allowed' }));
    return;
  }

  if (!withinRateLimit(req)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'rate_limited' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin/state') {
    if (!adminEndpointsEnabled()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(store.state()));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/admin/reset') {
    if (!adminEndpointsEnabled()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    store.reset();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cleared: true }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/mcp') {
    const body = await readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid JSON body' }));
      return;
    }

    const mcp = new McpServer({
      name: '@ainder/mcp-ainder',
      version: '0.0.1',
      description: 'AInder MCP server for privacy-first agentic matching MVP.',
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
      await mcp.connect(transport);
      await transport.handleRequest(req, res, parsed);
      store.persist();
    } catch (err) {
      console.error('[mcp-ainder] mcp handle failed:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
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

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function originAllowed(req: IncomingMessage, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return true;
  return allowedOrigins.size === 0 || allowedOrigins.has(new URL(origin).origin);
}

function withinRateLimit(req: IncomingMessage): boolean {
  const windowMs = 60_000;
  const max = IS_PRODUCTION ? 120 : 1_000;
  const key = `${req.socket.remoteAddress ?? 'unknown'}:${req.url ?? '/'}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

main().catch((err) => {
  console.error('[mcp-ainder] fatal:', err);
  process.exit(1);
});
