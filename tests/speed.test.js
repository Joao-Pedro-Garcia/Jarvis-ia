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

test('IA local (Ollama): instruções fixas, histórico que só cresce (reaproveita leitura), resposta limitada, modelo na memória', async () => {
  const bodies = []; let warmed = false;
  process.env.JARVIS_AI_THREADS = '4';
  mock = mockFetch([
    ['127.0.0.1:11434/api/tags', () => jsonResponse({ models: [{ name: 'qwen2.5:0.5b' }] })],
    ['127.0.0.1:11434/api/generate', () => { warmed = true; return jsonResponse({ done: true }); }],
    ['127.0.0.1:11434/api/chat', (u, o) => { bodies.push(JSON.parse(o.body)); return jsonResponse({ message: { content: `Resposta ${bodies.length}.` } }); }],
  ]);
  await llm.refresh({ force: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(warmed, true, 'modelo pré-carregado ao detectar');
  const sess = { sessionId: 'speed-ia' };
  const qs = ['qual a capital da Mongólia?', 'e a do Japão?', 'e a da França?', 'me conte uma curiosidade', 'e outra?', 'qual o maior planeta?'];
  for (const q of qs) await processInput(q, sess);
  delete process.env.JARVIS_AI_THREADS;
  assert.equal(bodies.length, qs.length);
  const b = bodies.at(-1);
  assert.equal(b.keep_alive, local.KEEP_ALIVE);
  assert.ok(b.options.num_predict <= 200);
  assert.equal(b.options.num_ctx, local.NUM_CTX);
  assert.equal(b.options.num_thread, 4);
  assert.ok(b.messages[0].content.length < 700, `instruções com ${b.messages[0].content.length} caracteres`);
  // Instruções idênticas em todas as perguntas (sem hora/tom) → leitura reaproveitada.
  assert.ok(bodies.every((x) => x.messages[0].content === bodies[0].messages[0].content), 'instruções mudaram entre perguntas');
  // Cada pedido começa exatamente como o anterior (histórico só cresce dentro da janela).
  let reused = 0;
  for (let i = 1; i < bodies.length; i++) {
    const prev = bodies[i - 1].messages; const cur = bodies[i].messages;
    if (cur.length > prev.length) { assert.deepEqual(cur.slice(0, prev.length), prev, `pedido ${i + 1} não reaproveita o anterior`); reused++; }
  }
  assert.ok(reused >= 3, `só ${reused} pedidos reaproveitaram o anterior (tamanhos: ${bodies.map((x) => x.messages.length).join(', ')})`);
  assert.ok(bodies.every((x) => x.messages.length <= 10), 'histórico limitado');
  assert.equal(b.messages.at(-1).content, 'qual o maior planeta?');
});

test('cumprimentos e agradecimentos respondem na hora, sem chamar a IA (mesmo com IA ligada)', async () => {
  let chats = 0;
  mock = mockFetch([
    ['127.0.0.1:11434/api/tags', () => jsonResponse({ models: [{ name: 'qwen2.5:0.5b' }] })],
    ['127.0.0.1:11434/api/generate', () => jsonResponse({ done: true })],
    ['127.0.0.1:11434/api/chat', () => { chats++; return jsonResponse({ message: { content: 'Resposta da IA.' } }); }],
  ]);
  await llm.refresh({ force: true });
  for (const q of ['boa noite', 'Jarvis, boa noite!', 'oi', 'obrigado', 'valeu jarvis', 'tudo bem?', 'tchau']) {
    const t0 = Date.now();
    const r = await processInput(q, { sessionId: 'speed-social' });
    assert.ok(Date.now() - t0 < 200, `${q}: ${Date.now() - t0} ms`);
    assert.ok(/conversation\.(greeting|thanks|smalltalk|bye)/.test(r.intent), `${q} → ${r.intent}`);
  }
  assert.equal(chats, 0, 'a IA não deveria ser chamada para cumprimentos');
  const r = await processInput('boa noite, me explica como funciona um motor a combustão', { sessionId: 'speed-social' });
  assert.equal(chats, 1, 'pergunta de verdade vai para a IA');
  assert.equal(r.text, 'Resposta da IA.');
});

test('"teste a velocidade da IA": mede núcleos em segundo plano, escolhe o mais rápido, salva e passa a usar', async () => {
  const { bus, EVENTS } = await import('../server/core/events.js');
  const { getSettings } = await import('../server/core/settings.js');
  // Simula um celular em que 4 núcleos é o mais rápido (núcleos lentos atrasam com 8).
  const rate = { 2: 9, 4: 22, 8: 6 };
  let chatBody;
  mock = mockFetch([
    ['127.0.0.1:11434/api/tags', () => jsonResponse({ models: [{ name: 'qwen2.5:0.5b' }] })],
    ['127.0.0.1:11434/api/generate', (u, o) => {
      const b = JSON.parse(o.body);
      const t = b.options?.num_thread;
      if (!b.prompt) return jsonResponse({ done: true });
      return jsonResponse({ prompt_eval_count: 40, prompt_eval_duration: (40 / rate[t]) * 1e9, eval_count: 16, eval_duration: (16 / (rate[t] * 0.8)) * 1e9 });
    }],
    ['127.0.0.1:11434/api/chat', (u, o) => { chatBody = JSON.parse(o.body); return jsonResponse({ message: { content: 'ok' } }); }],
  ]);
  await llm.refresh({ force: true });
  const done = new Promise((resolve) => bus.once(EVENTS.AI_BENCHMARK_DONE, (evt) => resolve(evt.payload)));
  const t0 = Date.now();
  const r = await processInput('teste a velocidade da IA', { sessionId: 'speed-bench' });
  assert.ok(Date.now() - t0 < 300, 'responde na hora e testa em segundo plano');
  assert.match(r.text, /Testando a velocidade/);
  const payload = await done;
  assert.equal(payload.best.threads, 4);
  assert.match(payload.text, /Melhor: 4 núcleos/);
  assert.equal(getSettings().ai.threads, 4);
  await processInput('qual o maior oceano do mundo?', { sessionId: 'speed-bench-2' });
  assert.equal(chatBody.options.num_thread, 4, 'conversa usa os núcleos escolhidos');
});
