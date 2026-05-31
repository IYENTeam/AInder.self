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

function parseOrigins(value: string | undefined): ReadonlySet<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function loadConfig(): RuntimeConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const allowedOrigins = parseOrigins(process.env.AINDER_ALLOWED_ORIGINS);
  const allowDemoBootstrap = process.env.AINDER_ALLOW_DEMO_BOOTSTRAP === 'true';
  const adminEnabled = !isProduction && process.env.AINDER_ENABLE_ADMIN_DEBUG !== 'false';
  const rateLimitMax = Number.parseInt(process.env.AINDER_RATE_LIMIT_PER_MINUTE ?? '', 10);

  if (isProduction && allowedOrigins.size === 0) {
    throw new Error('AINDER_ALLOWED_ORIGINS is required in production.');
  }
  if (isProduction && allowDemoBootstrap) {
    throw new Error('AINDER_ALLOW_DEMO_BOOTSTRAP must not be true in production.');
  }
  if (isProduction && process.env.AINDER_ENABLE_ADMIN_DEBUG === 'true') {
    throw new Error('AINDER_ENABLE_ADMIN_DEBUG must not be true in production.');
  }

  return {
    nodeEnv,
    isProduction,
    port: parsePort(),
    allowDemoBootstrap: !isProduction && allowDemoBootstrap,
    adminEnabled,
    allowedOrigins,
    rateLimitMax: Number.isFinite(rateLimitMax) && rateLimitMax > 0 ? rateLimitMax : DEFAULT_RATE_LIMIT,
  };
}

function setSecurityHeaders(res: ServerResponse, requestId: string): void {
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
}

function originAllowed(req: IncomingMessage, config: RuntimeConfig): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!config.isProduction && config.allowedOrigins.size === 0) return true;
  return config.allowedOrigins.has(origin);
}

function clientKey(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(
  buckets: Map<string, RateBucket>,
  key: string,
  max: number,
  nowMs = Date.now(),
): boolean {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
    return true;
  }
  existing.count += 1;
  return existing.count <= max;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const store = createAinderStore({ demoBootstrap: config.allowDemoBootstrap });
  const buckets = new Map<string, RateBucket>();

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

  const origin = req.headers.origin;
  if (origin && originAllowed(req, config)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (!originAllowed(req, config)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'origin_not_allowed', request_id: requestId }));
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, X-Request-Id',
    });
    res.end();
    return;
  }

  const routeLimit = url.pathname.startsWith('/admin/') ? SENSITIVE_ROUTE_LIMIT : config.rateLimitMax;
  const limitedKey = `${clientKey(req)}:${url.pathname}`;
  if (!checkRateLimit(buckets, limitedKey, routeLimit)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    res.end(JSON.stringify({ error: 'rate_limited', request_id: requestId }));
    return;
  }

  if (url.pathname.startsWith('/admin/') && !config.adminEnabled) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
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
    res.end(JSON.stringify({ cleared: true, request_id: requestId }));
    return;
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
