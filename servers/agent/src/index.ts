/* eslint-disable no-console */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import type { McpServerConfig } from '@ggui-ai/agent-server';
import { AINDER_SYSTEM_PROMPT } from './ainder-system-prompt.js';
import { createCookieSessionAuth, startServer } from './server.js';

function findEnvLocal(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
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

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[ainder-agent] ${name} is required${isProduction ? ' in production' : ''}.`);
    process.exit(1);
  }
  return value;
}

function optionalDevDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (!isProduction) return fallback;
  console.error(`[ainder-agent] ${name} is required in production; refusing localhost/sample default.`);
  process.exit(1);
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLocalhostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
  } catch {
    return false;
  }
}

function assertNotLocalhost(name: string, value: string): void {
  if (isLocalhostUrl(value)) {
    console.error(`[ainder-agent] ${name} must not point at localhost in production.`);
    process.exit(1);
  }
}

function hashBootstrapPassword(password: string): string {
  const salt = 'bootstrap-dev-salt';
  const derived = scryptSync(password, salt, 64).toString('base64url');
  return `scrypt:v1:${salt}:${derived}`;
}

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error(
    '\n[ainder-agent] OPENAI_API_KEY is not set — the agent loop and ggui UI generation both require it.\n',
  );
  process.exit(1);
}

if (isProduction) {
  requireEnv('AINDER_ALLOWED_ORIGINS');
  requireEnv('VITE_AGENT_ENDPOINT_URL');
  requireEnv('AINDER_SESSION_SECRET');
  requireEnv('AINDER_BOOTSTRAP_USER');
  requireEnv('AINDER_BOOTSTRAP_PASSWORD_HASH');
}

const PORT = Number(process.env.PORT ?? 6790);
const SANDBOX_PROXY_PORT = process.env.SANDBOX_PROXY_PORT ? Number(process.env.SANDBOX_PROXY_PORT) : 7791;
const MODEL = process.env.OPENAI_MODEL;
const SYSTEM_PROMPT_ENV = process.env.SYSTEM_PROMPT;
const systemPrompt =
  SYSTEM_PROMPT_ENV === 'none'
    ? null
    : SYSTEM_PROMPT_ENV !== undefined
      ? SYSTEM_PROMPT_ENV
      : AINDER_SYSTEM_PROMPT;

const allowedOrigins = new Set(parseCsv(process.env.AINDER_ALLOWED_ORIGINS));
const gguiMcpUrl = optionalDevDefault('GGUI_MCP_URL', 'http://localhost:6781/mcp');
if (isProduction) assertNotLocalhost('GGUI_MCP_URL', gguiMcpUrl);

const mcpServers: Record<string, McpServerConfig> = {
  ggui: { url: gguiMcpUrl },
  ainder: { url: optionalDevDefault('GGUI_AINDER_MCP_URL', 'http://localhost:6782/mcp') },
};
for (const [key, rawUrl] of Object.entries(process.env)) {
  const match = /^GGUI_(.+)_MCP_URL$/.exec(key);
  if (!match || !rawUrl) continue;
  const name = match[1].toLowerCase();
  if (name === 'mcp') continue;
  if (isProduction) assertNotLocalhost(key, rawUrl);
  mcpServers[name] = { url: rawUrl };
}

const bootstrapUser = process.env.AINDER_BOOTSTRAP_USER?.trim() || 'demo';
const bootstrapPasswordHash =
  process.env.AINDER_BOOTSTRAP_PASSWORD_HASH?.trim() ||
  hashBootstrapPassword(process.env.AINDER_BOOTSTRAP_PASSWORD?.trim() || 'demo');
const sessionSecret = process.env.AINDER_SESSION_SECRET?.trim() || randomBytes(32).toString('base64url');
const sessionStoreFile = process.env.AINDER_SESSION_STORE_PATH?.trim();
const authRateLimit = Number.parseInt(process.env.AINDER_AUTH_RATE_LIMIT ?? (isProduction ? '10' : '100'), 10);
const authRateWindowMs = Number.parseInt(process.env.AINDER_AUTH_RATE_WINDOW_MS ?? '60000', 10);

startServer({
  port: PORT,
  sandboxProxyPort: SANDBOX_PROXY_PORT,
  mcpServers,
  auth: createCookieSessionAuth({
    sessionSecret,
    userId: bootstrapUser,
    passwordHash: bootstrapPasswordHash,
    storeFile: sessionStoreFile,
    secureCookies: isProduction,
    allowedOrigins,
    authRateLimit,
    authRateWindowMs,
  }),
  ...(MODEL ? { model: MODEL } : {}),
  ...(systemPrompt !== undefined ? { systemPrompt } : {}),
}).catch((err: unknown) => {
  console.error('[ainder-agent] failed to start:', err);
  process.exit(1);
});
