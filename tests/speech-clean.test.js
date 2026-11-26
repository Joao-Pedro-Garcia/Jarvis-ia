// A fala diz só a informação: fontes, horário de atualização e rodapés ficam na tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('speech-clean');
const { speechFrom } = await import('../server/brain/orchestrator.js');
const news = await import('../server/modules/news/news.js');

test('remove fontes e rodapés, mantém a informação', () => {
  assert.equal(speechFrom('O Brasil cresceu 2% no trimestre (Fonte: IBGE).\nFontes: g1, CNN'), 'O Brasil cresceu 2% no trimestre.');
  assert.equal(speechFrom('Segundo o IBGE, a inflação foi de 4%. Fonte: IBGE'), 'Segundo o IBGE, a inflação foi de 4%.');
  assert.equal(speechFrom('A fonte de energia é o sol.'), 'A fonte de energia é o sol.');
  assert.equal(speechFrom('O sistema foi atualizado em março. Ele está bom.'), 'O sistema foi atualizado em março. Ele está bom.');
});

test('câmbio falado: só o valor (sem "cotação comercial", horário e fonte)', () => {
  const ex = { ok: true, rates: [{ code: 'USD', name: 'Dólar', flag: '🇺🇸', value: 5.4, changePct: 0.3, kind: 'Comercial', updatedAt: new Date().toISOString(), source: 'AwesomeAPI' }] };
  const out = news.exchangeText(ex);
  assert.equal(out.speech, 'O dólar está em 5 reais e 40 centavos, alta de 0,3 por cento.');
  assert.match(out.text, /Fonte: AwesomeAPI/, 'a fonte continua na tela');
});

test('notícias faladas: só os títulos, sem o nome do site no fim', () => {
  const s = news.storiesSpeech({ brazil: [{ title: 'Governo anuncia pacote - g1' }, { title: 'Chuva forte no Norte | CNN Brasil' }], world: [], curiosity: { title: 'Cientistas descobrem planeta - BBC News Brasil' } });
  assert.equal(s, 'No Brasil: Governo anuncia pacote. Chuva forte no Norte. Curiosidade: Cientistas descobrem planeta.');
});
