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
      detected = { name: c.name, base: c.base, model, models, at: new Date().toISOString() };
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
    return chatCompletion({ endpoint: `${detected.base}/v1/chat/completions`, model: detected.model, system, messages, maxTokens, json, timeoutMs: Math.max(timeoutMs, 120000) });
  },
  friendlyError(err) {
    if (err instanceof TypeError || /ECONNREFUSED|fetch failed/.test(err.message)) { detected = null; return 'a IA local parou de responder (o programa foi fechado?)'; }
    return err.message;
  },
};
