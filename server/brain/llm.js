// CAMADA DE IA (AI PROVIDER). Escolha por variável de ambiente:
//   AI_PROVIDER = auto (padrão) | local | ollama | anthropic | openai | none
//     auto/local → procura uma IA LOCAL GRATUITA (Ollama, LM Studio, llama.cpp)
//                  no próprio computador; sem ela, modo local inteligente.
//     anthropic/openai → serviços online OPCIONAIS (exigem chave; podem ter custo).
//   AI_API_KEY, AI_MODEL, AI_BASE_URL
// Compatível com a configuração antiga (ANTHROPIC_API_KEY / JARVIS_MODEL).
// Chaves ficam SOMENTE no servidor e nunca são enviadas ao navegador.
import { log } from '../core/logger.js';
import { bus, EVENTS } from '../core/events.js';
import { anthropicProvider } from './ai/anthropic.js';
import { openAICompatibleProvider } from './ai/openai-compatible.js';
import { localProvider, detectLocal, localInfo, warmUp, benchmark as localBenchmark } from './ai/local.js';

/** Teste de velocidade da IA local (Ollama). */
export const benchmark = (list) => localBenchmark(list);

const CLOUD = { anthropic: anthropicProvider, openai: openAICompatibleProvider, 'openai-compatible': openAICompatibleProvider };
let lastError = null;
let lastOkAt = null;

/** Identificador efetivo do provedor. */
export function providerId() {
  const raw = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (raw) return raw;
  // Compatibilidade: uma chave antiga sem AI_PROVIDER continua valendo.
  return process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'auto';
}

export function provider() {
  const id = providerId();
  if (id === 'none') return null;
  if (id === 'auto' || id === 'local') return localProvider;
  // "ollama" com modelo definido: endereço fixo (comportamento da v2.0).
  if (id === 'ollama') return process.env.AI_MODEL ? openAICompatibleProvider : localProvider;
  return CLOUD[id] || null;
}

/** local | online | none */
export function kind() {
  const p = provider();
  if (!p || !p.configured()) return 'none';
  return p.local || providerId() === 'ollama' ? 'local' : 'online';
}

export const available = () => !!provider()?.configured();
export const model = () => provider()?.model() ?? null;
export const STATE_LABEL = { local: 'IA LOCAL', online: 'IA ONLINE', none: 'IA INDISPONÍVEL' };

export function status() {
  const p = provider();
  const id = providerId();
  const k = kind();
  const info = localInfo();
  return {
    configured: available(),
    kind: k,
    state: STATE_LABEL[k],
    provider: p ? id : 'none',
    providerName: p ? (p.displayName?.() ?? p.name) : 'Nenhum',
    model: p?.model() ?? null,
    free: k !== 'online',
    webSearch: !!p?.capabilities.webSearch && process.env.JARVIS_WEB_SEARCH !== '0',
    lastError, lastOkAt,
    localProbe: (id === 'auto' || id === 'local' || (id === 'ollama' && !process.env.AI_MODEL)) ? { detected: info.detected && { name: info.detected.name, model: info.detected.model, models: info.detected.models.length }, lastCheck: info.lastProbe?.at || null, reason: info.lastProbe?.error || null } : null,
    invalidProvider: !!process.env.AI_PROVIDER && !p && id !== 'none',
  };
}

let probing = null;
/** Para provedores locais: (re)detecta a IA local no máximo a cada 30 s. */
export async function refresh({ force = false } = {}) {
  const p = provider();
  if (p !== localProvider) return status();
  const last = localInfo().lastProbe?.at;
  if (force || !last || Date.now() - Date.parse(last) > 30000) {
    probing ??= detectLocal().then((d) => {
      if (d) {
        log.info('cerebro', `IA local detectada: ${d.name} · modelo ${d.model}`);
        // Pré-carrega o modelo em segundo plano (a primeira pergunta não espera o carregamento).
        warmUp().then((ok) => ok && log.info('cerebro', `Modelo ${d.model} carregado na memória`)).catch((e) => log.warn('cerebro', `Pré-carregamento do modelo falhou: ${e.message}`));
      }
      return d;
    }).finally(() => { probing = null; });
    await probing;
  }
  return status();
}

/** Chamada genérica. Retorna { text } ou lança erro com mensagem amigável. */
export async function complete({ system, messages, maxTokens = 1500, effort, webSearch = false, json = null, timeoutMs = 45000 }) {
  const p = provider();
  if (!p || !p.configured()) throw Object.assign(new Error('nenhuma IA disponível (instale uma IA local gratuita, como o Ollama, ou configure AI_PROVIDER no .env)'), { code: 'NO_KEY' });
  try {
    const out = await p.complete({ system, messages, maxTokens, effort, json, timeoutMs, webSearch: webSearch && p.capabilities.webSearch && process.env.JARVIS_WEB_SEARCH !== '0' });
    lastOkAt = new Date().toISOString();
    lastError = null;
    return out;
  } catch (err) {
    const msg = p.friendlyError(err);
    lastError = { message: msg, at: new Date().toISOString() };
    log.error('cerebro', `Falha na IA (${p.id}): ${msg}`);
    bus.emitEvent(EVENTS.API_FAILURE, { service: 'ia', message: msg });
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
