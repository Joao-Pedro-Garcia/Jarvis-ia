// Provedor Anthropic (Claude) via SDK oficial.
import Anthropic from '@anthropic-ai/sdk';

let client = null;
let clientKey = null;
const key = () => process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';

export const anthropicProvider = {
  id: 'anthropic',
  name: 'Anthropic (Claude)',
  defaultModel: 'claude-opus-5-5',
  capabilities: { webSearch: true, json: true },
  configured: () => !!key(),
  model() { return process.env.AI_MODEL || process.env.JARVIS_MODEL || this.defaultModel; },

  async complete({ system, messages, maxTokens, effort, webSearch, json, timeoutMs }) {
    if (!client || clientKey !== key()) { client = new Anthropic({ apiKey: key(), timeout: 60000, maxRetries: 1 }); clientKey = key(); }
    const params = {
      model: this.model(),
      max_tokens: maxTokens,
      system,
      messages,
      output_config: { effort: effort || process.env.JARVIS_EFFORT || 'low', ...(json ? { format: { type: 'json_schema', schema: json } } : {}) },
    };
    if (webSearch) params.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }];
    // Fallback no servidor: se o modelo recusar por política, outro modelo responde.
    const call = (p) => client.beta.messages.create({ ...p, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { timeout: timeoutMs });
    let response = await call(params);
    for (let i = 0; i < 2 && response.stop_reason === 'pause_turn'; i++) {
      response = await call({ ...params, messages: [...messages, { role: 'assistant', content: response.content }] });
    }
    if (response.stop_reason === 'refusal') return { text: 'Prefiro não responder a isso.', refused: true };
    return { text: response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() };
  },

  friendlyError(err) {
    return err instanceof Anthropic.AuthenticationError ? 'chave da API inválida'
      : err instanceof Anthropic.RateLimitError ? 'limite de uso da API atingido'
      : err instanceof Anthropic.APIConnectionTimeoutError ? 'tempo de resposta esgotado'
      : err instanceof Anthropic.APIConnectionError ? 'sem conexão com a API'
      : err instanceof Anthropic.APIError ? `erro da API (${err.status})` : err.message;
  },
};
