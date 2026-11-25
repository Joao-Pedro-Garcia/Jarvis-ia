// Comunicação com o servidor (timeouts, token opcional, sem chaves no navegador).
const TOKEN_KEY = 'jarvis.token';
function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
export function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch {} }

export async function request(method, url, body, { timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token() ? { 'X-Jarvis-Token': token() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (res.status === 401) {
      const t = window.prompt('Este JARVIS exige um token de acesso. Digite o token:');
      if (t) { setToken(t.trim()); return request(method, url, body, { timeout }); }
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Erro ${res.status}`), { status: res.status });
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('O servidor demorou demais para responder.'), { timeout: true });
    if (err instanceof TypeError) throw Object.assign(new Error('Sem conexão com o servidor do JARVIS.'), { offline: true });
    throw err;
  } finally { clearTimeout(timer); }
}

export const api = {
  get: (u, o) => request('GET', u, null, o),
  post: (u, b, o) => request('POST', u, b || {}, o),
  put: (u, b) => request('PUT', u, b),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
};

/** Eventos em tempo real do servidor (SSE). Reconecta sozinho. */
export function serverEvents(onEvent) {
  if (!('EventSource' in window)) return;
  const t = token();
  const es = new EventSource(`/api/events${t ? `?token=${encodeURIComponent(t)}` : ''}`);
  es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
  return es;
}
