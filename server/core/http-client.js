// fetch com timeout, tentativas e cache curto em memória.
import { log } from './logger.js';

const cache = new Map();

export async function fetchWithTimeout(url, { timeout = 12000, headers = {}, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { 'User-Agent': 'Mozilla/5.0 (JARVIS assistente pessoal)', Accept: '*/*', ...headers },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
    return res;
  } catch (err) {
    const reason = err.name === 'AbortError' ? `timeout (${timeout}ms)` : err.message;
    log.warn('api', `Falha ao acessar ${new URL(url).host}: ${reason}`);
    throw new Error(reason);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cache temporário. `ttlMs` curto para dados sensíveis ao tempo. O valor
 * retornado traz `fetchedAt`, para a interface nunca apresentar dado antigo
 * como atual.
 */
export async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return { ...hit.value, fromCache: true };
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return { ...value, fromCache: false };
}

export function clearHttpCache() { cache.clear(); }

let lastOnlineCheck = { at: 0, online: null };
/** Verifica conectividade de internet (cache de 30s). */
export async function isOnline() {
  if (Date.now() - lastOnlineCheck.at < 30000 && lastOnlineCheck.online !== null) return lastOnlineCheck.online;
  let online = false;
  for (const url of ['https://www.gstatic.com/generate_204', 'https://api.anthropic.com/', 'https://raw.githubusercontent.com/']) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
      online = true;
      break;
    } catch { /* tenta o próximo */ }
  }
  lastOnlineCheck = { at: Date.now(), online };
  return online;
}
