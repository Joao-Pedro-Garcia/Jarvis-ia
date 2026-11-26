// TAREFAS e LEMBRETES: criar, editar, concluir, cancelar, adiar, listar.
// Armazenadas em data/memory.json (tipo "tasks"). Um agendador verifica os
// vencimentos e emite REMINDER_DUE (a interface mostra/fala/notifica).
import * as memory from '../memory/memory.js';
import { bus, EVENTS } from '../../core/events.js';
import { log } from '../../core/logger.js';
import { formatWhen, zonedParts, zonedToDate } from '../../core/when.js';

// ---------- AGENDA: tarefas com horário que se repetem ----------
// repeat = { days: [0..6] (0 = domingo), time: 'HH:MM' }
// action = o que fazer no horário: 'lembrete' (fala o texto) ou um comando do JARVIS
// ('noticias', 'clima', 'meu dia', 'biblia', 'dolar', 'combustiveis').
export const ACTIONS = {
  lembrete: { label: 'Lembrete', command: null },
  noticias: { label: 'Notícias', command: 'notícias' },
  clima: { label: 'Clima de hoje', command: 'como está o dia hoje' },
  'meu dia': { label: 'Resumo do meu dia', command: 'meu dia' },
  biblia: { label: 'Leitura da Bíblia', command: 'bíblia' },
  dolar: { label: 'Cotação do dólar', command: 'como está o dólar' },
  combustiveis: { label: 'Preço dos combustíveis', command: 'preço da gasolina' },
};
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const validTime = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
const pad = (t) => { const [h, m] = String(t).split(':'); return `${String(Number(h)).padStart(2, '0')}:${m}`; };

/** Próximo horário de uma rotina, depois de `after`. */
export function nextOccurrence(repeat, after = new Date()) {
  const days = [...new Set((repeat?.days || []).map(Number))].filter((d) => d >= 0 && d <= 6);
  if (!days.length || !validTime(repeat?.time)) return null;
  const [h, mi] = repeat.time.split(':').map(Number);
  const p = zonedParts(after);
  for (let i = 0; i <= 7; i++) {
    const base = new Date(Date.UTC(p.y, p.m - 1, p.d + i, 12));
    const wd = base.getUTCDay();
    if (!days.includes(wd)) continue;
    const at = zonedToDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, mi);
    if (at > after) return at;
  }
  return null;
}

export function describeRepeat(r) {
  if (!r) return '';
  const d = [...r.days].sort();
  const when = d.length === 7 ? 'todo dia' : d.join() === '1,2,3,4,5' ? 'de segunda a sexta' : d.join() === '0,6' ? 'nos fins de semana'
    : `toda ${d.map((x) => DAY_NAMES[x]).join(', ').replace(/, ([^,]+)$/, ' e $1')}`;
  const [h, m] = r.time.split(':');
  return `${when.replace('toda domingo', 'todo domingo').replace('toda sábado', 'todo sábado')} às ${Number(h)}h${m === '00' ? '' : m}`;
}

export function add(text, { dueAt = null, hasTime = false, repeat = null, action = 'lembrete' } = {}) {
  if (repeat) {
    const next = nextOccurrence(repeat);
    if (!next) throw Object.assign(new Error('Horário ou dias inválidos'), { status: 400 });
    return memory.add('tasks', text, { allowDup: true, status: 'pending', dueAt: next.toISOString(), hasTime: true, notifiedAt: null, repeat: { days: [...new Set(repeat.days.map(Number))].sort(), time: pad(repeat.time) }, action: ACTIONS[action] ? action : 'lembrete' });
  }
  return memory.add('tasks', text, { status: 'pending', dueAt: dueAt ? new Date(dueAt).toISOString() : null, hasTime, notifiedAt: null, action: ACTIONS[action] ? action : 'lembrete' });
}
export const routines = () => list().filter((t) => t.repeat);

const isPending = (t) => !t.done && t.status !== 'cancelled';

export function list({ includeDone = false } = {}) {
  const all = memory.list('tasks');
  const items = includeDone ? all : all.filter(isPending);
  return items.sort((a, b) => (a.dueAt || '9999').localeCompare(b.dueAt || '9999') || a.createdAt.localeCompare(b.createdAt));
}

export const get = (id) => memory.list('tasks').find((t) => t.id === id) || null;
export const complete = (id) => memory.updateItem(id, { status: 'done' });
export const cancel = (id) => memory.updateItem(id, { status: 'cancelled' });
export const edit = (id, text) => memory.updateItem(id, { text });
export const postpone = (id, date, hasTime) => memory.updateItem(id, { dueAt: date.toISOString(), hasTime });

export function describe(t, now = new Date()) {
  if (t.repeat) return `${t.text} (${describeRepeat(t.repeat)})`;
  return t.dueAt ? `${t.text} (${formatWhen(new Date(t.dueAt), now, undefined, t.hasTime)})` : t.text;
}

/** Tarefas do dia (vencendo hoje), atrasadas e sem data. */
export function today(now = new Date()) {
  const p = zonedParts(now);
  const isToday = (iso) => { const q = zonedParts(new Date(iso)); return q.y === p.y && q.m === p.m && q.d === p.d; };
  const pend = list();
  return {
    overdue: pend.filter((t) => t.dueAt && new Date(t.dueAt) < now && !isToday(t.dueAt)),
    today: pend.filter((t) => t.dueAt && isToday(t.dueAt)),
    undated: pend.filter((t) => !t.dueAt),
    upcoming: pend.filter((t) => t.dueAt && new Date(t.dueAt) > now && !isToday(t.dueAt)).slice(0, 5),
  };
}

/** Verifica lembretes vencidos. Retorna os disparados agora. */
export function checkDue(now = new Date()) {
  const fired = [];
  for (const t of list()) {
    if (!t.dueAt || t.notifiedAt) continue;
    // Lembrete só com data (sem hora): dispara às 9h do dia.
    if (new Date(t.dueAt) <= now) {
      const late = now - new Date(t.dueAt) > 30 * 60000; // celular desligado na hora: não dispara rotina atrasada
      if (t.repeat) {
        // Rotina: agenda a próxima vez (nunca fica "concluída").
        const next = nextOccurrence(t.repeat, now);
        memory.updateItem(t.id, { dueAt: next ? next.toISOString() : null, lastRunAt: now.toISOString() });
        if (late) { log.info('tarefas', 'Rotina atrasada pulada (o JARVIS estava desligado no horário)'); continue; }
      } else memory.updateItem(t.id, { notifiedAt: now.toISOString() });
      fired.push(t);
      bus.emitEvent(EVENTS.REMINDER_DUE, { id: t.id, text: t.text, dueAt: t.dueAt, action: t.action || 'lembrete', command: ACTIONS[t.action]?.command || null, repeat: !!t.repeat });
      log.info('tarefas', t.repeat ? 'Rotina disparada' : 'Lembrete disparado');
    }
  }
  return fired;
}

let timer = null;
export function startScheduler(intervalMs = 20000) {
  if (timer) return;
  timer = setInterval(() => { try { checkDue(); } catch (err) { log.error('tarefas', err.message); } }, intervalMs);
  timer.unref();
}

// ---------- "todo dia às 7h me lembre de…" (voz/texto) ----------
const DAY_RE = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
/** Lê a frequência ("todo dia", "de segunda a sexta", "toda segunda e quarta"…) do texto normalizado. */
export function parseDays(t) {
  if (/\b(tod[oa]s? (os )?dias?|diariamente|todo santo dia)\b/.test(t)) return { days: [0, 1, 2, 3, 4, 5, 6], phrase: t.match(/\b(tod[oa]s? (os )?dias?|diariamente|todo santo dia)\b/)[0] };
  let m = t.match(/\b(de segunda a sexta|dias uteis|durante a semana|em dias de semana)\b/);
  if (m) return { days: [1, 2, 3, 4, 5], phrase: m[0] };
  m = t.match(/\b(nos |aos |todo )?fins? de semana\b/);
  if (m) return { days: [0, 6], phrase: m[0] };
  m = t.match(/\b(tod[oa]s? (as |os )?|as |aos )(domingo|segunda|terca|quarta|quinta|sexta|sabado)s?(-feiras?)?((,| e) ?(as |aos )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)s?(-feiras?)?)*/);
  if (m && /^tod/.test(m[0])) {
    const days = [...m[0].matchAll(/domingo|segunda|terca|quarta|quinta|sexta|sabado/g)].map((x) => DAY_RE[x[0]]);
    return { days: [...new Set(days)].sort(), phrase: m[0] };
  }
  return null;
}
export function actionOf(t) {
  if (/\bnoticias?\b/.test(t)) return 'noticias';
  if (/\b(clima|previsao( do tempo)?|como (esta|vai) o tempo|temperatura)\b/.test(t)) return 'clima';
  if (/\b(meu dia|resumo do (meu )?dia|minha agenda)\b/.test(t)) return 'meu dia';
  if (/\b(biblia|leitura biblica|capitulos?)\b/.test(t)) return 'biblia';
  if (/\b(dolar|cotacao|cambio)\b/.test(t)) return 'dolar';
  if (/\b(gasolina|combustive\w*|etanol|diesel)\b/.test(t)) return 'combustiveis';
  return 'lembrete';
}
