// TAREFAS e LEMBRETES: criar, editar, concluir, cancelar, adiar, listar.
// Armazenadas em data/memory.json (tipo "tasks"). Um agendador verifica os
// vencimentos e emite REMINDER_DUE (a interface mostra/fala/notifica).
import * as memory from '../memory/memory.js';
import { bus, EVENTS } from '../../core/events.js';
import { log } from '../../core/logger.js';
import { formatWhen, zonedParts } from '../../core/when.js';

export function add(text, { dueAt = null, hasTime = false } = {}) {
  return memory.add('tasks', text, { status: 'pending', dueAt: dueAt ? new Date(dueAt).toISOString() : null, hasTime, notifiedAt: null });
}

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
      memory.updateItem(t.id, { notifiedAt: now.toISOString() });
      fired.push(t);
      bus.emitEvent(EVENTS.REMINDER_DUE, { id: t.id, text: t.text, dueAt: t.dueAt });
      log.info('tarefas', 'Lembrete disparado');
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
