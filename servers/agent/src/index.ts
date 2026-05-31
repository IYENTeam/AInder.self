/* eslint-disable no-console */
/**
 * Boot entry point — wires environment variables to the AInder HTTP agent.
 * Production intentionally fails closed on missing auth, origin, provider, and
 * MCP endpoint configuration; localhost/sample defaults are dev-only.
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

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error(
    '\n[ainder-agent] OPENAI_API_KEY is not set — the agent loop and ' +
      "ggui's UI generation both require it.\n" +
      '  Add it to .env.local (copy .env.example), then restart.\n',
  );
  process.exit(1);
}

try {
  const PORT = Number(process.env.PORT ?? 6790);
  const SANDBOX_PROXY_PORT = process.env.SANDBOX_PROXY_PORT
    ? Number(process.env.SANDBOX_PROXY_PORT)
    : 7791;
  const MODEL = process.env.OPENAI_MODEL ?? process.env.MODEL;
  const SYSTEM_PROMPT_ENV = process.env.SYSTEM_PROMPT;
  const systemPrompt =
    SYSTEM_PROMPT_ENV === 'none'
      ? null
      : SYSTEM_PROMPT_ENV !== undefined
        ? SYSTEM_PROMPT_ENV
        : AINDER_SYSTEM_PROMPT;
  const auth = resolveAuth();

  startServer({
    port: PORT,
    sandboxProxyPort: SANDBOX_PROXY_PORT,
    mcpServers: resolveMcpServers(),
    ...(MODEL ? { model: MODEL } : {}),
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(auth ? { auth } : {}),
  }).catch((err: unknown) => {
    console.error('[ainder-agent] failed to start:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('[ainder-agent] invalid configuration:', err);
  process.exit(1);
}
