import { useEffect, useState } from 'react';
import { ThemeProvider, getRawTheme } from '@ggui-ai/design/themes';
import { Chat } from './Chat';

/**
 * Public agent backend URL. Production bundles fail closed: they must be
 * built with an explicit non-localhost `VITE_AGENT_ENDPOINT_URL` and cannot
 * be retargeted with a query-string override. Local development may still use
 * `?agent=<url>` or the localhost default for worker/e2e convenience.
 */
function resolveAgentEndpoint(): string {
  const configured = import.meta.env.VITE_AGENT_ENDPOINT_URL?.trim();

  if (!import.meta.env.PROD && typeof window !== 'undefined') {
    const fromUrl = new URL(window.location.href).searchParams.get('agent');
    if (fromUrl !== null && fromUrl.length > 0) return fromUrl;
  }

  if (configured) {
    const parsed = new URL(configured);
    if (
      import.meta.env.PROD &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      throw new Error('Production VITE_AGENT_ENDPOINT_URL must not point at localhost.');
    }
    return parsed.toString().replace(/\/$/, '');
  }

  if (!import.meta.env.PROD) return 'http://localhost:6790';

  throw new Error('Production build requires VITE_AGENT_ENDPOINT_URL.');
}

const AGENT_ENDPOINT = resolveAgentEndpoint();

/**
 * Pair the chat shell with the SAME theme the iframe content uses
 * (canvas-demo's `ggui.json` sets `theme: indigo / dark`). `<ThemeProvider>`
 * expects the raw `DtcgTheme` token tree.
 */
const INDIGO_DARK = getRawTheme('indigo', 'dark');

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
    <ThemeProvider theme={INDIGO_DARK} mode="dark">
      {sandboxUrl !== null ? (
        <Chat agentEndpoint={AGENT_ENDPOINT} sandboxUrl={sandboxUrl} />
      ) : sandboxError !== null ? (
        <div style={{ padding: 24, color: '#c00', fontFamily: 'system-ui' }}>
          Failed to reach agent backend at <code>{AGENT_ENDPOINT}</code>:{' '}
          <strong>{sandboxError}</strong>
          <p style={{ marginTop: 12, fontSize: 13, color: '#666' }}>
            Confirm <code>VITE_AGENT_ENDPOINT_URL</code> points at a running
            MCP-Apps-spec backend (see <code>.env.example</code>).
          </p>
        </div>
      ) : (
        <div style={{ padding: 24, color: '#888', fontFamily: 'system-ui' }}>
          Connecting to agent at <code>{AGENT_ENDPOINT}</code>…
        </div>
      )}
    </ThemeProvider>
  );
}
