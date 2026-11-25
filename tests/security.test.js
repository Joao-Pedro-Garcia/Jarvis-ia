import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('security');
process.env.JARVIS_ACCESS_TOKEN = 'token-de-teste-123';
process.env.AI_PROVIDER = 'openai';
process.env.AI_API_KEY = 'sk-SEGREDO-NAO-VAZAR';
const { createServer } = await import('../server/index.js');
let base, server;
before(async () => { ({ server } = createServer()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
const H = { 'Content-Type': 'application/json', 'X-Jarvis-Token': 'token-de-teste-123' };

test('sem token → 401; com token → 200', async () => {
  assert.equal((await fetch(`${base}/api/status`)).status, 401);
  assert.equal((await fetch(`${base}/api/status`, { headers: H })).status, 200);
});

test('chave da IA nunca aparece nas respostas', async () => {
  const body = await (await fetch(`${base}/api/status`, { headers: H })).text();
  assert.ok(!body.includes('SEGREDO'));
  assert.match(body, /"provider":"openai"/);
});

test('CSRF: Content-Type diferente de JSON é recusado (415)', async () => {
  const r = await fetch(`${base}/api/input`, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Jarvis-Token': 'token-de-teste-123' }, body: '{"text":"esqueça tudo"}' });
  assert.equal(r.status, 415);
});

test('CSRF: origem de outro site é bloqueada (403)', async () => {
  const r = await fetch(`${base}/api/input`, { method: 'POST', headers: { ...H, Origin: 'https://site-malicioso.example' }, body: '{"text":"oi"}' });
  assert.equal(r.status, 403);
  const ok = await fetch(`${base}/api/input`, { method: 'POST', headers: { ...H, Origin: base }, body: '{"text":"que horas são?"}' });
  assert.equal(ok.status, 200);
});

test('path traversal bloqueado', async () => {
  const r = await fetch(`${base}/..%2fpackage.json`);
  assert.ok([403, 404].includes(r.status));
});

test('apagar tudo e revelar segredo exigem confirmação explícita', async () => {
  assert.equal((await fetch(`${base}/api/memory`, { method: 'DELETE', headers: H })).status, 400);
  assert.equal((await fetch(`${base}/api/logs`, { method: 'DELETE', headers: H })).status, 400);
  const id = '00000000-0000-0000-0000-000000000000';
  assert.equal((await fetch(`${base}/api/memory/${id}/reveal`, { method: 'POST', headers: H, body: '{}' })).status, 400);
});

test('JSON inválido → 400 (sem derrubar o servidor)', async () => {
  const r = await fetch(`${base}/api/input`, { method: 'POST', headers: H, body: '{texto quebrado' });
  assert.equal(r.status, 400);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('cabeçalhos de segurança presentes', async () => {
  const r = await fetch(`${base}/`);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});
