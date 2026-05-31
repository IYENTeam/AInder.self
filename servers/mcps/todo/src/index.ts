#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * `@ainder/mcp-ainder` — standalone streamable-HTTP MCP server
 * exposing the AInder hackathon MVP domain tools.
 *
 * Boots on a single port (default 6782 — overridable via PORT env or
 * `--port N` CLI arg). The MVP uses one in-memory demo state with seeded
 * users, target profile, friend personas, and privacy-safe fixtures.
 *
 * Endpoints:
 *   - `POST /mcp` — JSON-RPC envelope; streamable-HTTP transport.
 *   - `GET  /admin/state` — debug helper; returns in-memory AInder state.
 *   - `POST /admin/reset` — clears state back to seeded demo data.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createAinderStore } from './store.js';
import { registerAinderTools } from './handlers.js';


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

async function main(): Promise<void> {
  const port = parsePort();
  const store = createAinderStore();

  const server = createServer((req, res) => {
    void handleRequest(req, res, store).catch((err) => {
      console.error('[mcp-ainder] request handler error:', err);
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
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);

  // Debug helper: read current state without an MCP round trip.
  if (req.method === 'GET' && url.pathname === '/admin/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(store.state()));
    return;
  }

  // Reset state — useful for between-scenario isolation.
  if (req.method === 'POST' && url.pathname === '/admin/reset') {
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
