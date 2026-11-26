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
import { getSettings, updateSettings } from '../core/settings.js';
import { anthropicProvider } from './ai/anthropic.js';
import { openAICompatibleProvider } from './ai/openai-compatible.js';
import { localProvider, detectLocal, localInfo, warmUp, benchmark as localBenchmark } from './ai/local.js';
import { groqProvider, shouldFallback } from './ai/groq.js';

/** Teste de velocidade da IA local (Ollama). */
export const benchmark = (list) => localBenchmark(list);

let benchmarking = false;
export const benchmarkRunning = () => benchmarking;
/**
 * Mede a IA local com 2, 4 e 8 núcleos EM SEGUNDO PLANO, salva o mais rápido
 * (ai.threads + o modelo medido) e avisa a tela (AI_BENCHMARK_START / _DONE).
 * Devolve false se já houver um teste rodando.
 */
export function runBenchmark({ auto = false } = {}) {
  if (benchmarking) return false;
  benchmarking = true;
  const model = localInfo().detected?.model || '';
  bus.emitEvent(EVENTS.AI_BENCHMARK_START, { auto, model });
  localBenchmark([2, 4, 8]).then((r) => {
    if (!r.best) return { auto, text: `O teste de velocidade falhou em todas as configurações: ${r.results.map((x) => `${x.threads} núcleos: ${x.error}`).join('; ')}.` };
    updateSettings({ ai: { threads: r.best.threads, tunedFor: model } });
    // O teste deixou o modelo carregado com outra configuração: recarrega já com a escolhida,
    // para a próxima pergunta não pagar esse recarregamento.
    warmUp({ force: true }).catch(() => {});
    log.info('cerebro', `Velocidade da IA ajustada: ${r.best.threads} núcleos (≈ ${r.best.estSeconds} s por resposta)`);
    const lines = r.results.map((x) => (x.error ? `${x.threads} núcleos: falhou (${x.error})` : `${x.threads} núcleos: leitura ${x.promptRate} tokens/s · escrita ${x.evalRate} tokens/s · resposta típica ≈ ${x.estSeconds} s`));
    return {
      auto, best: r.best, results: r.results,
      text: `Teste de velocidade da IA (${model}):\n${lines.join('\n')}\n\nMelhor: ${r.best.threads} núcleos (≈ ${r.best.estSeconds} s por resposta típica). Já salvei essa configuração.`,
      speech: `${auto ? 'Ajustei a velocidade da IA ao seu aparelho.' : 'Pronto.'} A IA fica mais rápida com ${r.best.threads} núcleos, cerca de ${Math.round(r.best.estSeconds)} segundos por resposta.`,
    };
  }).catch((err) => ({ auto, text: `Não consegui fazer o teste de velocidade: ${err.message}.` }))
    .then((payload) => { benchmarking = false; bus.emitEvent(EVENTS.AI_BENCHMARK_DONE, payload); });
  return true;
}

/** Primeira vez com este modelo (e sem núcleos definidos à mão): ajusta sozinho. */
function autoTune(d) {
  if (process.env.JARVIS_AUTOTUNE === '0' || process.env.JARVIS_AI_THREADS) return;
  const ai = getSettings().ai || {};
  if (ai.threads && ai.tunedFor === d.model) return;
  log.info('cerebro', `Primeiro uso do modelo ${d.model}: ajustando a velocidade da IA em segundo plano`);
  runBenchmark({ auto: true });
}

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
  if (id === 'groq') return groqProvider;
  // auto: com chave do Groq salva → Groq (rápido) com a IA do celular como reserva; sem chave → IA local.
  if (id === 'auto') return groqProvider.configured() ? groqProvider : localProvider;
  if (id === 'local') return localProvider;
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
    free: k !== 'online' || !!p?.free,
    // IA do celular pronta para assumir se a online falhar (sem internet, limite, fora do ar).
    fallback: p && p !== localProvider && localInfo().detected ? { name: `IA local (${localInfo().detected.name})`, model: localInfo().detected.model } : null,
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
  if (p !== localProvider) {
    // IA online principal: procura a IA do celular em silêncio (sem pré-carregar), só para servir de reserva.
    if (p === groqProvider) {
      const last = localInfo().lastProbe?.at;
      if (force || !last || Date.now() - Date.parse(last) > 30000) { probing ??= detectLocal().finally(() => { probing = null; }); await probing; }
    }
    return status();
  }
  const last = localInfo().lastProbe?.at;
  if (force || !last || Date.now() - Date.parse(last) > 30000) {
    probing ??= detectLocal().then((d) => {
      if (d) {
        log.info('cerebro', `IA local detectada: ${d.name} · modelo ${d.model}`);
        // Pré-carrega o modelo em segundo plano (a primeira pergunta não espera o carregamento).
        warmUp().then((ok) => ok && log.info('cerebro', `Modelo ${d.model} carregado na memória`)).catch((e) => log.warn('cerebro', `Pré-carregamento do modelo falhou: ${e.message}`))
          .finally(() => autoTune(d));
      }
      return d;
    }).finally(() => { probing = null; });
    await probing;
  }
  return status();
}

/** Chamada genérica. Retorna { text } ou lança erro com mensagem amigável. */
export async function complete({ system, messages, maxTokens = 1500, effort, webSearch = false, json = null, timeoutMs = 45000, onToken = null }) {
  const p = provider();
  if (!p || !p.configured()) throw Object.assign(new Error('nenhuma IA disponível (instale uma IA local gratuita, como o Ollama, ou configure AI_PROVIDER no .env)'), { code: 'NO_KEY' });
  try {
    // onToken: provedores que sabem escrever em pedaços (IA local) mandam a resposta aos poucos; os outros ignoram.
    const out = await p.complete({ system, messages, maxTokens, effort, json, timeoutMs, onToken, webSearch: webSearch && p.capabilities.webSearch && process.env.JARVIS_WEB_SEARCH !== '0' });
    lastOkAt = new Date().toISOString();
    lastError = null;
    return out;
  } catch (err) {
    const msg = p.friendlyError(err);
    lastError = { message: msg, at: new Date().toISOString() };
    // IA online falhou por internet/limite/queda → a IA do celular responde no lugar (não para JSON pesado).
    if (p !== localProvider && !json && shouldFallback(err) && localProvider.configured()) {
      log.warn('cerebro', `IA online indisponível (${msg}); respondendo com a IA local`);
      try {
        const out = await localProvider.complete({ system, messages, maxTokens: Math.min(maxTokens, 200), timeoutMs, onToken });
        lastOkAt = new Date().toISOString();
        return { ...out, via: 'local', onlineError: msg };
      } catch (e2) { log.error('cerebro', `IA local (reserva) também falhou: ${localProvider.friendlyError(e2)}`); }
    }
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
