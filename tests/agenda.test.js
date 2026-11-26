// AGENDA: rotinas com horário que se repetem (voz, API e disparo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('agenda');
const tasks = await import('../server/modules/tasks/tasks.js');
const { processInput } = await import('../server/brain/brain.js');
const { bus } = await import('../server/core/events.js');
const { createServer } = await import('../server/index.js');

let base, server;
before(async () => { ({ server } = createServer()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
const at = (iso) => new Date(iso);
const local = (d) => d.toLocaleString('pt-BR', { timeZone: 'America/Araguaina', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

test('próximo horário respeita dias, hora e fuso de Araguaína', () => {
  const qui10h = at('2026-11-26T10:00:00-03:00'); // quinta-feira
  assert.equal(local(tasks.nextOccurrence({ days: [0, 1, 2, 3, 4, 5, 6], time: '07:00' }, qui10h)), 'sex., 27, 07:00');
  assert.equal(local(tasks.nextOccurrence({ days: [4], time: '11:15' }, qui10h)), 'qui., 26, 11:15');
  assert.equal(local(tasks.nextOccurrence({ days: [4], time: '09:00' }, qui10h)), 'qui., 03, 09:00');
  assert.equal(local(tasks.nextOccurrence({ days: [1, 2, 3, 4, 5], time: '6:30' }, at('2026-11-27T08:00:00-03:00'))), 'seg., 30, 06:30');
  assert.equal(tasks.nextOccurrence({ days: [], time: '07:00' }), null);
  assert.equal(tasks.nextOccurrence({ days: [1], time: '25:00' }), null);
});

test('descrição falada das rotinas', () => {
  assert.equal(tasks.describeRepeat({ days: [0, 1, 2, 3, 4, 5, 6], time: '07:00' }), 'todo dia às 7h');
  assert.equal(tasks.describeRepeat({ days: [1, 2, 3, 4, 5], time: '06:30' }), 'de segunda a sexta às 6h30');
  assert.equal(tasks.describeRepeat({ days: [0, 6], time: '08:00' }), 'nos fins de semana às 8h');
  assert.equal(tasks.describeRepeat({ days: [1, 3], time: '18:00' }), 'toda segunda e quarta às 18h');
});

for (const [q, re, action] of [
  ['Todo dia às 7h me lembre de tomar o remédio', /^Agendado: todo dia às 7h, vou te lembrar: Tomar o remédio\.$/, 'lembrete'],
  ['de segunda a sexta às 6h30 me dê as notícias', /^Agendado: de segunda a sexta às 6h30, notícias\.$/, 'noticias'],
  ['toda segunda e quarta às 18h academia', /toda segunda e quarta às 18h, vou te lembrar: Academia/, 'lembrete'],
  ['nos fins de semana às 8 da manhã me fala o clima', /nos fins de semana às 8h, clima de hoje/, 'clima'],
]) {
  test(`voz: "${q}"`, async () => {
    const r = await processInput(q, { sessionId: `ag-${q}` });
    assert.equal(r.intent, 'task.routine');
    assert.match(r.text, re);
    assert.equal(r.ui.panel, 'agenda');
    assert.equal(r.data.task.action, action);
  });
}

test('"todo dia às 7h" sem dizer o quê → pergunta (não cria rotina vazia)', async () => {
  const n = tasks.routines().length;
  const r = await processInput('todo dia às 7h', { sessionId: 'ag-vazio' });
  assert.match(r.text, /O que devo te lembrar/);
  assert.equal(tasks.routines().length, n);
});

test('"minhas rotinas" lista e abre a agenda', async () => {
  const r = await processInput('minhas rotinas', { sessionId: 'ag-lista' });
  assert.equal(r.intent, 'task.routines');
  assert.match(r.text, /Tomar o remédio \(todo dia às 7h\)/);
  assert.equal(r.ui.panel, 'agenda');
});

test('no horário: dispara com o comando da ação e agenda a próxima vez (nunca "concluída")', () => {
  const t = tasks.add('Notícias', { repeat: { days: [0, 1, 2, 3, 4, 5, 6], time: '07:00' }, action: 'noticias' });
  const due = new Date(t.dueAt);
  const events = [];
  const fn = (e) => { if (e.type === 'REMINDER_DUE') events.push(e.payload); };
  bus.on('*', fn);
  tasks.checkDue(new Date(due.getTime() + 30000));
  bus.off('*', fn);
  const ev = events.find((e) => e.id === t.id);
  assert.ok(ev, 'disparou');
  assert.equal(ev.command, 'notícias');
  const again = tasks.get(t.id);
  assert.equal(again.status, 'pending');
  assert.equal(new Date(again.dueAt) - due, 24 * 3600e3, 'próxima vez: amanhã no mesmo horário');
});

test('JARVIS desligado no horário: rotina atrasada não dispara depois, só reagenda', () => {
  const t = tasks.add('Água', { repeat: { days: [0, 1, 2, 3, 4, 5, 6], time: '10:00' } });
  const due = new Date(t.dueAt);
  const fired = tasks.checkDue(new Date(due.getTime() + 3 * 3600e3));
  assert.ok(!fired.some((f) => f.id === t.id));
  assert.ok(new Date(tasks.get(t.id).dueAt) > due);
});

test('API da agenda: cria rotina pela tela, valida dias/horário e recusa dado sensível', async () => {
  const post = (b) => fetch(`${base}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  let r = await post({ text: '', action: 'clima', repeat: { days: [1, 2, 3, 4, 5], time: '06:45' } });
  assert.equal(r.status, 201);
  const t = await r.json();
  assert.equal(t.text, 'Clima de hoje');
  assert.deepEqual(t.repeat, { days: [1, 2, 3, 4, 5], time: '06:45' });
  assert.equal((await post({ text: 'x', repeat: { days: [], time: '07:00' } })).status, 400);
  assert.equal((await post({ text: 'x', repeat: { days: [1], time: '7h' } })).status, 400);
  assert.equal((await post({ text: 'minha senha é 1234', repeat: { days: [1], time: '07:00' } })).status, 400);
  const list = await (await fetch(`${base}/api/tasks`)).json();
  assert.equal(list.tasks.find((x) => x.id === t.id).repeatLabel, 'de segunda a sexta às 6h45');
  assert.equal(list.actions.noticias, 'Notícias');
});
