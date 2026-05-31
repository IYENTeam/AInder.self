/// <reference types="vite/client" />

/**
 * Typed Vite env vars. Browser-exposed values must not contain secrets.
 */
interface ImportMetaEnv {
  /**
   * MCP-Apps-spec agent backend base URL. Required for production builds;
   * local development may use the localhost fallback in App.tsx.
   */
  readonly VITE_AGENT_ENDPOINT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
