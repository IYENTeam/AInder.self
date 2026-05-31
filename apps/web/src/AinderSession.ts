export const URL_CHAT_PARAM = 'chat';

export async function hasCookieSession(agentEndpoint: string): Promise<{
  readonly authenticated: boolean;
  readonly csrfToken: string | null;
}> {
  const res = await fetch(`${agentEndpoint}/auth/me`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return { authenticated: false, csrfToken: null };
  const body = (await res.json()) as {
    readonly authenticated?: unknown;
    readonly csrfToken?: unknown;
  };
  return {
    authenticated: body.authenticated === true,
    csrfToken:
      typeof body.csrfToken === 'string' && body.csrfToken.length > 0
        ? body.csrfToken
        : null,
  };
}

export async function loginWithCookieSession(
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
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  const body = (await res.json()) as { readonly csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string' || body.csrfToken.length === 0) {
    throw new Error('login succeeded without csrf token');
  }
  return body.csrfToken;
}

export async function logoutCookieSession(
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

export function getInitialChatId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const fromUrl = new URL(window.location.href).searchParams.get(
    URL_CHAT_PARAM,
  );
  return fromUrl && fromUrl.length > 0 ? fromUrl : undefined;
}
