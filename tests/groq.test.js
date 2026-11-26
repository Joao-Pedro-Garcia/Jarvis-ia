// IA online gratuita (Groq) com a IA do celular como reserva — tudo simulado
// (a rede de desenvolvimento não alcança api.groq.com).
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupTestEnv } from './helpers/setup.js';

const dir = setupTestEnv('groq');
const llm = await import('../server/brain/llm.js');
const groq = await import('../server/brain/ai/groq.js');
const local = await import('../server/brain/ai/local.js');
const { processInput } = await import('../server/brain/brain.js');
const { createServer } = await import('../server/index.js');

const KEY = 'gsk_teste1234567890abcdefghijKLMN';
const realFetch = globalThis.fetch;
let routes = {};
let calls = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1:') && !u.includes(':11434')) return realFetch(url, opts);
  calls.push({ u, opts });
  for (const [pattern, handler] of Object.entries(routes)) if (u.includes(pattern)) return handler(u, opts);
  throw new TypeError('fetch failed');
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const MODELS = { data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'meta-llama/llama-guard-4-12b' }] };
const OLLAMA = {
  ':11434/api/tags': () => json({ models: [{ name: 'qwen2.5:0.5b' }] }),
  ':11434/api/generate': () => json({ done: true }),
  ':11434/api/chat': () => json({ message: { content: 'Resposta da IA do celular.' } }),
};

let base, server;
before(async () => { ({ server } = createServer()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); globalThis.fetch = realFetch; });
afterEach(() => { routes = {}; calls = []; local.resetLocal(); });

test('chave inválida é recusada e nada é salvo', async () => {
  routes = { 'api.groq.com/openai/v1/models': () => json({ error: { message: 'Invalid API Key' } }, 401) };
  await assert.rejects(groq.saveKey(KEY), /chave do Groq inválida/);
  await assert.rejects(groq.saveKey('curta'), /não parece uma chave/);
  assert.equal(groq.groqProvider.configured(), false);
});

test('chave válida: testada de verdade, guardada CRIPTOGRAFADA e modelo escolhido sozinho', async () => {
  routes = { 'api.groq.com/openai/v1/models': (u, o) => { assert.equal(o.headers.Authorization, `Bearer ${KEY}`); return json(MODELS); } };
  const r = await groq.saveKey(`  ${KEY}  `);
  assert.equal(r.model, 'llama-3.1-8b-instant'); // ignora whisper (áudio) e guard (moderação)
  const file = fs.readFileSync(path.join(dir, 'ai-online.json'), 'utf8');
  assert.ok(!file.includes(KEY), 'a chave não pode ficar em texto aberto');
  assert.equal(groq.storedKey(), KEY);
  assert.equal(groq.keySource(), 'saved');
});

test('com a chave: Groq vira a IA principal (IA ONLINE gratuita) e a chave nunca aparece no status', async () => {
  routes = { ...OLLAMA };
  const st = await llm.refresh({ force: true });
  assert.equal(st.provider, 'auto');
  assert.equal(st.kind, 'online');
  assert.equal(st.state, 'IA ONLINE');
  assert.equal(st.providerName, 'Groq (gratuito)');
  assert.equal(st.free, true);
  assert.equal(st.fallback.model, 'qwen2.5:0.5b', 'IA do celular pronta como reserva');
  assert.ok(!JSON.stringify(st).includes(KEY));
});

test('conversa usa o Groq (com a chave e o modelo escolhido)', async () => {
  let body, auth;
  routes = { 'api.groq.com/openai/v1/chat/completions': (u, o) => { body = JSON.parse(o.body); auth = o.headers.Authorization; return json({ choices: [{ message: { content: 'Tóquio.' } }] }); } };
  const r = await processInput('qual a capital do Japão?', { sessionId: 'g1' });
  assert.equal(r.text, 'Tóquio.');
  assert.equal(auth, `Bearer ${KEY}`);
  assert.equal(body.model, 'llama-3.1-8b-instant');
  assert.match(r.source, /IA ONLINE: Groq/);
});

test('sem internet para o Groq → a IA do celular responde no lugar', async () => {
  routes = { ...OLLAMA }; // api.groq.com sem rota = sem internet
  await llm.refresh({ force: true });
  const r = await processInput('qual o maior planeta?', { sessionId: 'g2' });
  assert.equal(r.text, 'Resposta da IA do celular.');
  assert.match(r.source, /IA LOCAL \(reserva — sem internet para a IA online\)/);
});

test('limite grátis do Groq (429) → a IA do celular responde no lugar', async () => {
  routes = { ...OLLAMA, 'api.groq.com/openai/v1/chat/completions': () => json({ error: { message: 'Rate limit reached' } }, 429) };
  await llm.refresh({ force: true });
  const r = await processInput('qual o menor país do mundo?', { sessionId: 'g3' });
  assert.equal(r.text, 'Resposta da IA do celular.');
  assert.match(r.source, /limite gratuito do Groq/);
});

test('modelo retirado pelo Groq → escolhe outro disponível e tenta de novo', async () => {
  const used = [];
  routes = {
    'api.groq.com/openai/v1/models': () => json({ data: [{ id: 'llama-3.3-70b-versatile' }] }),
    'api.groq.com/openai/v1/chat/completions': (u, o) => {
      const m = JSON.parse(o.body).model; used.push(m);
      return m === 'llama-3.1-8b-instant' ? json({ error: { message: 'The model `llama-3.1-8b-instant` has been decommissioned' } }, 400) : json({ choices: [{ message: { content: 'ok novo modelo' } }] });
    },
  };
  const r = await processInput('me conte uma curiosidade', { sessionId: 'g4' });
  assert.equal(r.text, 'ok novo modelo');
  assert.deepEqual(used, ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']);
  assert.equal(groq.groqProvider.model(), 'llama-3.3-70b-versatile');
});

test('rotas: status sem vazar a chave; remover exige confirmação e volta para a IA local', async () => {
  const st = await (await realFetch(`${base}/api/ai/online`)).json();
  assert.equal(st.configured, true); assert.equal(st.source, 'saved');
  assert.ok(!JSON.stringify(st).includes(KEY));
  const all = await (await realFetch(`${base}/api/status`)).text();
  assert.ok(!all.includes(KEY));
  assert.equal((await realFetch(`${base}/api/ai/online`, { method: 'DELETE' })).status, 400);
  routes = { ...OLLAMA };
  const del = await (await realFetch(`${base}/api/ai/online?confirm=true`, { method: 'DELETE' })).json();
  assert.equal(del.ok, true);
  assert.equal(del.status.kind, 'local');
  assert.equal(groq.groqProvider.configured(), false);
});

test('rota POST /api/ai/online: chave errada devolve o motivo (sem salvar)', async () => {
  routes = { 'api.groq.com/openai/v1/models': () => json({ error: { message: 'Invalid API Key' } }, 401) };
  const res = await realFetch(`${base}/api/ai/online`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: KEY }) });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /chave do Groq inválida/);
  assert.equal(groq.groqProvider.configured(), false);
});
