// Ouvido com Whisper (Groq simulado): rota /api/stt, modelo de reserva e frases "fantasma".
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('stt');
const realFetch = globalThis.fetch;
let handler = null;
let seen = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1:')) return realFetch(url, opts);
  if (u.includes('api.groq.com') && handler) { seen.push({ u, opts }); return handler(u, opts); }
  throw new TypeError('fetch failed');
};
const groq = await import('../server/brain/ai/groq.js');
const { save } = await import('../server/core/store.js');
const { encrypt } = await import('../server/core/secrets.js');
const { createServer } = await import('../server/index.js');
const KEY = 'gsk_teste1234567890abcdefghijKLMN';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const AUDIO = Buffer.alloc(4000, 7);

let base, server;
before(async () => { ({ server } = createServer()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); globalThis.fetch = realFetch; });
afterEach(() => { handler = null; seen = []; });
const post = (body = AUDIO, type = 'audio/webm') => realFetch(`${base}/api/stt`, { method: 'POST', headers: { 'Content-Type': type }, body });

test('sem chave do Groq: indisponível (o navegador usa o Google)', async () => {
  assert.equal((await (await realFetch(`${base}/api/stt`)).json()).available, false);
  const r = await post();
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /sem internet|Groq não conectado/);
});

test('com chave: envia o áudio ao Whisper em português e devolve o texto', async () => {
  save('ai-online', { groq: { key: encrypt(KEY), model: 'llama-3.1-8b-instant' } });
  handler = async (u, o) => {
    assert.match(u, /\/openai\/v1\/audio\/transcriptions$/);
    assert.equal(o.headers.Authorization, `Bearer ${KEY}`);
    const fd = o.body;
    assert.equal(fd.get('model'), 'whisper-large-v3-turbo');
    assert.equal(fd.get('language'), 'pt');
    assert.equal(fd.get('file').name, 'fala.webm');
    assert.equal(fd.get('file').size, AUDIO.length);
    return json({ text: ' Jarvis, como está o dia hoje? ' });
  };
  assert.equal((await (await realFetch(`${base}/api/stt`)).json()).available, true);
  const r = await post();
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.text, 'Jarvis, como está o dia hoje?');
  assert.equal(d.model, 'whisper-large-v3-turbo');
});

test('modelo retirado → usa o outro Whisper', async () => {
  handler = async (u, o) => (o.body.get('model') === 'whisper-large-v3-turbo' ? json({ error: { message: 'The model whisper-large-v3-turbo has been decommissioned' } }, 400) : json({ text: 'ok' }));
  const d = await (await post(AUDIO, 'audio/ogg')).json();
  assert.equal(d.text, 'ok');
  assert.equal(d.model, 'whisper-large-v3');
  assert.equal(seen[0].opts.body.get('file').name, 'fala.ogg');
});

test('frases inventadas pelo Whisper em silêncio são descartadas', async () => {
  for (const t of ['Legendas pela comunidade Amara.org', 'Obrigado por assistir.', 'Obrigado.', '...']) assert.equal(groq.cleanTranscript(t), '', t);
  assert.equal(groq.cleanTranscript('Obrigado pela ajuda, Jarvis'), 'Obrigado pela ajuda, Jarvis');
  handler = async () => json({ text: 'Legendas pela comunidade Amara.org' });
  assert.equal((await (await post()).json()).text, '');
});

test('limite grátis (429) e chave revogada (401) viram mensagens claras', async () => {
  handler = async () => json({ error: { message: 'Rate limit' } }, 429);
  let r = await post();
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /limite gratuito do Groq/);
  handler = async () => json({ error: { message: 'Invalid API Key' } }, 401);
  r = await post();
  assert.equal(r.status, 401);
  assert.match((await r.json()).error, /chave do Groq inválida/);
});

test('só aceita áudio; áudio curto demais não gasta o Groq', async () => {
  assert.equal((await post(JSON.stringify({ a: 1 }), 'application/json')).status, 415);
  handler = async () => { throw new Error('não deveria chamar'); };
  const d = await (await post(Buffer.alloc(200), 'audio/webm')).json();
  assert.equal(d.text, '');
  assert.equal(seen.length, 0);
});
