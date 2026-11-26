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

/**
 * POST com resposta em pedaços (uma linha JSON por evento): chama onToken(trecho)
 * enquanto a IA escreve e devolve o resultado final. Prazo por inatividade.
 */
export async function postStream(url, body, onToken, { idleMs = 120000 } = {}) {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), idleMs);
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), idleMs); };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token() ? { 'X-Jarvis-Token': token() } : {}) }, body: JSON.stringify(body), signal: ctrl.signal });
    if (res.status === 401) return request('POST', url.replace(/\/stream$/, ''), body, { timeout: idleMs });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.error || `Erro ${res.status}`), { status: res.status });
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = ''; let result = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      touch();
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt; try { evt = JSON.parse(line); } catch { continue; }
        if (evt.type === 'token') onToken?.(evt.text);
        else if (evt.type === 'done') result = evt.result;
        else if (evt.type === 'error') throw new Error(evt.error);
      }
    }
    if (!result) throw new Error('Resposta incompleta do servidor.');
    return result;
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
  postStream,
};

/** Eventos em tempo real do servidor (SSE). Reconecta sozinho. */
export function serverEvents(onEvent) {
  if (!('EventSource' in window)) return;
  const t = token();
  const es = new EventSource(`/api/events${t ? `?token=${encodeURIComponent(t)}` : ''}`);
  es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
  return es;
}
