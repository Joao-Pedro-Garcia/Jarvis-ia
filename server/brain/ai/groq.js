// IA ONLINE GRATUITA — Groq (https://console.groq.com): plano grátis, sem cartão,
// respostas em menos de 1 s. API no formato "Chat Completions" (OpenAI).
// A chave fica SÓ no servidor: variável GROQ_API_KEY ou colada em Configurações
// (guardada criptografada em data/ai-online.json com a chave de data/.secret.key).
// O modelo é escolhido sozinho entre os que a conta oferece (GET /models).
// Atenção: com o Groq, as mensagens da conversa vão para os servidores do Groq.
import { chatCompletion } from './openai-compatible.js';
import { load, save } from '../../core/store.js';
import { encrypt, decrypt } from '../../core/secrets.js';

export const GROQ_BASE = 'https://api.groq.com/openai/v1';
const FILE = 'ai-online';
// Preferência (o primeiro disponível na conta é usado). Se nenhum existir mais, usa
// qualquer modelo de conversa que a conta liste — o Groq troca modelos com o tempo.
export const PREFERRED = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const NOT_CHAT = /whisper|guard|tts|playai|orpheus|embed|vision|compound|allam/i;

let chosen = null;

export function storedKey() {
  try { const d = load(FILE, {}); return d.groq?.key ? decrypt(d.groq.key) : ''; } catch { return ''; }
}
const key = () => process.env.GROQ_API_KEY || storedKey();
export const keySource = () => (process.env.GROQ_API_KEY ? 'env' : storedKey() ? 'saved' : null);
// Formato não é imposto (pode mudar): a chave é TESTADA de verdade no Groq antes de salvar.
export const validKeyFormat = (k) => typeof k === 'string' && /^[A-Za-z0-9_\-]{20,200}$/.test(k.trim());

/** Modelos de conversa disponíveis na conta (ids). Lança erro com .status em falha. */
export async function listModels(k = key(), timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${k}` }, signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${res.status}`), { status: res.status });
    return (data?.data || []).filter((m) => m && m.id && m.active !== false).map((m) => m.id);
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('tempo de resposta esgotado'), { status: 0 });
    throw err;
  } finally { clearTimeout(t); }
}

/** Escolhe o modelo: GROQ_MODEL se existir; senão o primeiro preferido; senão um modelo de conversa qualquer. */
export function pickModel(ids, wanted = process.env.GROQ_MODEL) {
  if (wanted && ids.includes(wanted)) return wanted;
  for (const p of PREFERRED) if (ids.includes(p)) return p;
  return ids.find((id) => !NOT_CHAT.test(id)) || null;
}

/** Testa a chave de verdade (lista os modelos) e guarda criptografada. */
export async function saveKey(k) {
  const clean = String(k || '').trim();
  if (!validKeyFormat(clean)) throw Object.assign(new Error('Essa não parece uma chave do Groq. Copie a chave inteira (no Groq ela costuma começar com gsk_).'), { status: 400 });
  let ids;
  try { ids = await listModels(clean); } catch (err) { throw Object.assign(new Error(groqProvider.friendlyError(err)), { status: err.status === 401 || err.status === 403 ? 400 : 502 }); }
  const model = pickModel(ids);
  if (!model) throw Object.assign(new Error('A conta do Groq não tem nenhum modelo de conversa disponível.'), { status: 502 });
  save(FILE, { groq: { key: encrypt(clean), model, savedAt: new Date().toISOString() } });
  chosen = model;
  return { model, models: ids.length };
}

export function removeKey() { save(FILE, {}); chosen = null; }

export const groqProvider = {
  id: 'groq',
  name: 'Groq (gratuito)',
  free: true,
  capabilities: { webSearch: false, json: true },
  configured: () => !!key(),
  model() { return process.env.GROQ_MODEL || chosen || load(FILE, {}).groq?.model || PREFERRED[0]; },
  async complete({ system, messages, maxTokens, json, timeoutMs }) {
    const call = () => chatCompletion({ endpoint: `${GROQ_BASE}/chat/completions`, key: key(), model: this.model(), system, messages, maxTokens, json, timeoutMs: Math.min(timeoutMs, 25000) });
    try {
      return await call();
    } catch (err) {
      // Modelo retirado pelo Groq: escolhe outro disponível e tenta de novo (uma vez).
      if ((err.status === 404 || err.status === 400) && /model/i.test(err.message)) {
        const next = pickModel(await listModels().catch(() => []), null);
        if (next && next !== this.model()) {
          chosen = next;
          const d = load(FILE, {});
          if (d.groq) { d.groq.model = next; save(FILE, d); }
          return call();
        }
      }
      throw err;
    }
  },
  friendlyError(err) {
    if (err.status === 401 || err.status === 403) return 'chave do Groq inválida ou revogada';
    if (err.status === 429) return 'limite gratuito do Groq atingido por agora';
    if (err.status === 404) return 'modelo do Groq indisponível';
    if (err.status >= 500) return 'o Groq está fora do ar agora';
    if (err instanceof TypeError || /fetch failed/.test(err.message)) return 'sem internet para a IA online';
    return err.message;
  },
};

/** Falhas em que vale usar a IA do celular no lugar (sem internet, lento, limite, fora do ar). */
export const shouldFallback = (err) => err instanceof TypeError || /fetch failed|sem conexão|tempo de resposta/i.test(err.message) || err.status === 0 || err.status === 429 || err.status >= 500;

// ---------- OUVIDO: transcrição Whisper (gratuita no Groq, mesma chave) ----------
// O áudio gravado no celular é enviado ao Groq só para virar texto.
export const STT_MODELS = () => [...new Set([process.env.GROQ_STT_MODEL, 'whisper-large-v3-turbo', 'whisper-large-v3'].filter(Boolean))];
// Frases que o Whisper costuma "inventar" em silêncio/ruído (vindas de legendas de vídeos).
const HALLUCINATIONS = [
  /legendas? (pela|por) (comunidade )?amara\.org/i, /legenda(s|do)? (por|pela) [\w\s]+$/i, /inscreva-se( no canal)?/i,
  /araguaína,? tocantins,? bíblia/i, /conversa em português do brasil com o assistente/i,
  /^(obrigad[oa]|muito obrigad[oa])( por assistir(em)?)?[.!]?$/i, /^(tchau|e aí)[.!]?$/i, /^\W*$/,
];
export function cleanTranscript(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return HALLUCINATIONS.some((re) => re.test(t)) ? '' : t;
}
export const sttAvailable = () => !!key();

/** Áudio (Buffer) → texto. Erros com .status (401 chave, 429 limite, 0 rede). */
export async function transcribe(buf, mime = 'audio/webm', { language = 'pt', timeoutMs = 20000 } = {}) {
  const k = key();
  if (!k) throw Object.assign(new Error('Groq não conectado (cole a chave em Configurações → INTELIGÊNCIA)'), { status: 503, code: 'NO_KEY' });
  const type = String(mime).split(';')[0] || 'audio/webm';
  const ext = /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : /wav/.test(type) ? 'wav' : /mpeg|mp3/.test(type) ? 'mp3' : 'webm';
  let lastErr;
  for (const model of STT_MODELS()) {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type }), `fala.${ext}`);
    fd.append('model', model);
    fd.append('language', language);
    fd.append('temperature', '0');
    fd.append('response_format', 'json');
    // Sem 'prompt': com áudio pouco claro o Whisper devolvia a própria dica como se fosse a fala.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${k}` }, body: fd, signal: ctrl.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = Object.assign(new Error(data?.error?.message || `HTTP ${res.status}`), { status: res.status });
        if ((res.status === 404 || res.status === 400) && /model/i.test(err.message)) { lastErr = err; continue; } // modelo retirado → tenta o próximo
        throw err;
      }
      return { text: cleanTranscript(data?.text), model };
    } catch (err) {
      if (err.name === 'AbortError') throw Object.assign(new Error('tempo de resposta esgotado'), { status: 0 });
      throw err;
    } finally { clearTimeout(t); }
  }
  throw lastErr || new Error('nenhum modelo de transcrição disponível');
}
