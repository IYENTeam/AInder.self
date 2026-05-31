/* eslint-disable no-console */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  AppRenderer,
  type RequestHandlerExtra,
} from '@ggui-ai/react';
import {
  useMcpAppsChat,
  type ChatEntry,
  type RenderRef,
  type ToolCallEntry,
  type UseMcpAppsChatResult,
} from '@ggui-ai/react/chat-helpers';
import type {
  CallToolRequest,
  CallToolResult,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * The hook's drop-in `<AppRenderer onMessage>` handler. The sample
 * stays ggui-protocol-agnostic for the `ui/message` path — it forwards
 * the guest message verbatim through this handler; the agent-server
 * backend is the sole party that recognizes + guards any `ai.ggui/*`
 * `_meta` keys.
 */
type AppMessageHandler = UseMcpAppsChatResult['handleAppMessage'];

type LayoutMode = 'inline' | 'panel';

interface ChatProps {
  /**
   * MCP-Apps-spec agent backend base URL (e.g. `http://localhost:6790`).
   * Wired into the `useMcpAppsChat` hook for the single `POST /agent`
   * endpoint (`kind:'chat'` for prompts, `kind:'tool-call'` for the
   * iframe → MCP relay) + `GET /agent?chatId=X` rehydration. The
   * frontend stays SDK-agnostic — the backend decides which LLM it
   * drives.
   */
  readonly agentEndpoint: string;
  /**
   * Sandbox-proxy origin (second-origin iframe host, per MCP-Apps spec).
   * Read by {@link App} from the `GET /` manifest's `sandboxProxyUrl`
   * field and threaded down here so a `<Chat>` mount always has a
   * resolved URL — no in-component loading state.
   */
  readonly sandboxUrl: string;
}

// The chat id is URL-resident so cross-tab links land on the same conversation.
// Auth is intentionally cookie/session based; the browser never mints or stores
// guest bearer tokens in production.
const URL_CHAT_PARAM = 'chat';

type AuthState = 'checking' | 'authenticated' | 'unauthenticated';



async function hasCookieSession(agentEndpoint: string): Promise<{
  authenticated: boolean;
  csrfToken: string | null;
}> {
  const res = await fetch(`${agentEndpoint}/auth/me`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { authenticated: false, csrfToken: null };
  const body = (await res.json()) as { authenticated?: unknown; csrfToken?: unknown };
  return {
    authenticated: body.authenticated === true,
    csrfToken: typeof body.csrfToken === 'string' && body.csrfToken.length > 0 ? body.csrfToken : null,
  };
}

async function loginWithCookieSession(
  agentEndpoint: string,
  userId: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${agentEndpoint}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
  if (!res.ok) {
    throw new Error(`login failed (${res.status})`);
  }
  const body = (await res.json()) as { csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string' || body.csrfToken.length === 0) {
    throw new Error('login succeeded without csrf token');
  }
  return body.csrfToken;
}

async function logoutCookieSession(
  agentEndpoint: string,
  csrfToken: string | null,
): Promise<void> {
  await fetch(`${agentEndpoint}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
  });
}

/**
 * Read the URL `?chat=<id>` — returns the chatId when present so the
 * hook rehydrates that specific conversation, else `undefined` so the
 * server allocates a fresh id on the first POST.
 */
function getInitialChatId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const fromUrl = new URL(window.location.href).searchParams.get(
    URL_CHAT_PARAM,
  );
  return fromUrl && fromUrl.length > 0 ? fromUrl : undefined;
}

/**
 * Chat panel + iframe area for an MCP-Apps-spec agent backend.
 *
 * Auth: secure cookie + server-side session. The browser shell does not
 * bootstrap guest identity or persist bearer credentials; session creation,
 * revocation, and audit live on the backend.
 */
export function Chat({ agentEndpoint, sandboxUrl }: ChatProps) {

  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [loginUserId, setLoginUserId] = useState(import.meta.env.DEV ? 'demo' : '');
  const [loginPassword, setLoginPassword] = useState(import.meta.env.DEV ? 'demo' : '');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const getAuthToken = useCallback(() => undefined, []);

  const onUnauthenticated = useCallback(async (): Promise<boolean> => {
    setAuthState('unauthenticated');
    setCsrfToken(null);
    return false;
  }, []);

  // Stamp the server-allocated chatId into URL + state once
  // received. Quiet when the URL already carries the right id (this
  // covers the rehydration path).
  const onChatAllocated = useCallback((allocated: string) => {
    setChatId((prev) => {
      if (prev === allocated) return prev;
      const url = new URL(window.location.href);
      url.searchParams.set(URL_CHAT_PARAM, allocated);
      window.history.replaceState({}, '', url.toString());
      return allocated;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const originalFetch = window.fetch.bind(window);
    const normalizedAgentEndpoint = agentEndpoint.replace(/\/$/, '');
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (requestUrl.startsWith(normalizedAgentEndpoint)) {
        const headers = new Headers(init?.headers ?? undefined);
        if (!headers.has('x-csrf-token') && csrfToken) {
          headers.set('x-csrf-token', csrfToken);
        }
        return originalFetch(input, {
          ...init,
          headers,
          credentials: init?.credentials ?? 'include',
        });
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [agentEndpoint, csrfToken]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await hasCookieSession(agentEndpoint);
        if (!cancelled) {
          setAuthState(session.authenticated ? 'authenticated' : 'unauthenticated');
          setCsrfToken(session.csrfToken);
        }
      } catch (err) {
        if (!cancelled) {
          setAuthState('unauthenticated');
          setCsrfToken(null);
          setLoginError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentEndpoint]);

  const { entries, renders, hostDisplayMode, sending, send, handleAppMessage, abort } =
    useMcpAppsChat({
      chatEndpoint: `${agentEndpoint}/agent`,
      // Disable mount-time snapshot fetch for stale URL chat ids; the local
      // tunnel backend currently keeps snapshots in-memory, so browser URLs can
      // outlive the backend process and create noisy 404s.
      ...(chatId !== undefined ? { chatId } : {}),
      onChatAllocated,
      getAuthToken,
      onUnauthenticated,
    });

  const [prompt, setPrompt] = useState('');
  // Default to panel (side-pane) layout; the agent's `hostDisplayMode`
  // hint (if any) still overrides via the effect below.
  const [layout, setLayout] = useState<LayoutMode>('panel');
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hostDisplayMode === undefined) return;
    setLayout(hostDisplayMode === 'inline' ? 'inline' : 'panel');
  }, [hostDisplayMode]);

  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [entries.length]);

  const newSession = useCallback(() => {
    // Stop any in-flight stream so its tail doesn't bleed into the fresh
    // conversation, then drop the URL chat param + local state. Clearing
    // `chatId` makes useMcpAppsChat reset entries/renders; the next POST
    // allocates a fresh server-side chatId, which lands via
    // onChatAllocated.
    abort();
    const url = new URL(window.location.href);
    url.searchParams.delete(URL_CHAT_PARAM);
    window.history.replaceState({}, '', url.toString());
    setChatId(undefined);
  }, [abort]);

  const onLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const token = await loginWithCookieSession(agentEndpoint, loginUserId, loginPassword);
      setCsrfToken(token);
      setAuthState('authenticated');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err));
      setAuthState('unauthenticated');
      setCsrfToken(null);
    }
  };

  const onLogout = async () => {
    await logoutCookieSession(agentEndpoint, csrfToken);
    abort();
    const url = new URL(window.location.href);
    url.searchParams.delete(URL_CHAT_PARAM);
    window.history.replaceState({}, '', url.toString());
    setChatId(undefined);
    setCsrfToken(null);
    setAuthState('unauthenticated');
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || sending) return;
    setPrompt('');
    void send(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      (e.currentTarget.form as HTMLFormElement).requestSubmit();
    }
  };

  if (authState === 'checking') {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#bbb' }}>
        세션을 확인하는 중…
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b1020',
          color: '#f4f7ff',
          fontFamily: 'system-ui',
          padding: 24,
        }}
      >
        <form
          onSubmit={onLoginSubmit}
          style={{
            width: '100%',
            maxWidth: 360,
            display: 'grid',
            gap: 12,
            padding: 24,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24 }}>AInder 로그인</h1>
          <p style={{ margin: 0, color: '#9fb0d0', fontSize: 14 }}>
            프로덕션 하드닝 단계의 secure session 로그인 게이트입니다.
          </p>
          <input
            value={loginUserId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginUserId(e.target.value)}
            placeholder="user id"
            autoComplete="username"
            style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #334', background: '#121936', color: '#fff' }}
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setLoginPassword(e.target.value)}
            placeholder="password"
            autoComplete="current-password"
            style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #334', background: '#121936', color: '#fff' }}
          />
          {loginError ? (
            <div style={{ color: '#ff8a8a', fontSize: 13 }}>{loginError}</div>
          ) : null}
          <button
            type="submit"
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: 0,
              background: '#5b7cff',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            로그인
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`layout layout-${layout}`}>
      <aside className="chat">
        <header>
          <div className="title">
            <h1>Agent Chat</h1>
            <p className="subtitle">MCP Apps · ggui</p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="new-session"
              onClick={newSession}
              title="Start a fresh conversation"
              data-testid="new-session"
            >
              + New
            </button>
            <div className="layout-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                className={layout === 'inline' ? 'active' : ''}
                onClick={() => setLayout('inline')}
                data-testid="layout-inline"
              >
                Inline
              </button>
              <button
                type="button"
                className={layout === 'panel' ? 'active' : ''}
                onClick={() => setLayout('panel')}
                data-testid="layout-panel"
              >
                Panel
              </button>
            </div>
            <button
              type="button"
              className="new-session"
              onClick={onLogout}
              title="Log out"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="history" ref={historyRef} role="log" aria-live="polite">
          {entries.length === 0 ? <EmptyState /> : null}
          {entries.map((entry) => (
            <ChatEntryView
              key={entry.id}
              entry={entry}
              renderInline={layout === 'inline'}
              sandboxUrl={sandboxUrl}
              agentEndpoint={agentEndpoint}
              getAuthToken={getAuthToken}
              onAppMessage={handleAppMessage}
            />
          ))}
        </div>

        <form onSubmit={onSubmit}>
          <textarea
            name="prompt"
            placeholder="Ask the agent to render a UI…    (Shift+Enter for newline)"
            rows={1}
            autoFocus
            value={prompt}
            disabled={sending}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              setPrompt(e.target.value)
            }
            onKeyDown={onKeyDown}
          />
          <button
            type={sending ? 'button' : 'submit'}
            disabled={!sending && !prompt.trim()}
            onClick={sending ? abort : undefined}
            aria-label={sending ? 'Stop' : 'Send'}
            title={sending ? 'Stop' : 'Send'}
          >
            {sending ? (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: 'currentColor',
                  borderRadius: 2,
                }}
              />
            ) : (
              'Send'
            )}
          </button>
        </form>
      </aside>

      {layout === 'panel' ? (
        <main className="ui-pane">
          <PanelView
            renders={renders}
            sandboxUrl={sandboxUrl}
            agentEndpoint={agentEndpoint}
            getAuthToken={getAuthToken}
            onAppMessage={handleAppMessage}
          />
        </main>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-mark">⌘</div>
      <h2>Generate a UI</h2>
      <p>Type a prompt below — the agent renders interactive UI inline.</p>
      <div className="empty-state-examples">
        <code>weather card for Berlin</code>
        <code>feedback form with a rating</code>
        <code>counter that starts at 0</code>
      </div>
    </div>
  );
}

function ChatEntryView({
  entry,
  renderInline,
  sandboxUrl,
  agentEndpoint,
  getAuthToken,
  onAppMessage,
}: {
  entry: ChatEntry;
  renderInline: boolean;
  sandboxUrl: string;
  agentEndpoint: string;
  getAuthToken: () => string | undefined;
  onAppMessage: AppMessageHandler;
}) {
  if (entry.kind === 'render') {
    if (renderInline) {
      return (
        <div className="msg render-wrap">
          <ResourceFrame
            item={entry.render}
            sandboxUrl={sandboxUrl}
            agentEndpoint={agentEndpoint}
            getAuthToken={getAuthToken}
            onAppMessage={onAppMessage}
          />
        </div>
      );
    }
    return (
      <div className="msg tool">
        ← UI · {shortLabel(entry.render)}
      </div>
    );
  }
  if (entry.kind === 'end') {
    return (
      <div className="msg turn-end" data-testid="turn-end">
        turn ended · {entry.subtype}
      </div>
    );
  }
  if (entry.kind === 'tool-call') {
    return <ToolCallView entry={entry} />;
  }
  return <div className={`msg ${entry.kind}`}>{entry.text}</div>;
}

function ToolCallView({ entry }: { entry: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  const shortName = entry.name.replace(/^mcp__[^_]+__/, '');
  const pending = entry.result === undefined && entry.isError !== true;
  const status = entry.isError ? 'error' : pending ? 'pending' : 'ok';
  return (
    <div className={`msg tool-call tool-call-${status}`}>
      <button
        type="button"
        className="tool-call-header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tool-call-chevron">{open ? '▾' : '▸'}</span>
        <span className="tool-call-name">{shortName}</span>
        <span className={`tool-call-status tool-call-status-${status}`}>
          {pending ? '…' : entry.isError ? 'error' : 'ok'}
        </span>
      </button>
      {open ? (
        <div className="tool-call-body">
          <div className="tool-call-section">
            <div className="tool-call-section-label">input</div>
            <pre className="tool-call-json">{prettyJson(entry.input)}</pre>
          </div>
          <div className="tool-call-section">
            <div className="tool-call-section-label">
              {entry.isError ? 'error result' : 'result'}
            </div>
            <pre className="tool-call-json">
              {entry.result === undefined
                ? '(awaiting)'
                : prettyJson(entry.result)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function PanelView({
  renders,
  sandboxUrl,
  agentEndpoint,
  getAuthToken,
  onAppMessage,
}: {
  renders: ReadonlyArray<RenderRef>;
  sandboxUrl: string;
  agentEndpoint: string;
  getAuthToken: () => string | undefined;
  onAppMessage: AppMessageHandler;
}) {
  const top = useMemo(() => renders[renders.length - 1], [renders]);
  if (!top) {
    return (
      <div className="ui-placeholder">
        <p>The rendered UI will appear here once the agent emits one.</p>
      </div>
    );
  }
  return (
    <div className="panel-frame">
      <ResourceFrame
        item={top}
        sandboxUrl={sandboxUrl}
        agentEndpoint={agentEndpoint}
        getAuthToken={getAuthToken}
        onAppMessage={onAppMessage}
        fillContainer
      />
    </div>
  );
}

/**
 * Render one MCP-Apps resource. Mounts straight from the inlined
 * resource `@ggui-ai/agent-server`'s tool-result interceptor stamped
 * on `_meta.ui.resource` (zero-round-trip mount). On rehydration the
 * `GET /agent` replay re-inlines each render FRESH from the MCP, so
 * the inlined HTML always reflects current server state. When no
 * inlined HTML is present (a render that no longer resolves), the
 * frame shows a small "not inlined" notice rather than fetching.
 */
function ResourceFrame({
  item,
  sandboxUrl,
  agentEndpoint,
  getAuthToken,
  fillContainer = false,
  onAppMessage,
}: {
  item: RenderRef;
  sandboxUrl: string;
  agentEndpoint: string;
  getAuthToken: () => string | undefined;
  fillContainer?: boolean;
  onAppMessage?: AppMessageHandler;
}) {
  // Inlined resource ride-along from the library's interceptor wins.
  // No fetch needed — render straight from `inlinedResource.text`.
  const html = item.inlinedResource?.text;
  const inlinedCsp = item.inlinedResource?.csp;

  const sandbox = useMemo(() => {
    if (!inlinedCsp) return { url: new URL(sandboxUrl) };
    // SandboxConfig wants mutable string[] arrays; the RenderRef
    // shape keeps them readonly so reassignment doesn't leak. Copy
    // here at the boundary.
    const csp: {
      connectDomains?: string[];
      resourceDomains?: string[];
    } = {};
    if (inlinedCsp.connectDomains) {
      csp.connectDomains = [...inlinedCsp.connectDomains];
    }
    if (inlinedCsp.resourceDomains) {
      csp.resourceDomains = [...inlinedCsp.resourceDomains];
    }
    return { url: new URL(sandboxUrl), csp };
  }, [sandboxUrl, inlinedCsp]);

  // Spec-canonical tools/call proxy. The iframe holds no MCP client
  // credential, so we relay through the agent backend's single
  // `POST /agent` endpoint with the `kind:'tool-call'` discriminator.
  const onCallTool = useCallback(
    async (
      params: CallToolRequest['params'],
      _extra: RequestHandlerExtra,
    ): Promise<CallToolResult> => {
      console.log('[ResourceFrame] tool_call', params);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const resp = await fetch(`${agentEndpoint}/agent`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            kind: 'tool-call',
            name: params.name,
            arguments: params.arguments ?? {},
          }),
        });
        if (!resp.ok) {
          console.warn('[ResourceFrame] relay non-2xx', resp.status);
          return { isError: true, content: [] };
        }
        const jsonRpc = (await resp.json()) as {
          readonly result?: CallToolResult;
          readonly error?: { readonly message?: string };
        };
        if (jsonRpc.error !== undefined) {
          console.warn('[ResourceFrame] relay error envelope', jsonRpc.error);
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: jsonRpc.error.message ?? 'relay error',
              },
            ],
          };
        }
        return jsonRpc.result ?? { content: [] };
      } catch (err) {
        console.warn('[ResourceFrame] relay transport error', err);
        return { isError: true, content: [] };
      }
    },
    [agentEndpoint, getAuthToken],
  );

  // The frontend's `onReadResource` callback shouldn't normally fire
  // any more — the library inlines the iframe HTML alongside every
  // tool result. Keep a defensive implementation that throws a
  // descriptive error, so any guest-initiated `resources/list-changed`
  // → re-read surfaces a clear message in dev tools rather than
  // hanging.
  const onReadResource = useCallback(
    async (
      params: ReadResourceRequest['params'],
      _extra: RequestHandlerExtra,
    ): Promise<ReadResourceResult> => {
      throw new Error(
        `[ResourceFrame] resources/read for ${params.uri} requested ` +
          `post-mount, but the host doesnt operate a relay endpoint. ` +
          `The agent-server library inlines resources on the FIRST tool ` +
          `result; guest-initiated re-reads need the host to add a custom ` +
          `relay (or upgrade to AppRenderer's built-in MCP client).`,
      );
    },
    [],
  );

  // No local `ui/message` parsing: the hook's `handleAppMessage`
  // joins the text + forwards the content block's `_meta` opaquely.
  // This sample stays ggui-protocol-agnostic — the agent-server backend
  // is the sole party that recognizes + guards `ai.ggui/*` keys.

  return (
    <div className="render">
      <div className="render-chrome">
        <span className="render-id">{shortLabel(item)}</span>
        <span className="render-action">{item.action}</span>
      </div>
      <div
        className="render-frame"
        style={fillContainer ? { flex: 1, minHeight: 0 } : undefined}
      >
        {html !== undefined ? (
          <AppRenderer
            key={item.resourceUri}
            toolName="ggui_render"
            sandbox={sandbox}
            html={html}
            onReadResource={onReadResource}
            onCallTool={onCallTool}
            {...(onAppMessage !== undefined ? { onMessage: onAppMessage } : {})}
            onError={(err) =>
              console.warn('[ResourceFrame] AppRenderer error', err)
            }
          />
        ) : (
          <div className="render-loading" aria-hidden="true">
            <p style={{ padding: 12, fontSize: 13, color: '#888' }}>
              Resource not inlined — the agent-server didn't pre-fetch the
              iframe HTML for <code>{item.resourceUri}</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function shortLabel(item: RenderRef): string {
  if (item.toolUseId !== undefined && item.toolUseId.length > 0) {
    return `#${item.toolUseId.slice(0, 12)}`;
  }
  const tail = item.resourceUri.split('/').filter(Boolean).pop() ?? '';
  return tail.length > 0 ? `#${tail.slice(0, 12)}` : '#render';
}
