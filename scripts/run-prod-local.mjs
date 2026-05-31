import { spawn } from 'node:child_process';
import process from 'node:process';

const baseEnv = { ...process.env };
const procs = [];
function start(name, cmd, args, env) {
  const p = spawn(cmd, args, { env: { ...baseEnv, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p);
  p.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  p.on('exit', (code, signal) => {
    console.error(`[${name}] exited code=${code} signal=${signal}`);
    if (!shuttingDown) process.exit(code ?? 1);
  });
}
let shuttingDown = false;
function shutdown() {
  shuttingDown = true;
  for (const p of procs) p.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const openAiBaseUrl = baseEnv.OPENAI_BASE_URL ?? 'https://router.iyendev.com/v1';
const openAiModel = baseEnv.OPENAI_MODEL ?? 'gpt-5.5';
if (!baseEnv.OPENAI_API_KEY) {
  console.error('[runner] OPENAI_API_KEY is required');
  process.exit(1);
}

start('ainder-mcp', 'pnpm', ['--filter', './servers/mcps/todo', 'start'], { PORT: '6782' });
start('ggui', 'pnpm', ['--filter', './servers/ggui', 'start'], { PORT: '6781', GGUI_PUBLIC_BASE_URL: baseEnv.GGUI_PUBLIC_BASE_URL ?? 'https://ggui-ainder.iyen.io' });
start('agent', 'pnpm', ['--filter', './servers/agent', 'start'], {
  PORT: '6790',
  OPENAI_BASE_URL: openAiBaseUrl,
  OPENAI_MODEL: openAiModel,
  GGUI_MCP_URL: 'http://127.0.0.1:6781/mcp',
  GGUI_AINDER_MCP_URL: 'http://127.0.0.1:6782/mcp',
  SANDBOX_PROXY_PORT: '7791',
  SANDBOX_PROXY_PUBLIC_URL: 'https://sandbox-ainder.iyen.io',
});
console.log('[runner] started ainder local production stack');
