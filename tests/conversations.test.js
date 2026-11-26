// Conversas estilo ChatGPT: título, mensagens, categorias, busca, renomear,
// apagar, dados sensíveis e importação do histórico antigo por categoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupTestEnv } from './helpers/setup.js';

const dir = setupTestEnv('conversations');
// Histórico antigo por categoria (versão anterior) — deve ser importado, não perdido.
fs.writeFileSync(path.join(dir, 'conversations.json'), JSON.stringify({ categories: { biblia: [
  { at: '2026-11-25T20:00:00.000Z', role: 'user', text: 'Bíblia' },
  { at: '2026-11-25T20:00:01.000Z', role: 'jarvis', text: 'Leitura de hoje: Gênesis 2–4.' },
] } }));

const { categoryOf } = await import('../server/core/conversations.js');
const chats = await import('../server/core/chats.js');
const { getSettings, updateSettings } = await import('../server/core/settings.js');

test('categoria: cada assunto vai para a sua categoria', () => {
  assert.equal(categoryOf({ module: 'BÍBLIA', intent: 'bible.open' }), 'biblia');
  assert.equal(categoryOf({ module: 'TAREFAS', intent: 'task.add' }), 'tarefas');
  assert.equal(categoryOf({ module: 'MOTOR', intent: 'physics.solve' }), 'calculos');
  assert.equal(categoryOf({ module: 'NOTÍCIAS', intent: 'news.exchange' }), 'noticias');
  assert.equal(categoryOf({ module: 'CÉREBRO', intent: 'conversation.local', tone: 'desabafo' }), 'desabafo');
  assert.equal(categoryOf({ module: 'CÉREBRO', intent: 'conversation.local', tone: 'normal' }), 'conversa');
  assert.equal(categoryOf({ module: 'SISTEMA', intent: 'system.status' }), 'sistema');
});

test('histórico antigo por categoria é importado como conversa (nada se perde)', () => {
  const old = chats.list().find((c) => /Histórico — Bíblia/.test(c.title));
  assert.ok(old, 'conversa importada');
  assert.equal(chats.get(old.id).messages.length, 2);
  assert.ok(fs.existsSync(path.join(dir, 'conversations.json')), 'arquivo antigo preservado');
});

test('título automático a partir da primeira mensagem', () => {
  assert.equal(chats.makeTitle('jarvis, abra a bíblia'), 'Abra a bíblia');
  assert.equal(chats.makeTitle(''), 'Nova conversa');
  assert.ok(chats.makeTitle('a'.repeat(80)).length <= 42);
});

test('conversa: grava pergunta e resposta, guarda categorias e aparece primeiro na lista', () => {
  const id = chats.newId();
  chats.append(id, 'Jarvis, quanto tempo para 150 km a 90 km/h?', { intent: 'physics.solve', module: 'MOTOR', text: '1 h 40 min.' });
  chats.append(id, 'lembre que o carro é um Gol', { intent: 'memory.remember', module: 'MEMÓRIA', text: 'Certo.' });
  const c = chats.get(id);
  assert.equal(c.title, 'Quanto tempo para 150 km a 90 km/h?');
  assert.equal(c.messages.length, 4);
  assert.deepEqual(c.categories, ['calculos', 'memoria']);
  assert.equal(chats.list()[0].id, id);
  assert.equal(chats.historyFor(id).at(-1).role, 'assistant');
});

test('conversas separadas não se misturam; filtro por categoria e busca pelo título', () => {
  const a = chats.newId(); const b = chats.newId();
  chats.append(a, 'Bíblia', { intent: 'bible.open', module: 'BÍBLIA', text: 'Gênesis 2.' });
  chats.append(b, 'estou cansado hoje', { intent: 'conversation.local', module: 'CÉREBRO', tone: 'desabafo', text: 'Sinto muito.' });
  assert.ok(chats.get(a).messages.every((m) => !/cansado/.test(m.text)));
  assert.ok(chats.list({ category: 'desabafo' }).some((c) => c.id === b));
  assert.ok(!chats.list({ category: 'desabafo' }).some((c) => c.id === a));
  assert.ok(chats.list({ q: 'cansado' }).some((c) => c.id === b));
  assert.ok(chats.categoriesInUse().some((c) => c.id === 'desabafo'));
});

test('dados sensíveis nunca são gravados (nem no título)', () => {
  const id = chats.newId();
  chats.append(id, 'minha senha é 1234', { intent: 'memory.remember', module: 'MEMÓRIA', text: 'segredo', sensitive: true });
  const c = chats.get(id);
  assert.doesNotMatch(JSON.stringify(c), /1234|segredo/);
  assert.equal(c.title, 'Conversa protegida');
});

test('renomear e apagar uma conversa não afeta as outras', () => {
  const a = chats.newId(); const b = chats.newId();
  chats.append(a, 'primeira', { intent: 'conversation', module: 'CÉREBRO', text: 'ok' });
  chats.append(b, 'segunda', { intent: 'conversation', module: 'CÉREBRO', text: 'ok' });
  assert.equal(chats.rename(a, '  Minha conversa  ').title, 'Minha conversa');
  assert.equal(chats.rename(a, '   '), null);
  assert.equal(chats.remove(b), true);
  assert.equal(chats.get(b), null);
  assert.equal(chats.get(a).title, 'Minha conversa');
  assert.equal(chats.remove('nao-e-um-id'), false);
});

test('configurações continuam as mesmas depois de salvar', () => {
  updateSettings({ voice: { rate: 1.3 }, clap: { enabled: true } });
  const s = getSettings();
  assert.equal(s.voice.rate, 1.3);
  assert.equal(s.clap.enabled, true);
});
