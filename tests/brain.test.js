import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, writeFixtureBible } from './helpers/setup.js';

const dir = setupTestEnv('brain');
await writeFixtureBible(dir);
const { processInput } = await import('../server/brain/brain.js');
const memory = await import('../server/modules/memory/memory.js');
const { updateSettings } = await import('../server/core/settings.js');

const S = { sessionId: 'teste', pageSize: 10 };

test('conversa contínua com a Bíblia (contexto entre frases)', async () => {
  let r = await processInput('JARVIS, abra a Bíblia.', S);
  assert.equal(r.intent, 'bible.open');
  assert.equal(r.ui.bible.ref.label, 'Gênesis 2');
  r = await processInput('Qual capítulo?', S);
  assert.equal(r.intent, 'bible.where');
  assert.match(r.text, /Gênesis 2/);
  r = await processInput('Passe a página.', S);
  assert.equal(r.ui.bible.verses[0].n, 11);
  r = await processInput('Volta.', S);
  assert.equal(r.intent, 'bible.prev_page');
  assert.equal(r.ui.bible.verses[0].n, 1);
  r = await processInput('avança', S);
  assert.equal(r.ui.bible.verses[0].n, 11);
});

test('memória: lembrar, consultar e esquecer com confirmação', async () => {
  let r = await processInput('JARVIS, lembre que meu carro é um Gol 2014.', S);
  assert.equal(r.intent, 'memory.remember');
  assert.equal(memory.list('facts').length, 1);
  assert.equal(memory.list('facts')[0].text, 'meu carro é um Gol 2014');
  r = await processInput('O que você lembra sobre meu carro?', S);
  assert.match(r.text, /Gol 2014/);
  r = await processInput('Esqueça que meu carro é um Gol', S);
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.text, /Tem certeza que deseja apagar/);
  assert.equal(memory.list('facts').length, 1); // ainda não apagou
  r = await processInput('não', S);
  assert.equal(memory.list('facts').length, 1);
  await processInput('Esqueça que meu carro é um Gol', S);
  r = await processInput('sim', S);
  assert.equal(r.text, 'Memória apagada.');
  assert.equal(memory.list('facts').length, 0);
});

test('lembre disso usa a frase anterior', async () => {
  await processInput('minha esposa faz aniversário dia 12 de março', S);
  const r = await processInput('lembre disso', S);
  assert.match(r.text, /12 de março/);
});

test('dados sensíveis pedem confirmação antes de salvar', async () => {
  const before = memory.list('facts').length;
  const r = await processInput('lembre que a senha do wifi é abc12345', S);
  assert.equal(r.awaitingConfirmation, true);
  assert.equal(memory.list('facts').length, before);
  await processInput('não', S);
  assert.equal(memory.list('facts').length, before);
});

test('modo seguro pede confirmação para ações que alteram dados e bloqueia a casa', async () => {
  updateSettings({ security: { safeMode: true } });
  let r = await processInput('adicione uma tarefa comprar pastilha de freio', S);
  assert.equal(r.awaitingConfirmation, true);
  r = await processInput('sim', S);
  assert.match(r.text, /Tarefa anotada/);
  r = await processInput('ligar a luz da sala', S);
  assert.match(r.text, /modo seguro/i);
  updateSettings({ security: { safeMode: false } });
});

test('casa sem integração: informa indisponível (não inventa dispositivo)', async () => {
  const r = await processInput('ligar a luz da sala', S);
  assert.match(r.text, /não tem nenhuma integração real configurada/);
});

test('sem IA configurada: desabafo recebe resposta acolhedora e honesta', async () => {
  const r = await processInput('JARVIS, estou cansado hoje.', S);
  assert.equal(r.tone, 'desabafo');
  assert.match(r.text, /sinto muito/);
  assert.match(r.text, /não está configurada/);
});

test('fala: remove emojis/URLs e limita tamanho', async () => {
  const r = await processInput('quanto é 2 mais 2?', S);
  assert.equal(r.speech, 'O resultado é 4.');
  assert.equal(r.text, '2 + 2 = 4');
});
