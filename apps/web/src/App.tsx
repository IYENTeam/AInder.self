import { useEffect, useState } from 'react';
import { ThemeProvider, getRawTheme } from '@ggui-ai/design/themes';
import {
  AinderConnectionState,
  AinderWorkspace,
} from './AinderWorkspace';
import { Chat } from './Chat';

/**
 * Public agent backend URL. Production fails closed: the backend must be
 * pinned at build time with `VITE_AGENT_ENDPOINT_URL`, and localhost/query
 * overrides are development-only conveniences for local harnesses.
 */
function resolveAgentEndpoint(): string {
  const configured = import.meta.env.VITE_AGENT_ENDPOINT_URL;
  if (typeof configured === 'string' && configured.length > 0) return configured;

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const fromUrl = new URL(window.location.href).searchParams.get('agent');
    if (fromUrl !== null && fromUrl.length > 0) return fromUrl;
  }

  if (import.meta.env.DEV) return 'http://localhost:6790';

  throw new Error(
    'VITE_AGENT_ENDPOINT_URL is required for production builds; refusing localhost fallback.',
  );
}

const AGENT_ENDPOINT = resolveAgentEndpoint();

const AINDER_THEME = getRawTheme('ggui', 'light');

export function App() {
  // Sandbox-proxy URL read once from the agent backend's `GET /`
  // manifest on mount. `<AppRenderer>` mandates a second-origin sandbox
  // host per MCP Apps spec; the sample backends auto-bind a
  // `sandbox.html` server on `agent_port + 1000` and surface the URL as
  // the manifest's `sandboxProxyUrl` field.
  //
  // We read instead of hardcoding so a backend running on a different
  // port (or a future backend without the bundled proxy) still drives
  // this frontend.
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${AGENT_ENDPOINT}/`, {
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;
        if (!res.ok) {
          setSandboxError(`backend returned ${res.status}`);
          return;
        }
        const body = (await res.json()) as {
          readonly sandboxProxyUrl?: unknown;
        };
        if (
          typeof body.sandboxProxyUrl !== 'string' ||
          body.sandboxProxyUrl.length === 0
        ) {
          setSandboxError('backend manifest missing sandboxProxyUrl');
          return;
        }
        setSandboxUrl(body.sandboxProxyUrl);
      } catch (err) {
        if (!cancelled) {
          setSandboxError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemeProvider theme={AINDER_THEME} mode="light">
      {sandboxUrl !== null ? (
        <AinderWorkspace>
          <Chat agentEndpoint={AGENT_ENDPOINT} sandboxUrl={sandboxUrl} />
        </AinderWorkspace>
      ) : sandboxError !== null ? (
        <AinderConnectionState
          agentEndpoint={AGENT_ENDPOINT}
          detail={sandboxError}
          status="error"
        />
      ) : (
        <AinderConnectionState
          agentEndpoint={AGENT_ENDPOINT}
          status="connecting"
        />
      )}
    </ThemeProvider>
  );
}
