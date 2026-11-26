// Pesquisa na internet pelo Groq (modelos "compound"), simulada.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('web-search');
const realFetch = globalThis.fetch;
let models = ['llama-3.3-70b-versatile', 'groq/compound-mini', 'groq/compound'];
let failSearch = false;
let bodies = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.endsWith('/openai/v1/models')) return new Response(JSON.stringify({ data: models.map((id) => ({ id })) }), { headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/openai/v1/chat/completions')) {
    const b = JSON.parse(opts.body);
    bodies.push(b);
    if (/compound/.test(b.model) && failSearch) return new Response(JSON.stringify({ error: { message: 'Rate limit' } }), { status: 429 });
    const content = /compound/.test(b.model) ? 'O Flamengo venceu por 2 a 1.' : 'Resposta sem internet.';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'content-type': 'application/json' } });
  }
  throw new TypeError('fetch failed');
};
const llm = await import('../server/brain/llm.js');
const groq = await import('../server/brain/ai/groq.js');
const { processInput } = await import('../server/brain/brain.js');
const { save } = await import('../server/core/store.js');
const { encrypt } = await import('../server/core/secrets.js');
const { updateSettings } = await import('../server/core/settings.js');

before(async () => {
  save('ai-online', { groq: { key: encrypt('gsk_teste1234567890abcdefghijKLMN'), model: 'llama-3.3-70b-versatile' } });
  await llm.refresh({ force: true });
});
after(() => { globalThis.fetch = realFetch; });
afterEach(() => { bodies = []; failSearch = false; models = ['llama-3.3-70b-versatile', 'groq/compound-mini', 'groq/compound']; groq.resetSearch(); updateSettings({ privacy: { allowWebSearch: true } }); });

test('pergunta sobre fato recente → pesquisa na internet (compound) e diz isso na origem', async () => {
  const r = await processInput('quem ganhou o jogo do Flamengo ontem?', { sessionId: 'ws1' });
  assert.equal(r.text, 'O Flamengo venceu por 2 a 1.');
  assert.equal(bodies[0].model, 'groq/compound-mini');
  assert.match(r.source, /pesquisou na internet/);
});

test('pergunta comum → modelo normal, sem pesquisa', async () => {
  const r = await processInput('me explica o que é fotossíntese', { sessionId: 'ws2' });
  assert.equal(bodies[0].model, 'llama-3.3-70b-versatile');
  assert.doesNotMatch(r.source, /pesquisou/);
});

test('pesquisa indisponível (limite) → responde avisado para NÃO inventar fatos recentes', async () => {
  failSearch = true;
  const r = await processInput('qual o resultado do jogo de ontem?', { sessionId: 'ws3' });
  assert.equal(r.text, 'Resposta sem internet.');
  const last = bodies.at(-1);
  assert.equal(last.model, 'llama-3.3-70b-versatile');
  assert.match(last.messages[0].content, /pesquisa na internet não está disponível agora[\s\S]*não invente/);
  assert.doesNotMatch(r.source, /pesquisou/);
});

test('conta sem modelo de pesquisa → não tenta pesquisar, só avisa a IA', async () => {
  models = ['llama-3.3-70b-versatile'];
  await processInput('quem ganhou a eleição ontem?', { sessionId: 'ws4' });
  assert.ok(bodies.every((b) => !/compound/.test(b.model)));
  assert.match(bodies[0].messages[0].content, /não invente/);
});

test('usuário desligou a pesquisa na internet → não pesquisa', async () => {
  updateSettings({ privacy: { allowWebSearch: false } });
  await processInput('qual o preço do arroz hoje?', { sessionId: 'ws5' });
  assert.ok(bodies.every((b) => !/compound/.test(b.model)));
  assert.match(bodies[0].messages[0].content, /pesquisa na internet está desligada[\s\S]*não invente/);
});
