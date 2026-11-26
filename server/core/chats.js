// CONVERSAS (estilo ChatGPT): cada conversa tem id, título, categorias e mensagens.
// Gravadas em data/chats.json. O título sai da primeira mensagem do usuário.
// Dados sensíveis (senha, CPF, cartão, token) nunca são gravados.
// Na primeira vez, importa o histórico antigo por categoria (data/conversations.json),
// sem apagar nem alterar o arquivo antigo.
import crypto from 'node:crypto';
import { load, save } from './store.js';
import { categoryOf, CATEGORIES, SENSITIVE_IN } from './conversations.js';

const FILE = 'chats';
const MAX_CHATS = 300;
const MAX_MESSAGES = 400;
const ID_RE = /^[0-9a-f-]{36}$/;

export const validId = (id) => typeof id === 'string' && ID_RE.test(id);
export const newId = () => crypto.randomUUID();

function db() {
  const d = load(FILE, { chats: [], migrated: false });
  if (!d.migrated) migrateLegacy(d);
  return d;
}

/** Importa o histórico antigo (uma conversa por categoria). Só lê o arquivo antigo. */
function migrateLegacy(d) {
  const old = load('conversations', { categories: {} });
  for (const [cat, items] of Object.entries(old.categories || {})) {
    if (!Array.isArray(items) || !items.length) continue;
    d.chats.push({
      id: newId(), title: `Histórico — ${CATEGORIES[cat] || cat}`, titleAuto: false, categories: [cat],
      createdAt: items[0].at, updatedAt: items[items.length - 1].at,
      messages: items.map((m) => ({ role: m.role === 'user' ? 'user' : 'jarvis', text: m.text, at: m.at, category: cat })),
    });
  }
  d.migrated = true;
  save(FILE, d);
}

/** Título curto a partir da primeira mensagem ("jarvis, abra a bíblia" → "Abra a bíblia"). */
export function makeTitle(text) {
  let t = String(text || '').replace(/^\s*(ei |ok |oi )?jarvis[,!.\s]*/i, '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Nova conversa';
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 42 ? `${t.slice(0, 40).trim()}…` : t;
}

const summary = (c) => ({
  id: c.id, title: c.title, categories: c.categories, createdAt: c.createdAt, updatedAt: c.updatedAt,
  count: c.messages.length, preview: c.messages.filter((m) => m.role === 'jarvis').slice(-1)[0]?.text.slice(0, 90) || '',
});

/** Grava a pergunta e a resposta na conversa `id` (cria se ainda não existir). */
export function append(id, userText, result = {}) {
  if (!validId(id) || !String(userText || '').trim()) return null;
  const d = db();
  const now = new Date().toISOString();
  let c = d.chats.find((x) => x.id === id);
  if (!c) {
    c = { id, title: null, titleAuto: true, categories: [], createdAt: now, updatedAt: now, messages: [] };
    d.chats.push(c);
  }
  const cat = categoryOf(result);
  const sensitive = !!result.sensitive || SENSITIVE_IN.test(userText);
  if (!c.title) c.title = sensitive ? 'Conversa protegida' : makeTitle(userText);
  if (!c.categories.includes(cat)) c.categories.push(cat);
  c.messages.push({ role: 'user', text: sensitive ? '[mensagem com dado sensível — não registrada]' : String(userText).slice(0, 2000), at: now, category: cat });
  const reply = result.sensitive ? '[informação protegida — não registrada]' : String(result.text || '').slice(0, 4000);
  if (reply) c.messages.push({ role: 'jarvis', text: reply, at: now, category: cat, tag: result.module || null });
  if (c.messages.length > MAX_MESSAGES) c.messages.splice(0, c.messages.length - MAX_MESSAGES);
  c.updatedAt = now;
  if (d.chats.length > MAX_CHATS) {
    d.chats.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    d.chats.splice(0, d.chats.length - MAX_CHATS);
  }
  save(FILE, d);
  return summary(c);
}

/** Lista (mais recente primeiro). `category` filtra; `q` procura no título. */
export function list({ category = null, q = '' } = {}) {
  const query = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return db().chats
    .filter((c) => !category || c.categories.includes(category))
    .filter((c) => !query || c.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(summary);
}

export function get(id) {
  const c = validId(id) && db().chats.find((x) => x.id === id);
  return c ? { ...summary(c), messages: c.messages } : null;
}

export function rename(id, title) {
  const d = db();
  const c = validId(id) && d.chats.find((x) => x.id === id);
  const t = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!c || !t) return null;
  c.title = t; c.titleAuto = false;
  save(FILE, d);
  return summary(c);
}

export function remove(id) {
  const d = db();
  const i = validId(id) ? d.chats.findIndex((x) => x.id === id) : -1;
  if (i < 0) return false;
  d.chats.splice(i, 1);
  save(FILE, d);
  return true;
}

/** Últimas mensagens no formato do cérebro (para a IA lembrar a conversa após reiniciar). */
export function historyFor(id, n = 16) {
  const c = validId(id) && db().chats.find((x) => x.id === id);
  if (!c) return [];
  return c.messages.filter((m) => !/^\[/.test(m.text)).slice(-n).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
}

/** Categorias com conversas (para o filtro da lista). */
export function categoriesInUse() {
  const used = new Set(db().chats.flatMap((c) => c.categories));
  return Object.entries(CATEGORIES).filter(([id]) => used.has(id)).map(([id, label]) => ({ id, label }));
}
