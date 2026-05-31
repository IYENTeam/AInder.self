/* eslint-disable no-console */
/**
 * Boot entry point — wires environment variables to the HTTP server.
 *
 * Env vars consumed here:
 *
 *   PORT                     Chat backend HTTP port (default 6790 in dev)
 *   SANDBOX_PROXY_PORT       Spec-mandated second-origin sandbox port
 *   GGUI_MCP_URL             Primary ggui MCP endpoint
 *   GGUI_AINDER_MCP_URL      AInder domain MCP endpoint
 *   AINDER_ALLOWED_ORIGINS   Comma-separated browser origins allowed in prod
 *   AINDER_SESSION_SECRET    Required in production for cookie sessions
 *   OPENAI_MODEL             Override the default OpenAI model
 *   SYSTEM_PROMPT            Override the default ggui-agent system prompt.
 *                            Set to `none` to disable entirely.
 *   OPENAI_API_KEY           Required. The agent fails-fast AT BOOT if absent.
 *
 * Adding another MCP server: one entry below + one env var.
 *
 * Auto-loads `.env.local` walking up from this file, so a workspace-
 * root `.env.local` is picked up without explicit sourcing. External
 * devs cloning the sample drop their `.env.local` next to package.json
 * and it's found the same way.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { AuthAdapter, McpServerConfig } from '@ggui-ai/agent-server';
import { AINDER_SYSTEM_PROMPT } from './ainder-system-prompt.js';
import { createCookieSessionAuth, startServer } from './server.js';

function findEnvLocal(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.env.local');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const here = dirname(fileURLToPath(import.meta.url));
const envPath = findEnvLocal(here);
if (envPath) {
  loadDotenv({ path: envPath });
  console.log(`[ainder-agent] loaded ${envPath}`);
}

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' ||
  process.env.AINDER_ENV === 'production' ||
  process.env.RAILWAY_ENVIRONMENT_NAME === 'production';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required${IS_PRODUCTION ? ' in production' : ''}.`);
  return value;
}

function optionalUrl(name: string, fallback?: string): string | undefined {
  const value = process.env[name]?.trim() || fallback;
  if (!value) return undefined;
  const parsed = new URL(value);
  if (IS_PRODUCTION && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
    throw new Error(`${name} must not point at localhost in production.`);
  }
  return parsed.toString();
}

function parseOrigins(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => new URL(item).origin),
  );
}

function resolveMcpServers(): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};
  const gguiUrl = optionalUrl('GGUI_MCP_URL', IS_PRODUCTION ? undefined : 'http://localhost:6781/mcp');
  if (gguiUrl) servers.ggui = { url: gguiUrl };

  const ainderUrl = optionalUrl('GGUI_AINDER_MCP_URL', IS_PRODUCTION ? undefined : 'http://localhost:6782/mcp');
  if (ainderUrl) servers.ainder = { url: ainderUrl };

  if (!IS_PRODUCTION) {
    for (const [key, url] of Object.entries(process.env)) {
      const match = /^GGUI_(.+)_MCP_URL$/.exec(key);
      if (match && url) servers[match[1].toLowerCase()] = { url };
    }
  }

  if (!servers.ggui) throw new Error('GGUI_MCP_URL is required.');
  if (IS_PRODUCTION && !servers.ainder) throw new Error('GGUI_AINDER_MCP_URL is required in production.');
  return servers;
}

function resolveAuth(): AuthAdapter | undefined {
  if (!IS_PRODUCTION) return undefined;
  const allowedOrigins = parseOrigins(requiredEnv('AINDER_ALLOWED_ORIGINS'));
  return createCookieSessionAuth({
    sessionSecret: requiredEnv('AINDER_SESSION_SECRET'),
    userId: requiredEnv('AINDER_BOOTSTRAP_USER_ID'),
    passwordHash: requiredEnv('AINDER_BOOTSTRAP_PASSWORD_HASH'),
    storeFile: process.env.AINDER_SESSION_STORE_FILE?.trim() || '.data/agent-sessions.json',
    secureCookies: true,
    allowedOrigins,
  });
}

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`\n[ainder-agent] ${name} is required.\n`);
    process.exit(1);
  }
  return value;
}

function assertNotLocalhost(name: string, value: string): void {
  if (/^https?:\/\/(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::|\/|$)/i.test(value)) {
    console.error(`\n[ainder-agent] ${name} must not point at localhost in production.\n`);
    process.exit(1);
  }
}

requireEnv('OPENAI_API_KEY');

if (IS_PRODUCTION) {
  requireEnv('AINDER_ALLOWED_ORIGINS');
  requireEnv('AINDER_SESSION_SECRET');
}
const ALLOWED_ORIGINS = (process.env.AINDER_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const PORT = Number(process.env.PORT ?? (IS_PRODUCTION ? '' : 6790));
if (!Number.isFinite(PORT) || PORT <= 0) {
  console.error('\n[ainder-agent] PORT is required in production and must be a positive number.\n');
  process.exit(1);
}
const SANDBOX_PROXY_PORT = process.env.SANDBOX_PROXY_PORT
  ? Number(process.env.SANDBOX_PROXY_PORT)
  : IS_PRODUCTION
    ? undefined
    : 7791;
const MODEL = process.env.OPENAI_MODEL;
const SYSTEM_PROMPT_ENV = process.env.SYSTEM_PROMPT;
const systemPrompt =
  SYSTEM_PROMPT_ENV === 'none'
    ? null
    : SYSTEM_PROMPT_ENV !== undefined
      ? SYSTEM_PROMPT_ENV
      : AINDER_SYSTEM_PROMPT;

// MCP servers the agent can call into. Production requires explicit endpoints;
// local development keeps the documented localhost convenience default.
const gguiMcpUrl = process.env.GGUI_MCP_URL ?? (IS_PRODUCTION ? '' : 'http://localhost:6781/mcp');
if (!gguiMcpUrl) {
  console.error('\n[ainder-agent] GGUI_MCP_URL is required in production.\n');
  process.exit(1);
}
if (IS_PRODUCTION) assertNotLocalhost('GGUI_MCP_URL', gguiMcpUrl);

const mcpServers: Record<string, McpServerConfig> = {
  ggui: { url: gguiMcpUrl },
};
for (const [key, url] of Object.entries(process.env)) {
  const match = /^GGUI_(.+)_MCP_URL$/.exec(key);
  if (match && url) {
    if (IS_PRODUCTION) assertNotLocalhost(key, url);
    mcpServers[match[1].toLowerCase()] = { url };
  }
}

startServer({
  port: PORT,
  sandboxProxyPort: SANDBOX_PROXY_PORT,
  mcpServers,
  allowedOrigins: ALLOWED_ORIGINS,
  sessionSecret: process.env.AINDER_SESSION_SECRET,
  ...(MODEL ? { model: MODEL } : {}),
  ...(systemPrompt !== undefined ? { systemPrompt } : {}),
}).catch((err: unknown) => {
  console.error('[sample-agent] failed to start:', err);
  process.exit(1);
}
