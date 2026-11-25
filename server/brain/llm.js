// CAMADA DE IA (AI PROVIDER). Escolha por variável de ambiente:
//   AI_PROVIDER = anthropic | openai | ollama | none   (padrão: anthropic se houver chave)
//   AI_API_KEY, AI_MODEL, AI_BASE_URL
// Compatível com a configuração antiga (ANTHROPIC_API_KEY / JARVIS_MODEL).
// Chaves ficam SOMENTE no servidor e nunca são enviadas ao navegador.
import { log } from '../core/logger.js';
import { bus, EVENTS } from '../core/events.js';
import { anthropicProvider } from './ai/anthropic.js';
import { openAICompatibleProvider } from './ai/openai-compatible.js';

const PROVIDERS = { anthropic: anthropicProvider, openai: openAICompatibleProvider, ollama: openAICompatibleProvider, 'openai-compatible': openAICompatibleProvider };
let lastError = null;
let lastOkAt = null;

export function provider() {
  const id = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  if (id === 'none') return null;
  return PROVIDERS[id] || null;
}

export const available = () => !!provider()?.configured();
export const model = () => provider()?.model() ?? null;

export function status() {
  const p = provider();
  return {
    configured: available(),
    provider: p ? (process.env.AI_PROVIDER || 'anthropic').toLowerCase() : 'none',
    providerName: p?.name ?? 'Nenhum',
    model: p?.model() ?? null,
    webSearch: !!p?.capabilities.webSearch && process.env.JARVIS_WEB_SEARCH !== '0',
    lastError, lastOkAt,
    invalidProvider: !!process.env.AI_PROVIDER && !p && process.env.AI_PROVIDER !== 'none',
  };
}

/** Chamada genérica. Retorna { text } ou lança erro com mensagem amigável. */
export async function complete({ system, messages, maxTokens = 1500, effort, webSearch = false, json = null, timeoutMs = 45000 }) {
  const p = provider();
  if (!p || !p.configured()) throw Object.assign(new Error('IA não configurada (defina AI_PROVIDER e AI_API_KEY no .env)'), { code: 'NO_KEY' });
  try {
    const out = await p.complete({ system, messages, maxTokens, effort, json, timeoutMs, webSearch: webSearch && p.capabilities.webSearch && process.env.JARVIS_WEB_SEARCH !== '0' });
    lastOkAt = new Date().toISOString();
    lastError = null;
    return out;
  } catch (err) {
    const msg = p.friendlyError(err);
    lastError = { message: msg, at: new Date().toISOString() };
    log.error('cerebro', `Falha na IA (${p.id}): ${msg}`);
    bus.emitEvent(EVENTS.LLM_ERROR, { message: msg });
    throw Object.assign(new Error(msg), { code: 'LLM_FAIL' });
  }
}

export async function completeJSON(opts) {
  const { text } = await complete(opts);
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(clean); } catch { throw new Error('Resposta da IA em formato inválido'); }
}

/** Teste real e barato da IA (usado pelo auto-diagnóstico). */
export async function ping() {
  const t = Date.now();
  const { text } = await complete({ system: 'Responda apenas: OK', messages: [{ role: 'user', content: 'ping' }], maxTokens: 300, effort: 'low', timeoutMs: 20000 });
  return { ok: /ok/i.test(text), ms: Date.now() - t };
}
