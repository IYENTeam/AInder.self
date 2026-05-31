import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config for the ggui-basic-web reference SPA.
 *
 * Posture:
 *
 *   - Pure SPA (no SSR, no file-system routing) — this app is presentation
 *     only and talks to a separate MCP-Apps-spec agent backend over HTTP.
 *     That backend (oss/samples/agents/*) is the only server in the loop;
 *     this frontend never proxies, never owns secrets, never runs server
 *     code. Vite is the right tool for that posture; Next.js's file-system
 *     routing + server components + middleware would falsely signal
 *     "colocate server logic here".
 *
 *   - Port resolution: `VITE_SERVER_PORT` (the e2e harness's explicit
 *     contract — worker 0 → 6890, 1 → 6990, 2 → 7090) takes priority, then
 *     `PORT` (what a deploy host like Railway injects), then 6890.
 *     `strictPort` so a collision FAILS LOUD instead of silently moving on.
 *
 *   - `preview` (the production serve — `vite build && vite preview`) binds
 *     all interfaces and accepts the platform-assigned Host, so the built SPA
 *     is reachable behind a deploy host such as Railway (`*.up.railway.app`).
 *     Vite 6 otherwise blocks unknown Hosts in preview ("Blocked request").
 *     The dev `server` stays loopback-only.
 *
 *   - No `transpilePackages` equivalent needed: Vite walks workspace
 *     symlinks natively and the @ggui-ai/* packages ship usable ESM.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = Number(env.VITE_SERVER_PORT ?? env.PORT ?? 6890);
  const agentEndpoint = env.VITE_AGENT_ENDPOINT_URL?.trim();

  if (command === 'build' && mode === 'production') {
    if (!agentEndpoint) {
      throw new Error('VITE_AGENT_ENDPOINT_URL is required for production builds.');
    }
    const parsed = new URL(agentEndpoint);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      throw new Error('VITE_AGENT_ENDPOINT_URL must not point at localhost in production.');
    }
  }

  return {
    plugins: [react()],
    server: {
      port: serverPort,
      strictPort: true,
      host: '127.0.0.1',
    },
    preview: {
      port: serverPort,
      strictPort: true,
      host: true,
      allowedHosts: true,
    },
    build: {
      target: 'es2023',
      sourcemap: true,
    },
  };
});
