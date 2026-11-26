// IA LOCAL e GRATUITA — detecta automaticamente um servidor de modelos rodando
// no próprio computador (sem chave, sem cartão, sem assinatura):
//   • Ollama        http://127.0.0.1:11434   (https://ollama.com — gratuito, open source)
//   • LM Studio     http://127.0.0.1:1234    (gratuito)
//   • llama.cpp     http://127.0.0.1:8080    (llama-server, open source)
// Ou o endereço definido em AI_BASE_URL. Todos falam o formato "Chat Completions".
// A detecção é real (consulta a lista de modelos instalados); se nada responder,
// o JARVIS continua no modo local inteligente, sem fingir que há IA.
import { chatCompletion } from './openai-compatible.js';

const DEFAULT_CANDIDATES = [
  { name: 'Ollama', base: 'http://127.0.0.1:11434', list: '/api/tags', kind: 'ollama' },
  { name: 'LM Studio', base: 'http://127.0.0.1:1234', list: '/v1/models', kind: 'openai' },
  { name: 'llama.cpp', base: 'http://127.0.0.1:8080', list: '/v1/models', kind: 'openai' },
];

let detected = null; // { name, base, model, models, at }
let lastProbe = null; // { at, error }

export function candidates() {
  const custom = process.env.AI_BASE_URL;
  if (custom) {
    const base = custom.replace(/\/$/, '').replace(/\/v1$/, '');
    return [{ name: 'Servidor local (AI_BASE_URL)', base, list: /11434/.test(base) ? '/api/tags' : '/v1/models', kind: /11434/.test(base) ? 'ollama' : 'openai' }];
  }
  return DEFAULT_CANDIDATES;
}

async function getJson(url, timeout) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/** Lê os modelos instalados de um candidato. */
export function parseModels(kind, data) {
  if (kind === 'ollama') return (data?.models || []).map((m) => m.name || m.model).filter(Boolean);
  return (data?.data || []).map((m) => m.id).filter(Boolean);
}

/** Escolhe o modelo: AI_MODEL se instalado; senão o primeiro de conversa (ignora modelos só de embeddings). */
export function chooseModel(models, wanted = process.env.AI_MODEL) {
  if (!models.length) return null;
  if (wanted) return models.find((m) => m === wanted || m.split(':')[0] === wanted) || null;
  return models.find((m) => !/embed|bge|nomic|minilm/i.test(m)) || null;
}

/** Procura uma IA local. Atualiza o estado e devolve o resultado. */
export async function detectLocal({ timeout = 1500 } = {}) {
  const errors = [];
  for (const c of candidates()) {
    try {
      const models = parseModels(c.kind, await getJson(`${c.base}${c.list}`, timeout));
      const model = chooseModel(models);
      if (!model) { errors.push(`${c.name}: ${models.length ? `modelo "${process.env.AI_MODEL}" não instalado` : 'nenhum modelo instalado'}`); continue; }
      detected = { name: c.name, base: c.base, kind: c.kind, model, models, at: new Date().toISOString(), warmed: false };
      lastProbe = { at: detected.at, error: null };
      return detected;
    } catch (err) {
      errors.push(`${c.name}: ${err.name === 'AbortError' ? 'não respondeu' : 'não encontrado'}`);
    }
  }
  detected = null;
  lastProbe = { at: new Date().toISOString(), error: errors.join(' · ') };
  return null;
}

export const localInfo = () => ({ detected, lastProbe });

// Ollama (API própria): mantém o modelo carregado por 1 hora (sem recarregar a
// cada pergunta), limita o contexto e o tamanho da resposta → respostas rápidas.
export const KEEP_ALIVE = '60m';
export const NUM_CTX = 2048;
/** Núcleos do processador para a IA (JARVIS_AI_THREADS). No celular, usar só os núcleos rápidos costuma ser mais veloz. */
export const threads = () => { const n = Number(process.env.JARVIS_AI_THREADS); return Number.isInteger(n) && n > 0 && n <= 32 ? n : null; };
async function postJson(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status });
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('tempo de resposta esgotado'), { status: 0 });
    throw err;
  } finally { clearTimeout(timer); }
}
async function ollamaChat({ system, messages, maxTokens, json, timeoutMs }) {
  const data = await postJson(`${detected.base}/api/chat`, {
    model: detected.model,
    messages: [{ role: 'system', content: system }, ...messages],
    stream: false,
    keep_alive: KEEP_ALIVE,
    options: { num_predict: maxTokens, num_ctx: NUM_CTX, ...(threads() ? { num_thread: threads() } : {}) },
    ...(json ? { format: json } : {}),
  }, timeoutMs);
  const text = data?.message?.content;
  if (typeof text !== 'string') throw new Error('resposta da IA local em formato inesperado');
  return { text: text.trim() };
}

/** Carrega o modelo na memória logo ao iniciar (a primeira pergunta não espera). */
export async function warmUp() {
  if (!detected || detected.kind !== 'ollama' || detected.warmed) return false;
  detected.warmed = true;
  await postJson(`${detected.base}/api/generate`, { model: detected.model, keep_alive: KEEP_ALIVE }, 120000);
  return true;
}
/** Usado pelos testes. */
export function resetLocal() { detected = null; lastProbe = null; }

export const localProvider = {
  id: 'local',
  name: 'IA local',
  local: true,
  capabilities: { webSearch: false, json: true },
  configured: () => !!detected,
  model: () => detected?.model ?? null,
  displayName: () => (detected ? `IA local (${detected.name})` : 'IA local'),
  async complete({ system, messages, maxTokens, json, timeoutMs }) {
    if (!detected) throw new Error('nenhuma IA local detectada');
    // Modelos locais em CPU podem ser lentos: prazo maior.
    const t = Math.max(timeoutMs, 120000);
    if (detected.kind === 'ollama') return ollamaChat({ system, messages, maxTokens, json, timeoutMs: t });
    return chatCompletion({ endpoint: `${detected.base}/v1/chat/completions`, model: detected.model, system, messages, maxTokens, json, timeoutMs: t });
  },
  friendlyError(err) {
    if (err instanceof TypeError || /ECONNREFUSED|fetch failed/.test(err.message)) { detected = null; return 'a IA local parou de responder (o programa foi fechado?)'; }
    return err.message;
  },
};
