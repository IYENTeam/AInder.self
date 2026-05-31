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

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`\n[ainder-agent] ${name} is required.\n`);
    process.exit(1);
  }
  return value;
}

function requireUrl(name: string, fallback: string | null): string {
  const raw = process.env[name]?.trim() || fallback;
  if (!raw) {
    console.error(`\n[ainder-agent] ${name} is required in production.\n`);
    process.exit(1);
  }
  const parsed = new URL(raw);
  if (
    IS_PRODUCTION &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
  ) {
    console.error(`\n[ainder-agent] ${name} must not point at localhost in production.\n`);
    process.exit(1);
  }
  return raw;
}

// Fail loud + early when the provider key is missing. The agent loop AND
// ggui's UI generation both need it; without it the agent would otherwise
// crash mid-request with a buried error. (The `pnpm dev` orchestrator runs
// the same check before booting — this also covers running the agent
// standalone or in a deploy.)
requireEnv('OPENAI_API_KEY');

const PORT = Number(process.env.PORT ?? 6790);
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
  ggui: {
    url: requireUrl('GGUI_MCP_URL', IS_PRODUCTION ? null : 'http://localhost:6781/mcp'),
  },
};
for (const [key, url] of Object.entries(process.env)) {
  const match = /^GGUI_(.+)_MCP_URL$/.exec(key);
  if (match && url) {
    mcpServers[match[1].toLowerCase()] = {
      url: requireUrl(key, null),
    };
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
