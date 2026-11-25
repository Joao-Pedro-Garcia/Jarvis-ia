// fetch com timeout, tentativas e cache curto em memória.
import { log } from './logger.js';
import { bus, EVENTS } from './events.js';

const cache = new Map();

export async function fetchWithTimeout(url, { timeout = 12000, headers = {}, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { 'User-Agent': 'JARVIS-assistente-pessoal/2.0 (uso pessoal; Node.js)', Accept: '*/*', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
    return res;
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timeout (${timeout}ms)` : err.message;
    log.warn('api', `Falha ao acessar ${new URL(url).host}: ${reason}`);
    bus.emitEvent(EVENTS.API_FAILURE, { host: new URL(url).host, reason });
    throw new Error(reason);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cache temporário. `ttlMs` curto para dados sensíveis ao tempo. O valor
 * retornado traz `fetchedAt`, para a interface nunca apresentar dado antigo
 * como atual.
 * Falhas (`ok === false` ou `failed: true`) ficam no cache só por `failTtlMs`
 * (padrão 60 s): uma queda momentânea não bloqueia novas tentativas por horas.
 */
export async function cached(key, ttlMs, loader, { failTtlMs = 60000 } = {}) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.failed ? Math.min(failTtlMs, ttlMs) : ttlMs)) return { ...hit.value, fromCache: true };
  const value = await loader();
  const failed = value?.ok === false || value?.failed === true;
  cache.set(key, { at: Date.now(), value, failed });
  return { ...value, fromCache: false };
}

export function clearHttpCache() { cache.clear(); lastOnlineCheck = { at: 0, online: null }; lastInternet = null; }

// ---------------------------------------------------------------- INTERNET
// Pontos de teste genéricos (não dependem de nenhuma API paga).
export const PROBES = [
  { id: 'google', url: 'https://www.gstatic.com/generate_204' },
  { id: 'cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace' },
  { id: 'github', url: 'https://raw.githubusercontent.com/' },
];
const SLOW_MS = 1500;

let lastOnlineCheck = { at: 0, online: null };
let lastInternet = null;

async function probe(p, timeout = 4000) {
  const t = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    await fetch(p.url, { method: 'HEAD', signal: ctrl.signal, redirect: 'manual' });
    return { id: p.id, ok: true, ms: Date.now() - t };
  } catch (err) {
    return { id: p.id, ok: false, ms: Date.now() - t, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally { clearTimeout(timer); }
}

/**
 * Estado da internet do servidor:
 *   online   — todos os pontos de teste responderam rápido
 *   limited  — só parte respondeu, ou a latência está alta
 *   offline  — nenhum respondeu
 * Cache de 30 s. `services` (opcional) acrescenta o estado das fontes externas.
 */
export async function internetStatus({ force = false } = {}) {
  if (!force && lastInternet && Date.now() - lastInternet.atMs < 30000) return lastInternet;
  const results = await Promise.all(PROBES.map((p) => probe(p)));
  const ok = results.filter((r) => r.ok);
  const latency = ok.length ? Math.min(...ok.map((r) => r.ms)) : null;
  const state = !ok.length ? 'offline' : ok.length < results.length || latency > SLOW_MS ? 'limited' : 'online';
  lastInternet = { state, online: ok.length > 0, latencyMs: latency, probes: results, at: new Date().toISOString(), atMs: Date.now() };
  lastOnlineCheck = { at: Date.now(), online: ok.length > 0 };
  return lastInternet;
}

export const INTERNET_LABEL = { online: 'ONLINE', limited: 'INTERNET LIMITADA', offline: 'OFFLINE' };

/** Verifica conectividade de internet (cache de 30s). */
export async function isOnline() {
  if (Date.now() - lastOnlineCheck.at < 30000 && lastOnlineCheck.online !== null) return lastOnlineCheck.online;
  return (await internetStatus({ force: true })).online;
}
