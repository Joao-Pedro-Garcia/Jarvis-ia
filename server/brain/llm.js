// Conexão do CÉREBRO com a Claude API (Anthropic). A chave fica SOMENTE no
// servidor (variável de ambiente ANTHROPIC_API_KEY) e nunca vai ao navegador.
import Anthropic from '@anthropic-ai/sdk';
import { log } from '../core/logger.js';
import { bus, EVENTS } from '../core/events.js';

let client = null;
let lastError = null;
let lastOkAt = null;

export const model = () => process.env.JARVIS_MODEL || 'claude-opus-5-5';
export const available = () => !!process.env.ANTHROPIC_API_KEY;

function getClient() {
  if (!available()) return null;
  if (!client) client = new Anthropic({ timeout: 60000, maxRetries: 1 });
  return client;
}

export function status() {
  return { configured: available(), model: model(), lastError, lastOkAt, webSearch: process.env.JARVIS_WEB_SEARCH !== '0' };
}

function textOf(response) {
  return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

/**
 * Chamada genérica. Retorna { text, raw } ou lança erro amigável.
 * `webSearch`: habilita a ferramenta de pesquisa web do servidor da Anthropic.
 */
export async function complete({ system, messages, maxTokens = 1500, effort, webSearch = false, json = null, timeoutMs = 45000 }) {
  const c = getClient();
  if (!c) throw Object.assign(new Error('IA não configurada (ANTHROPIC_API_KEY ausente)'), { code: 'NO_KEY' });
  const params = {
    model: model(),
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort: effort || process.env.JARVIS_EFFORT || 'low', ...(json ? { format: { type: 'json_schema', schema: json } } : {}) },
  };
  if (webSearch && process.env.JARVIS_WEB_SEARCH !== '0') params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }];
  try {
    // Fallback no servidor: se o modelo recusar por política, outro modelo responde.
    let response = await c.beta.messages.create(
      { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
      { timeout: timeoutMs },
    );
    // Ferramentas de servidor podem pausar o turno; continua até 2 vezes.
    for (let i = 0; i < 2 && response.stop_reason === 'pause_turn'; i++) {
      response = await c.beta.messages.create(
        { ...params, messages: [...messages, { role: 'assistant', content: response.content }], betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        { timeout: timeoutMs },
      );
    }
    if (response.stop_reason === 'refusal') {
      lastOkAt = new Date().toISOString();
      return { text: 'Prefiro não responder a isso.', refused: true, raw: response };
    }
    lastOkAt = new Date().toISOString();
    lastError = null;
    return { text: textOf(response), raw: response };
  } catch (err) {
    const msg = err instanceof Anthropic.AuthenticationError ? 'chave da API inválida'
      : err instanceof Anthropic.RateLimitError ? 'limite de uso da API atingido'
      : err instanceof Anthropic.APIConnectionTimeoutError ? 'tempo de resposta esgotado'
      : err instanceof Anthropic.APIConnectionError ? 'sem conexão com a API'
      : err instanceof Anthropic.APIError ? `erro da API (${err.status})` : err.message;
    lastError = { message: msg, at: new Date().toISOString() };
    log.error('cerebro', `Falha na IA: ${msg}`);
    bus.emitEvent(EVENTS.LLM_ERROR, { message: msg });
    throw Object.assign(new Error(msg), { code: 'LLM_FAIL' });
  }
}

/** Atalho para respostas estruturadas (JSON Schema). */
export async function completeJSON(opts) {
  const { text } = await complete(opts);
  try { return JSON.parse(text); } catch { throw new Error('Resposta da IA em formato inválido'); }
}
