// Provedor genérico para APIs compatíveis com o formato "Chat Completions"
// (POST {base}/chat/completions): OpenAI, OpenRouter, Groq, Ollama local
// (http://localhost:11434/v1, sem chave), LM Studio etc.
const base = () => (process.env.AI_BASE_URL || (process.env.AI_PROVIDER === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
const key = () => process.env.AI_API_KEY || '';

export const openAICompatibleProvider = {
  id: 'openai-compatible',
  name: 'Compatível com OpenAI',
  defaultModel: 'gpt-4o-mini',
  capabilities: { webSearch: false, json: true },
  configured() { return process.env.AI_PROVIDER === 'ollama' ? !!process.env.AI_MODEL : !!key(); },
  model() { return process.env.AI_MODEL || this.defaultModel; },
  endpoint() { return `${base()}/chat/completions`; },

  async complete({ system, messages, maxTokens, json, timeoutMs }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const body = {
        model: this.model(),
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
        ...(json ? { response_format: { type: 'json_schema', json_schema: { name: 'resposta', strict: true, schema: json } } } : {}),
      };
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key() ? { Authorization: `Bearer ${key()}` } : {}) },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${res.status}`), { status: res.status });
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new Error('resposta da API em formato inesperado');
      return { text: text.trim() };
    } catch (err) {
      if (err.name === 'AbortError') throw Object.assign(new Error('tempo de resposta esgotado'), { status: 0 });
      throw err;
    } finally { clearTimeout(timer); }
  },

  friendlyError(err) {
    if (err.status === 401 || err.status === 403) return 'chave da API inválida';
    if (err.status === 429) return 'limite de uso da API atingido';
    if (err instanceof TypeError) return 'sem conexão com a API';
    return err.message;
  },
};
