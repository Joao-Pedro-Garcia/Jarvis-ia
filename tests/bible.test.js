import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, writeFixtureBible } from './helpers/setup.js';

const dir = setupTestEnv('bible');
await writeFixtureBible(dir);
const reading = await import('../server/modules/bible/reading.js');
const store = await import('../server/core/store.js');
const books = await import('../server/modules/bible/books.js');

test('primeira leitura abre Gênesis 2–4', async () => {
  const v = await reading.openDaily(10, '2026-11-25');
  assert.equal(v.plan.label, 'Gênesis 2–4');
  assert.equal(v.ref.label, 'Gênesis 2');
  assert.equal(v.verses[0].n, 1);
  assert.equal(v.pageCount, 3); // 25 versículos / 10
  assert.equal(v.plan.done, 0);
});

test('reabrir no mesmo dia continua de onde parou (não volta a Gênesis 2:1)', async () => {
  await reading.turnPage('next', 10);
  store.clearCache(); // simula fechar e abrir o app (recarrega do disco)
  const v = await reading.openDaily(10, '2026-11-25');
  assert.equal(v.ref.label, 'Gênesis 2');
  assert.equal(v.verses[0].n, 11);
});

test('passar página até o fim do capítulo avança para Gênesis 3 e marca capítulo concluído', async () => {
  let v = await reading.turnPage('next', 10); // 21-25
  assert.equal(v.verses[0].n, 21);
  assert.equal(v.isLastPageOfChapter, true);
  v = await reading.turnPage('next', 10);
  assert.equal(v.ref.label, 'Gênesis 3');
  assert.equal(v.verses[0].n, 1);
  assert.equal(v.plan.done, 1);
  assert.equal(v.plan.chapters[0].completed, true);
});

test('voltar página no início do capítulo volta para a última página do anterior', async () => {
  const v = await reading.turnPage('prev', 10);
  assert.equal(v.ref.label, 'Gênesis 2');
  assert.equal(v.verses[0].n, 21);
  const v2 = await reading.turnPage('next', 10);
  assert.equal(v2.ref.label, 'Gênesis 3');
});

test('próximo/anterior capítulo', async () => {
  let v = await reading.changeChapter('next', 10);
  assert.equal(v.ref.label, 'Gênesis 4');
  v = await reading.changeChapter('prev', 10);
  assert.equal(v.ref.label, 'Gênesis 3');
  v = await reading.changeChapter('next', 10);
  assert.equal(v.ref.label, 'Gênesis 4');
});

test('não avança para o dia seguinte sem concluir', async () => {
  store.clearCache();
  const v = await reading.openDaily(10, '2026-11-26');
  assert.equal(v.plan.label, 'Gênesis 2–4'); // continua a pendente
  assert.match(v.message, /ainda não concluiu/);
});

test('concluir leitura: salva posição Gênesis 5, sequência 1, e o próximo dia abre Gênesis 5–7', async () => {
  let v;
  for (let i = 0; i < 10 && !(v && v.completedNow); i++) v = await reading.turnPage('next', 10, '2026-11-25');
  assert.equal(v.completedNow, true);
  assert.match(v.message, /Leitura de hoje concluída/);
  assert.equal(v.position.label, 'Gênesis 5');
  assert.equal(reading.plainState().streak, 1);
  assert.equal(reading.plainState().lastCompletedDate, '2026-11-25');
  store.clearCache();
  const same = await reading.openDaily(10, '2026-11-25');
  assert.equal(same.dayAlreadyDone, true); // não avança sozinho no mesmo dia
  const next = await reading.openDaily(10, '2026-11-26');
  assert.equal(next.plan.label, 'Gênesis 5–7');
});

test('dia 3 = Gênesis 8–10; sequência cresce em dias seguidos e reinicia após falha', async () => {
  await reading.completeToday(10, '2026-11-26');
  assert.equal(reading.plainState().streak, 2);
  const v = await reading.openDaily(10, '2026-11-27');
  assert.equal(v.plan.label, 'Gênesis 8–10');
  await reading.completeToday(10, '2026-11-29'); // pulou o dia 28
  assert.equal(reading.plainState().streak, 1);
  const d4 = await reading.openDaily(10, '2026-11-30');
  assert.equal(d4.plan.label, 'Gênesis 11–13');
});

test('leitura livre não altera o plano', async () => {
  const v = await reading.openReference({ book: 'jo', chapter: 3 }, 10);
  assert.equal(v.mode, 'free');
  assert.equal(v.ref.label, 'João 3');
  const back = await reading.openDaily(10, '2026-11-30');
  assert.equal(back.plan.label, 'Gênesis 11–13');
  assert.equal(back.mode, 'plan');
});

test('navegação canônica e referências faladas', () => {
  assert.deepEqual(books.nextChapter({ book: 'gn', chapter: 50 }), { book: 'ex', chapter: 1 });
  assert.equal(books.nextChapter({ book: 'ap', chapter: 22 }), null);
  assert.equal(books.TOTAL_CHAPTERS, 1189);
  assert.deepEqual(books.findReference('abra joao 3'), { book: 'jo', chapter: 3, explicitChapter: true });
  assert.equal(books.findReference('ler primeira corintios 13').book, '1co');
  assert.equal(books.findReference('salmo 23').book, 'sl');
  assert.equal(books.rangeLabel([{ book: 'gn', chapter: 50 }, { book: 'ex', chapter: 1 }]), 'Gênesis 50 – Êxodo 1');
});
