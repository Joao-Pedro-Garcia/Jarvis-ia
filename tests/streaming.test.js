// Resposta palavra por palavra: Ollama (simulado) → cérebro → rota /api/input/stream.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('streaming');
const llm = await import('../server/brain/llm.js');
const { processInput } = await import('../server/brain/brain.js');
const { createServer } = await import('../server/index.js');

// Ollama simulado: lista de modelos, pré-carregamento e /api/chat em pedaços (NDJSON).
let chunks = ['Olá', ', ', 'tudo', ' bem?'];
let failMidway = false;
const realFetch = globalThis.fetch;
function ollamaStream() {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      for (const [i, c] of chunks.entries()) {
        await new Promise((r) => setTimeout(r, 10));
        if (failMidway && i === 2) { ctrl.enqueue(enc.encode(`${JSON.stringify({ error: 'modelo travou' })}\n`)); ctrl.close(); return; }
        ctrl.enqueue(enc.encode(`${JSON.stringify({ message: { role: 'assistant', content: c }, done: false })}\n`));
      }
      ctrl.enqueue(enc.encode(`${JSON.stringify({ done: true, eval_count: chunks.length })}\n`));
      ctrl.close();
    },
  });
}
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.includes(':11434')) return realFetch(url, opts);
  if (u.endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen2.5:0.5b' }] }));
  if (u.endsWith('/api/generate')) return new Response(JSON.stringify({ done: true }));
  if (u.endsWith('/api/chat')) {
    const body = JSON.parse(opts.body);
    if (body.stream) return new Response(ollamaStream(), { headers: { 'content-type': 'application/x-ndjson' } });
    return new Response(JSON.stringify({ message: { content: chunks.join('') } }));
  }
  throw new TypeError('fetch failed');
};

let base, server;
before(async () => {
  await llm.refresh({ force: true });
  ({ server } = createServer());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); globalThis.fetch = realFetch; });

test('cérebro repassa cada pedaço da IA local e devolve o texto completo', async () => {
  const got = [];
  const r = await processInput('me conta uma curiosidade sobre o espaço', { sessionId: 'st-1', onToken: (t) => got.push(t) });
  assert.deepEqual(got, chunks);
  assert.equal(r.text, 'Olá, tudo bem?');
});

test('rota /api/input/stream: pedaços na ordem e o resultado final no fim', async () => {
  const res = await realFetch(`${base}/api/input/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'me fala do sistema solar' }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /ndjson/);
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  const tokens = lines.filter((l) => l.type === 'token').map((l) => l.text);
  assert.deepEqual(tokens, chunks);
  const done = lines.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.result.text, 'Olá, tudo bem?');
  assert.match(done.result.chatId, /^[0-9a-f-]{36}$/);
});

test('comandos locais pela rota de pedaços: só o resultado final (sem acionar a IA)', async () => {
  const res = await realFetch(`${base}/api/input/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'quanto é 2 mais 2' }) });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].result.text, '2 + 2 = 4');
});

test('IA local falha no meio da resposta → modo local avisa (não trava)', async () => {
  failMidway = true;
  try {
    const r = await processInput('estou triste hoje', { sessionId: 'st-2', onToken: () => {} });
    assert.match(r.text, /Não consegui acessar a IA agora/);
  } finally { failMidway = false; }
});

test('rota antiga /api/input continua funcionando', async () => {
  const r = await (await realFetch(`${base}/api/input`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'qual o maior oceano?' }) })).json();
  assert.equal(r.text, 'Olá, tudo bem?');
});
