// Sistema de MEMÓRIA.
// - Sessão: conversa atual (em memória RAM, por sessão; não vai para disco).
// - Persistente: fatos que o usuário AUTORIZOU lembrar ("lembre que...").
// - Preferências: ajustes de funcionamento.
// - Tarefas: coisas a acompanhar.
import crypto from 'node:crypto';
import { load, save } from '../../core/store.js';
import { bus, EVENTS } from '../../core/events.js';
import { similarity, keywords, normalize } from '../../core/text.js';
import { log } from '../../core/logger.js';

const STORE = 'memory';
const DEFAULT = { facts: [], preferences: [], tasks: [] };
export const KINDS = { facts: 'Persistente', preferences: 'Preferência', tasks: 'Tarefa' };

const SENSITIVE = [
  { re: /\bsenha\b|\bpassword\b|\bpin\b/, label: 'senha' },
  { re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, label: 'CPF' },
  { re: /\b(?:\d[ -]?){13,16}\b/, label: 'número de cartão' },
  { re: /\bcvv\b|\bcodigo de seguranca\b/, label: 'código de segurança' },
  { re: /\btoken\b|\bchave (de )?api\b|sk-ant-/, label: 'chave/token' },
];

export function detectSensitive(text) {
  const n = normalize(text);
  const hit = SENSITIVE.find((s) => s.re.test(n) || s.re.test(text));
  return hit ? hit.label : null;
}

const db = () => load(STORE, DEFAULT);
const commit = (d, action, item) => {
  save(STORE, d);
  bus.emitEvent(EVENTS.MEMORY_UPDATED, { action, kind: item?.kind, id: item?.id });
  log.info('memoria', `Memória ${action}: ${item?.kind ?? ''}`);
};

export function list(kind) {
  const d = db();
  if (kind) return d[kind] || [];
  return d;
}

export function add(kind, text, extra = {}) {
  if (!KINDS[kind]) throw new Error('Tipo de memória inválido');
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Memória vazia');
  const d = db();
  const dup = d[kind].find((m) => normalize(m.text) === normalize(clean));
  if (dup) return dup;
  const item = { id: crypto.randomUUID(), kind, text: clean.slice(0, 1000), createdAt: new Date().toISOString(), ...extra };
  if (kind === 'tasks') item.done = false;
  d[kind].push(item);
  commit(d, 'adicionada', item);
  return item;
}

export function updateItem(id, patch) {
  const d = db();
  for (const kind of Object.keys(KINDS)) {
    const item = d[kind].find((m) => m.id === id);
    if (item) {
      if (typeof patch.text === 'string' && patch.text.trim()) item.text = patch.text.trim().slice(0, 1000);
      if (typeof patch.done === 'boolean') item.done = patch.done;
      item.updatedAt = new Date().toISOString();
      commit(d, 'editada', item);
      return item;
    }
  }
  return null;
}

export function remove(id) {
  const d = db();
  for (const kind of Object.keys(KINDS)) {
    const i = d[kind].findIndex((m) => m.id === id);
    if (i >= 0) { const [item] = d[kind].splice(i, 1); commit(d, 'apagada', item); return item; }
  }
  return null;
}

export function clearAll() {
  save(STORE, structuredClone(DEFAULT));
  bus.emitEvent(EVENTS.MEMORY_UPDATED, { action: 'limpa' });
}

/** Busca por relevância (palavras-chave). */
export function search(query, { limit = 5, kinds = Object.keys(KINDS), min = 0.08 } = {}) {
  const d = db();
  const q = keywords(query);
  const out = [];
  for (const kind of kinds) {
    for (const m of d[kind]) {
      const sim = similarity(query, m.text);
      const kw = keywords(m.text);
      const overlap = q.filter((w) => kw.some((k) => k.startsWith(w.slice(0, 5)) || w.startsWith(k.slice(0, 5)))).length;
      const score = sim + overlap * 0.15;
      if (score >= min) out.push({ ...m, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Texto compacto injetado no contexto do cérebro. */
export function contextSnippet(maxItems = 30) {
  const d = db();
  const lines = [];
  for (const m of d.facts.slice(-maxItems)) lines.push(`- (fato) ${m.text}`);
  for (const m of d.preferences.slice(-15)) lines.push(`- (preferência) ${m.text}`);
  for (const m of d.tasks.filter((t) => !t.done).slice(-15)) lines.push(`- (tarefa pendente) ${m.text}`);
  return lines.join('\n');
}

// ---------- Memória de sessão (RAM) ----------
const sessions = new Map();
const SESSION_TTL = 6 * 60 * 60 * 1000;

export function session(id = 'default') {
  let s = sessions.get(id);
  if (!s) {
    s = { id, history: [], context: {}, pending: null, startedAt: Date.now(), lastAt: Date.now() };
    sessions.set(id, s);
  }
  s.lastAt = Date.now();
  // limpeza de sessões antigas
  for (const [k, v] of sessions) if (Date.now() - v.lastAt > SESSION_TTL) sessions.delete(k);
  return s;
}

export function pushHistory(sess, role, content, meta = {}) {
  sess.history.push({ role, content: String(content).slice(0, 4000), at: Date.now(), ...meta });
  if (sess.history.length > 40) sess.history.splice(0, sess.history.length - 40);
}

export function resetSession(id) { sessions.delete(id); }
