// Imagens e vídeos anexados → visão pelo Groq (se a conta tiver) ou pelo Google Gemini (grátis). Simulado.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('vision');
const realFetch = globalThis.fetch;
const VISION_OK = /llama-4|vision-novo/;
let models = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'];
let bodies = [];
let gemBodies = [];
let geminiBusy = [];
let geminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'text-embedding-004', 'gemini-2.5-flash-preview-tts'];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1:')) return realFetch(url, opts);
  if (u.endsWith('/openai/v1/models')) return json({ data: models.map((id) => ({ id })) });
  if (u.endsWith('/openai/v1/chat/completions')) {
    const b = JSON.parse(opts.body);
    const hasImage = Array.isArray(b.messages.at(-1).content);
    if (hasImage && !VISION_OK.test(b.model)) return json({ error: { message: "'messages.1' : for 'role:user' the following must be satisfied[('messages.1.content' : value must be a string)]" } }, 400);
    if (!/Responda apenas: ok/.test(b.messages[0].content)) bodies.push(b); // ignora o teste de 1 pixel
    return json({ choices: [{ message: { content: hasImage ? 'Na imagem há uma conversa: a Ana pergunta se você vai ao jantar.' : 'Ok!' } }] });
  }
  if (u.startsWith('https://generativelanguage.googleapis.com/v1beta/models?')) {
    if (opts.headers['x-goog-api-key'] === 'AIzaChaveErrada0000000000000000000000') return json({ error: { message: 'API key not valid. Please pass a valid API key.' } }, 400);
    return json({ models: geminiModels.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: /embed/.test(m) ? ['embedContent'] : ['generateContent'] })) });
  }
  if (/generativelanguage\.googleapis\.com\/v1beta\/models\/.+:generateContent$/.test(u)) {
    gemBodies.push({ u, b: JSON.parse(opts.body), key: opts.headers['x-goog-api-key'] });
    if (geminiBusy.some((m) => u.includes(`models/${m}:`))) return json({ error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } }, 503);
    return json({ candidates: [{ content: { parts: [{ text: 'Gemini: é um print das configurações de voz.' }] } }] });
  }
  throw new TypeError('fetch failed');
};
const groq = await import('../server/brain/ai/groq.js');
const gemini = await import('../server/brain/ai/gemini.js');
const llm = await import('../server/brain/llm.js');
const { save, load } = await import('../server/core/store.js');
const { encrypt } = await import('../server/core/secrets.js');
const { createServer } = await import('../server/index.js');
const IMG = `data:image/jpeg;base64,${Buffer.alloc(300, 1).toString('base64')}`;
const GKEY = 'AIzaSyTeste000000000000000000000000000';

let base, server;
before(async () => { ({ server } = createServer()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); globalThis.fetch = realFetch; });
afterEach(() => { bodies = []; gemBodies = []; geminiBusy = []; models = ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct']; groq.resetVision(); });
const send = (body) => realFetch(`${base}/api/input/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const post = (path, body) => realFetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('sem nenhuma IA de visão: explica como ligar o Gemini (grátis) — não inventa', async () => {
  const r = await (await send({ text: 'o que é isso?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r.text, /conecte o Google Gemini/);
  assert.equal(bodies.length, 0);
});

test('Groq com visão: imagem + conversa anterior; a conversa salva só a marca', async () => {
  save('ai-online', { groq: { key: encrypt('gsk_teste1234567890abcdefghijKLMN'), model: 'llama-3.3-70b-versatile' } });
  await llm.refresh({ force: true });
  const first = await (await post('/api/input', { text: 'me ajuda a responder minhas mensagens' })).json();
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
  const saved = JSON.stringify(await (await realFetch(`${base}/api/chats/${first.chatId}`)).json());
  assert.match(saved, /📷 imagem o que eu respondo\?/);
  assert.ok(!saved.includes('base64'));
});

test('Groq com modelo de visão de NOME NOVO: descobre sozinho (testa com 1 pixel) e guarda', async () => {
  models = ['llama-3.3-70b-versatile', 'meta/vision-novo-11b'];
  const r = await (await send({ text: 'e isso?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r.text, /jantar/);
  assert.equal(bodies[0].model, 'meta/vision-novo-11b');
  assert.deepEqual(load('ai-online', {}).groq.vision.ids, ['meta/vision-novo-11b']);
});

test('vídeo: quadros em ordem + transcrição do áudio no pedido', async () => {
  const r = await (await send({ text: '', media: { kind: 'video', images: [IMG, IMG, IMG, IMG], transcript: 'Olha que gol bonito!', duration: 12 } })).json();
  assert.equal(r.module, 'VISÃO');
  const last = bodies[0].messages.at(-1).content;
  assert.equal(last.filter((c) => c.type === 'image_url').length, 4);
  assert.match(last[0].text, /Do que se trata este vídeo\?[\s\S]*Olha que gol bonito!/);
  assert.match(bodies[0].messages[0].content, /VÍDEO de 12 segundos/);
});

test('Groq SEM visão e sem Gemini: diz exatamente o que fazer (chave grátis do Gemini)', async () => {
  models = ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];
  const r = await (await send({ text: 'e isso?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r.text, /A sua conta do Groq não tem modelo que enxerga imagens\. Para eu enxergar imagens de graça, conecte o Google Gemini/);
});

test('chave do Gemini: errada é recusada; certa é testada, guardada criptografada e NÃO apaga a do Groq', async () => {
  let r = await post('/api/ai/gemini', { key: 'AIzaChaveErrada0000000000000000000000' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /chave do Gemini inválida/);
  r = await post('/api/ai/gemini', { key: GKEY });
  const d = await r.json();
  assert.equal(d.model, 'gemini-2.5-flash', 'escolhe o flash estável mais novo');
  const file = load('ai-online', {});
  assert.ok(file.groq?.key, 'a chave do Groq continua lá');
  assert.ok(!JSON.stringify(file).includes(GKEY), 'a chave do Gemini não fica em texto aberto');
  assert.equal(gemini.storedKey(), GKEY);
  assert.ok(!JSON.stringify(await (await realFetch(`${base}/api/ai/gemini`)).json()).includes(GKEY));
});

test('Groq sem visão → o Gemini responde (imagem enviada como inline_data + conversa)', async () => {
  models = ['llama-3.3-70b-versatile'];
  const r = await (await send({ text: 'o que é isso?', media: { kind: 'image', images: [IMG] } })).json();
  assert.equal(r.text, 'Gemini: é um print das configurações de voz.');
  assert.match(r.source, /Gemini \(gemini-2\.5-flash\) · visão/);
  const g = gemBodies[0];
  assert.match(g.u, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(g.key, GKEY);
  const parts = g.b.contents.at(-1).parts;
  assert.equal(parts[0].text, 'o que é isso?');
  assert.equal(parts[1].inline_data.mime_type, 'image/jpeg');
  assert.equal(parts[1].inline_data.data, IMG.split(',')[1]);
  assert.match(g.b.systemInstruction.parts[0].text, /imagem/);
});

test('Gemini sobrecarregado (503): tenta de novo e passa para outro modelo da conta', async () => {
  models = ['llama-3.3-70b-versatile'];
  geminiBusy = ['gemini-2.5-flash'];
  const r = await (await send({ text: 'e isso?', media: { kind: 'image', images: [IMG] } })).json();
  assert.equal(r.text, 'Gemini: é um print das configurações de voz.');
  const used = gemBodies.map((g) => g.u.match(/models\/(.+):/)[1]);
  assert.deepEqual(used.slice(0, 3), ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash']);
  assert.match(r.source, /gemini-2\.0-flash/);
  geminiBusy = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  const r2 = await (await send({ text: 'e agora?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r2.text, /sobrecarregado/);
});

test('remover o Groq mantém a chave do Gemini', async () => {
  const del = await realFetch(`${base}/api/ai/online?confirm=true`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal(gemini.configured(), true);
  const r = await (await send({ text: 'e agora?', media: { kind: 'image', images: [IMG] } })).json();
  assert.match(r.text, /^Gemini:/);
});

test('anexo inválido é recusado (tipo errado, sem imagem)', async () => {
  assert.equal((await send({ text: 'x', media: { kind: 'image', images: ['data:text/html;base64,PGgxPg=='] } })).status, 400);
  assert.equal((await send({ text: 'x', media: { kind: 'image', images: [] } })).status, 400);
  assert.equal((await send({ text: 'x' })).status, 400);
});

test('vídeo para transcrição: /api/stt aceita video/mp4 e manda como .mp4 ao Whisper', async () => {
  save('ai-online', { ...load('ai-online', {}), groq: { key: encrypt('gsk_teste1234567890abcdefghijKLMN'), model: 'llama-3.3-70b-versatile' } });
  let name = null;
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).endsWith('/audio/transcriptions')) { name = opts.body.get('file').name; return json({ text: 'oi' }); }
    return prev(url, opts);
  };
  try {
    const r = await realFetch(`${base}/api/stt`, { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: Buffer.alloc(5000, 3) });
    assert.equal((await r.json()).text, 'oi');
    assert.equal(name, 'fala.mp4');
  } finally { globalThis.fetch = prev; }
});

test('escolha do modelo do Gemini', () => {
  assert.equal(gemini.pickModel(['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-3.0-flash']), 'gemini-3.0-flash');
  assert.equal(gemini.pickModel(['gemini-2.5-flash-lite', 'gemini-2.5-pro']), 'gemini-2.5-flash-lite');
  assert.equal(gemini.pickModel(['text-embedding-004']), null);
});
