import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('conversations');
const { categoryOf, record, listCategories, getCategory, clearCategory } = await import('../server/core/conversations.js');
const { processInput } = await import('../server/brain/brain.js');
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

test('registro: conversas não se misturam entre categorias', async () => {
  record('lembre que o carro é um Gol', { intent: 'memory.remember', module: 'MEMÓRIA', text: 'Certo.' });
  record('onde parei?', { intent: 'bible.where', module: 'BÍBLIA', text: 'Gênesis 2.' });
  const mem = getCategory('memoria');
  const bib = getCategory('biblia');
  assert.ok(mem.every((m) => !/Gênesis/.test(m.text)));
  assert.ok(bib.every((m) => !/Gol/.test(m.text)));
  assert.ok(listCategories().some((c) => c.id === 'memoria' && c.count >= 2));
});

test('dados sensíveis não são gravados na conversa', () => {
  record('minha senha é 1234', { intent: 'memory.remember', module: 'MEMÓRIA', text: 'segredo', sensitive: true });
  const all = getCategory('memoria').map((m) => m.text).join(' ');
  assert.doesNotMatch(all, /1234|segredo/);
});

test('apagar uma categoria não apaga as outras', () => {
  const n = clearCategory('biblia');
  assert.ok(n >= 2);
  assert.equal(getCategory('biblia').length, 0);
  assert.ok(getCategory('memoria').length >= 2);
});

test('configurações continuam as mesmas depois de salvar', () => {
  updateSettings({ voice: { rate: 1.3 }, clap: { enabled: true } });
  const s = getSettings();
  assert.equal(s.voice.rate, 1.3);
  assert.equal(s.clap.enabled, true);
});
