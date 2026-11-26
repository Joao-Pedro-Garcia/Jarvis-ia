// Velocidade: prazo de ~3 s para dados ao vivo (o que atrasar continua em segundo
// plano) e IA local enxuta (instruções curtas, histórico curto, resposta limitada,
// modelo mantido na memória e pré-carregado).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, mockFetch, jsonResponse, textResponse } from './helpers/setup.js';

setupTestEnv('speed');
process.env.JARVIS_NEWS_BUDGET_MS = '150';
const http = await import('../server/core/http-client.js');
const news = await import('../server/modules/news/news.js');
const llm = await import('../server/brain/llm.js');
const local = await import('../server/brain/ai/local.js');
const { processInput } = await import('../server/brain/brain.js');

let mock;
afterEach(async () => { await new Promise((r) => setTimeout(r, 700)); mock?.restore(); mock = null; http.clearHttpCache(); local.resetLocal(); });
const slow = (ms, res) => () => new Promise((r) => setTimeout(() => r(res()), ms));

test('notícias, câmbio e combustíveis lentos: responde no prazo com "ainda carregando" (sem inventar)', async () => {
  mock = mockFetch([['awesomeapi', slow(500, () => textResponse('x', 503))], ['g1.globo', slow(500, () => textResponse('x', 503))], ['gov.br', slow(500, () => textResponse('x', 503))]]);
  const t0 = Date.now();
  const sum = await news.getSummary();
  assert.ok(Date.now() - t0 < 450, `demorou ${Date.now() - t0} ms`);
  assert.equal(sum.exchange.pending, true);
  assert.equal(sum.fuel.pending, true);
  assert.equal(sum.stories.error, news.PENDING.news);
  assert.match(news.exchangeText(sum.exchange).text, /ainda está carregando/);
  assert.match(news.fuelText(sum.fuel).text, /ainda estão carregando/);
});

test('"quanto está o dólar?" com fonte lenta: resposta rápida e honesta', async () => {
  mock = mockFetch([['awesomeapi', slow(500, () => textResponse('x', 503))]]);
  const t0 = Date.now();
  const r = await processInput('quanto está o dólar?', { sessionId: 'speed-1' });
  assert.ok(Date.now() - t0 < 450);
  assert.match(r.text, /ainda está carregando/);
});

test('fonte rápida continua respondendo normalmente dentro do prazo', async () => {
  const A = { USDBRL: { bid: '5.5', pctChange: '0.1', timestamp: '1795622330' }, EURBRL: { bid: '6', pctChange: '0', timestamp: '1795622330' }, GBPBRL: { bid: '7', pctChange: '0', timestamp: '1795622330' } };
  mock = mockFetch([['awesomeapi', () => jsonResponse(A)]]);
  const ex = await news.exchangeFast();
  assert.equal(ex.ok, true);
  assert.equal(ex.rates[0].value, 5.5);
});

test('IA local (Ollama): instruções curtas, histórico curto, resposta limitada e modelo mantido na memória', async () => {
  let body; let warmed = false;
  mock = mockFetch([
    ['127.0.0.1:11434/api/tags', () => jsonResponse({ models: [{ name: 'qwen2.5:0.5b' }] })],
    ['127.0.0.1:11434/api/generate', () => { warmed = true; return jsonResponse({ done: true }); }],
    ['127.0.0.1:11434/api/chat', (u, o) => { body = JSON.parse(o.body); return jsonResponse({ message: { content: 'Resposta curta.' } }); }],
  ]);
  await llm.refresh({ force: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(warmed, true, 'modelo pré-carregado ao detectar');
  const sess = { sessionId: 'speed-ia' };
  for (const q of ['qual a capital da Mongólia?', 'e a do Japão?', 'e a da França?', 'me conte uma curiosidade']) await processInput(q, sess);
  assert.equal(body.keep_alive, local.KEEP_ALIVE);
  assert.ok(body.options.num_predict <= 220);
  assert.equal(body.options.num_ctx, local.NUM_CTX);
  assert.ok(body.messages[0].content.length < 900, `instruções com ${body.messages[0].content.length} caracteres`);
  assert.ok(body.messages.length <= 6, `${body.messages.length} mensagens enviadas`);
  assert.equal(body.messages.at(-1).content, 'me conte uma curiosidade');
});
