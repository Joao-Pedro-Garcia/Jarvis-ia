import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, mockFetch, jsonResponse, textResponse } from './helpers/setup.js';

setupTestEnv('ai');
const llm = await import('../server/brain/llm.js');
let mock;
afterEach(() => { mock?.restore(); for (const k of ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL', 'ANTHROPIC_API_KEY']) delete process.env[k]; });

test('sem configuração: IA indisponível e status claro (sem vazar chave)', () => {
  assert.equal(llm.available(), false);
  assert.equal(llm.status().configured, false);
  process.env.AI_PROVIDER = 'none';
  assert.equal(llm.status().provider, 'none');
});

test('compatibilidade: ANTHROPIC_API_KEY antigo continua funcionando como provedor anthropic', () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-teste';
  const st = llm.status();
  assert.equal(st.configured, true);
  assert.equal(st.provider, 'anthropic');
  assert.equal(st.model, 'claude-opus-5-5');
  assert.ok(!JSON.stringify(st).includes('sk-ant-teste'));
});

test('provedor openai-compatible: envia sistema + mensagens e lê a resposta', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'openai', AI_API_KEY: 'sk-teste', AI_MODEL: 'modelo-x', AI_BASE_URL: 'https://api.exemplo.test/v1' });
  let sent;
  mock = mockFetch([['api.exemplo.test/v1/chat/completions', (url, opts) => { sent = { url, opts }; return jsonResponse({ choices: [{ message: { content: ' Olá! ' } }] }); }]]);
  const r = await llm.complete({ system: 'sys', messages: [{ role: 'user', content: 'oi' }] });
  assert.equal(r.text, 'Olá!');
  const body = JSON.parse(sent.opts.body);
  assert.equal(body.model, 'modelo-x');
  assert.deepEqual(body.messages[0], { role: 'system', content: 'sys' });
  assert.equal(sent.opts.headers.Authorization, 'Bearer sk-teste');
});

test('ollama local: sem chave, apenas modelo', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'ollama', AI_MODEL: 'llama3.2' });
  assert.equal(llm.available(), true);
  mock = mockFetch([['localhost:11434/v1/chat/completions', (u, o) => { assert.ok(!o.headers.Authorization); return jsonResponse({ choices: [{ message: { content: 'ok' } }] }); }]]);
  assert.equal((await llm.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] })).text, 'ok');
});

test('erros da API viram mensagens amigáveis e ficam no status', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'openai', AI_API_KEY: 'k' });
  mock = mockFetch([['chat/completions', () => jsonResponse({ error: { message: 'bad key' } }, 401)]]);
  await assert.rejects(llm.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] }), /chave da API inválida/);
  assert.equal(llm.status().lastError.message, 'chave da API inválida');
  mock.restore();
  mock = mockFetch([['chat/completions', () => textResponse('<html>gateway</html>', 200)]]);
  await assert.rejects(llm.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] }), /formato inesperado/);
});

test('rede caída e timeout não derrubam (erro tratado)', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'openai', AI_API_KEY: 'k' });
  mock = mockFetch([]); // tudo falha
  await assert.rejects(llm.complete({ system: 's', messages: [{ role: 'user', content: 'x' }] }), /sem conexão/);
  mock.restore();
  mock = mockFetch([['chat/completions', (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))]]);
  await assert.rejects(llm.complete({ system: 's', messages: [{ role: 'user', content: 'x' }], timeoutMs: 50 }), /tempo de resposta esgotado/);
});

test('completeJSON aceita JSON cercado por ``` e rejeita lixo', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'openai', AI_API_KEY: 'k' });
  mock = mockFetch([['chat/completions', () => jsonResponse({ choices: [{ message: { content: '```json\n{"a":1}\n```' } }] })]]);
  assert.deepEqual(await llm.completeJSON({ system: 's', messages: [{ role: 'user', content: 'x' }], json: {} }), { a: 1 });
});

test('provedor inválido é sinalizado no status', () => {
  process.env.AI_PROVIDER = 'inexistente';
  assert.equal(llm.available(), false);
  assert.equal(llm.status().invalidProvider, true);
});
