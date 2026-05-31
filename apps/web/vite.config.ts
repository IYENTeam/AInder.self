import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverPort = Number(env.VITE_SERVER_PORT ?? env.PORT ?? 6890);
  const isProductionBuild = mode === 'production';
  const agentEndpoint = env.VITE_AGENT_ENDPOINT_URL?.trim();

  if (isProductionBuild && !agentEndpoint) {
    throw new Error('VITE_AGENT_ENDPOINT_URL is required for production web builds.');
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
