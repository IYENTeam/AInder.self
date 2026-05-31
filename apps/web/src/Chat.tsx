import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useMcpAppsChat } from '@ggui-ai/react/chat-helpers';
import {
  URL_CHAT_PARAM,
  hasCookieSession,
  loginWithCookieSession,
  logoutCookieSession,
} from './AinderSession';
import { AgentConsole } from './AgentConsole';
import { AuthGate } from './AuthGate';
import type { AuthState, LayoutMode } from './chatTypes';

interface ChatProps {
  readonly agentEndpoint: string;
  readonly sandboxUrl: string;
}

export function Chat({ agentEndpoint, sandboxUrl }: ChatProps) {
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [loginUserId, setLoginUserId] = useState(
    import.meta.env.DEV ? 'demo' : '',
  );
  const [loginPassword, setLoginPassword] = useState(
    import.meta.env.DEV ? 'demo' : '',
  );
  const [loginError, setLoginError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [layout, setLayout] = useState<LayoutMode>('panel');
  const historyRef = useRef<HTMLDivElement | null>(null);

  const getAuthToken = useCallback(() => undefined, []);
  const onUnauthenticated = useCallback(async (): Promise<boolean> => {
    setAuthState('unauthenticated');
    setCsrfToken(null);
    return false;
  }, []);

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
          setAuthState(
            session.authenticated ? 'authenticated' : 'unauthenticated',
          );
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

  const {
    entries,
    renders,
    hostDisplayMode,
    sending,
    send,
    handleAppMessage,
    abort,
  } = useMcpAppsChat({
    chatEndpoint: `${agentEndpoint}/agent`,
    ...(chatId !== undefined ? { chatId } : {}),
    onChatAllocated,
    getAuthToken,
    onUnauthenticated,
  });

  useEffect(() => {
    if (hostDisplayMode === undefined) return;
    setLayout(hostDisplayMode === 'inline' ? 'inline' : 'panel');
  }, [hostDisplayMode]);

  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [entries.length]);

  const resetConversation = useCallback(() => {
    abort();
    const url = new URL(window.location.href);
    url.searchParams.delete(URL_CHAT_PARAM);
    window.history.replaceState({}, '', url.toString());
    setChatId(undefined);
  }, [abort]);

  const launchPrompt = useCallback(
    (text: string) => {
      if (sending) return;
      void send(text);
    },
    [send, sending],
  );

  const onLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    try {
      const token = await loginWithCookieSession(
        agentEndpoint,
        loginUserId,
        loginPassword,
      );
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
    resetConversation();
    setCsrfToken(null);
    setAuthState('unauthenticated');
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || sending) return;
    setPrompt('');
    void send(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  if (authState !== 'authenticated') {
    return (
      <AuthGate
        authState={authState}
        loginUserId={loginUserId}
        loginPassword={loginPassword}
        loginError={loginError}
        onUserIdChange={setLoginUserId}
        onPasswordChange={setLoginPassword}
        onSubmit={onLoginSubmit}
      />
    );
  }

  return (
    <AgentConsole
      agentEndpoint={agentEndpoint}
      sandboxUrl={sandboxUrl}
      entries={entries}
      renders={renders}
      sending={sending}
      prompt={prompt}
      layout={layout}
      historyRef={historyRef}
      getAuthToken={getAuthToken}
      onAppMessage={handleAppMessage}
      onPromptChange={setPrompt}
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      onAbort={abort}
      onLogout={onLogout}
      onLaunchPrompt={launchPrompt}
      onResetConversation={resetConversation}
      onSetLayout={setLayout}
    />
  );
}
