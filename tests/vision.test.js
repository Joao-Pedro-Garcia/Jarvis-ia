// Imagens e vídeos anexados → modelo de visão do Groq (simulado).
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('vision');
const realFetch = globalThis.fetch;
let models = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];
let bodies = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1:')) return realFetch(url, opts);
  if (u.endsWith('/openai/v1/models')) return new Response(JSON.stringify({ data: models.map((id) => ({ id })) }), { headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/openai/v1/chat/completions')) {
    const b = JSON.parse(opts.body); bodies.push(b);
    const hasImage = Array.isArray(b.messages.at(-1).content);
    const content = hasImage ? 'Na imagem há uma conversa: a Ana pergunta se você vai ao jantar. Sugestão: "Vou sim, chego às 20h."' : 'Ok!';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'content-type': 'application/json' } });
  }
  throw new TypeError('fetch failed');
};
const groq = await import('../server/brain/ai/groq.js');
const llm = await import('../server/brain/llm.js');
const { save } = await import('../server/core/store.js');
const { encrypt } = await import('../server/core/secrets.js');
const { createServer } = await import('../server/index.js');
const IMG = `data:image/jpeg;base64,${Buffer.alloc(300, 1).toString('base64')}`;

let base, server;
before(async () => { ({ server } = createServer()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); globalThis.fetch = realFetch; });
afterEach(() => { bodies = []; models = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct']; groq.resetVision(); });
const send = (body) => realFetch(`${base}/api/input/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('sem Groq: explica como ligar (a IA do celular não enxerga) — não inventa', async () => {
  const r = await (await send({ text: 'o que é isso?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r.text, /conecte o Groq/);
  assert.equal(bodies.length, 0);
});

test('imagem: vai para o modelo de visão junto com a conversa anterior, e a conversa salva só a marca', async () => {
  save('ai-online', { groq: { key: encrypt('gsk_teste1234567890abcdefghijKLMN'), model: 'llama-3.3-70b-versatile' } });
  await llm.refresh({ force: true });
  const first = await (await realFetch(`${base}/api/input`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'me ajuda a responder minhas mensagens' }) })).json();
  bodies = [];
  const r = await (await send({ chatId: first.chatId, text: 'o que eu respondo?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r.text, /jantar/);
  assert.equal(r.module, 'VISÃO');
  const b = bodies[0];
  assert.equal(b.model, 'meta-llama/llama-4-scout-17b-16e-instruct');
  const last = b.messages.at(-1).content;
  assert.equal(last[0].text, 'o que eu respondo?');
  assert.equal(last[1].image_url.url, IMG);
  assert.ok(b.messages.some((m) => m.role === 'user' && /responder minhas mensagens/.test(m.content)), 'levou a conversa anterior');
  const chat = await (await realFetch(`${base}/api/chats/${first.chatId}`)).json();
  const saved = JSON.stringify(chat);
  assert.match(saved, /📷 imagem o que eu respondo\?/);
  assert.ok(!saved.includes('base64'), 'a imagem não fica gravada na conversa');
});

test('vídeo: quadros em ordem + transcrição do áudio no pedido', async () => {
  const r = await (await send({ text: '', media: { kind: 'video', images: [IMG, IMG, IMG, IMG], transcript: 'Olha que gol bonito!', duration: 12 } })).json();
  assert.equal(r.module, 'VISÃO');
  const b = bodies[0];
  const last = b.messages.at(-1).content;
  assert.equal(last.filter((c) => c.type === 'image_url').length, 4);
  assert.match(last[0].text, /Do que se trata este vídeo\?[\s\S]*Olha que gol bonito!/);
  assert.match(b.messages[0].content, /VÍDEO de 12 segundos/);
});

test('conta sem modelo de visão: avisa com clareza', async () => {
  models = ['llama-3.3-70b-versatile'];
  const r = await (await send({ text: 'e isso?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r.text, /Não consegui analisar a imagem agora \(a sua conta do Groq não tem modelo que enxerga imagens agora\)/);
});

test('anexo inválido é recusado (tipo errado, sem imagem)', async () => {
  assert.equal((await send({ text: 'x', media: { kind: 'image', images: ['data:text/html;base64,PGgxPg=='] } })).status, 400);
  assert.equal((await send({ text: 'x', media: { kind: 'image', images: [] } })).status, 400);
  assert.equal((await send({ text: 'x' })).status, 400);
});

test('vídeo para transcrição: /api/stt aceita video/mp4 e manda como .mp4 ao Whisper', async () => {
  let name = null;
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).endsWith('/audio/transcriptions')) { name = opts.body.get('file').name; return new Response(JSON.stringify({ text: 'oi' }), { headers: { 'content-type': 'application/json' } }); }
    return prev(url, opts);
  };
  try {
    const r = await realFetch(`${base}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: Buffer.alloc(5000, 3) });
    assert.equal((await r.json()).text, 'oi');
    assert.equal(name, 'fala.mp4');
  } finally { globalThis.fetch = prev; }
});
