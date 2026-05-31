const API_PREFIX = '/api';
const API_ORIGIN = 'https://api-ainder.iyen.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      return proxyApiRequest(request, url);
    }
    return env.ASSETS.fetch(request);
  },
};

function proxyApiRequest(request, url) {
  const upstream = new URL(url);
  upstream.protocol = 'https:';
  upstream.hostname = new URL(API_ORIGIN).hostname;
  upstream.pathname = upstream.pathname.slice(API_PREFIX.length) || '/';

  const headers = new Headers(request.headers);
  headers.set('host', upstream.hostname);

  return fetch(upstream, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'manual',
  });
}
