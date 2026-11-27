// VISÃO GRATUITA DE RESERVA — Google Gemini (https://aistudio.google.com): chave grátis,
// sem cartão. Entende imagens (prints, fotos, documentos) e quadros de vídeo muito bem.
// Usado quando a conta do Groq não tem modelo que enxerga imagens.
// A chave fica SÓ no servidor: GEMINI_API_KEY ou colada em Configurações (criptografada
// em data/ai-online.json). As imagens enviadas passam pelos servidores do Google.
import { load, save } from '../../core/store.js';
import { encrypt, decrypt } from '../../core/secrets.js';

const BASE = () => (process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const FILE = 'ai-online';
let chosen = null;

export function storedKey() {
  try { const d = load(FILE, {}); return d.gemini?.key ? decrypt(d.gemini.key) : ''; } catch { return ''; }
}
const key = () => process.env.GEMINI_API_KEY || storedKey();
export const configured = () => !!key();
export const keySource = () => (process.env.GEMINI_API_KEY ? 'env' : storedKey() ? 'saved' : null);
export const validKeyFormat = (k) => typeof k === 'string' && /^[A-Za-z0-9_\-]{30,80}$/.test(k.trim());

async function call(path, { method = 'GET', body, timeoutMs = 10000, k = key() } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE()}${path}`, { method, headers: { 'x-goog-api-key': k, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error?.message || `HTTP ${res.status}`), { status: res.status });
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw Object.assign(new Error('tempo de resposta esgotado'), { status: 0 });
    throw err;
  } finally { clearTimeout(t); }
}

/** Modelos da conta que geram conteúdo (sem o prefixo "models/"). */
export async function listModels(k = key()) {
  const data = await call('/models?pageSize=200', { k });
  return (data?.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace(/^models\//, ''));
}

/** Prefere o "flash" estável mais novo (rápido e com cota grátis maior). */
export function pickModel(ids, wanted = process.env.GEMINI_MODEL) {
  if (wanted && ids.includes(wanted)) return wanted;
  const ver = (id) => Number((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  const bad = /tts|image|live|audio|embed|thinking|exp|preview|learnlm|veo|imagen/i;
  const byVer = (a, b) => ver(b) - ver(a);
  const tiers = [
    ids.filter((m) => /^gemini-[\d.]+-flash$/.test(m)),
    ids.filter((m) => /flash/.test(m) && !/lite/.test(m) && !bad.test(m)),
    ids.filter((m) => /flash-lite/.test(m) && !bad.test(m)),
    ids.filter((m) => /^gemini/.test(m) && !bad.test(m)),
  ];
  for (const t of tiers) if (t.length) return t.sort(byVer)[0];
  return null;
}

export async function saveKey(k) {
  const clean = String(k || '').trim();
  if (!validKeyFormat(clean)) throw Object.assign(new Error('Essa não parece uma chave do Google AI Studio. Copie a chave inteira (costuma começar com AIza).'), { status: 400 });
  let ids;
  try { ids = await listModels(clean); } catch (err) { throw Object.assign(new Error(friendlyError(err)), { status: err.status === 400 || err.status === 401 || err.status === 403 ? 400 : 502 }); }
  const model = pickModel(ids);
  if (!model) throw Object.assign(new Error('A conta do Gemini não tem modelo disponível.'), { status: 502 });
  const d = load(FILE, {});
  save(FILE, { ...d, gemini: { key: encrypt(clean), model, savedAt: new Date().toISOString() } });
  chosen = model;
  return { model };
}
export function removeKey() { const d = load(FILE, {}); delete d.gemini; save(FILE, d); chosen = null; }
export const model = () => process.env.GEMINI_MODEL || chosen || load(FILE, {}).gemini?.model || 'gemini-2.5-flash';

export function friendlyError(err) {
  if (err.status === 400 && /api key|API_KEY/i.test(err.message)) return 'chave do Gemini inválida';
  if (err.status === 401 || err.status === 403) return 'chave do Gemini inválida ou sem permissão';
  if (err.status === 429) return 'limite gratuito do Gemini atingido por agora';
  if (err.status === 404) return 'modelo do Gemini indisponível';
  if (err.status >= 500) return 'o Gemini está fora do ar agora';
  if (err instanceof TypeError || /fetch failed/.test(err.message)) return 'sem internet para a visão';
  return err.message;
}

const part = (url) => ({ inline_data: { mime_type: url.slice(5, url.indexOf(';')), data: url.slice(url.indexOf(',') + 1) } });

/** Mesma interface do Groq: { system, history, text, images } → { text, model }. */
export async function seeImages({ system, history = [], text, images, maxTokens = 1200, timeoutMs = 60000 }) {
  if (!key()) throw Object.assign(new Error('Gemini não conectado'), { status: 503, code: 'NO_KEY' });
  const contents = [
    ...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(h.content) }] })),
    { role: 'user', parts: [{ text }, ...images.slice(0, 5).map(part)] },
  ];
  const body = { systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 } };
  const run = async (m) => {
    const data = await call(`/models/${encodeURIComponent(m)}:generateContent`, { method: 'POST', body, timeoutMs });
    const out = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!out) throw Object.assign(new Error(data?.promptFeedback?.blockReason ? 'o Gemini recusou analisar essa imagem' : 'resposta vazia do Gemini'), { status: 422 });
    return { text: out, model: m };
  };
  try { return await run(model()); } catch (err) {
    if (err.status === 404) { // modelo retirado: escolhe outro e tenta de novo
      const next = pickModel(await listModels().catch(() => []), null);
      if (next && next !== model()) { chosen = next; const d = load(FILE, {}); if (d.gemini) { d.gemini.model = next; save(FILE, d); } return run(next); }
    }
    throw err;
  }
}
