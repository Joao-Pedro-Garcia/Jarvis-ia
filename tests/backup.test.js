// Backup automático diário + restaurar (sem as chaves).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupTestEnv } from './helpers/setup.js';

const dir = setupTestEnv('backup');
const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-ext-'));
process.env.JARVIS_BACKUP_DIR = ext;
const backups = await import('../server/core/auto-backup.js');
const memory = await import('../server/modules/memory/memory.js');
const { save } = await import('../server/core/store.js');
const { createServer } = await import('../server/index.js');

let base, server;
before(async () => { ({ server } = createServer()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { server.close(); fs.rmSync(ext, { recursive: true, force: true }); });

test('backup do dia: guarda os dados, NÃO guarda a chave do Groq, copia para o armazenamento do celular', () => {
  memory.add('facts', 'O usuário mora em Araguaína.');
  save('ai-online', { groq: { key: 'segredo-criptografado' } });
  const r = backups.dailyBackup();
  assert.ok(r, 'fez o backup');
  assert.equal(r.external, ext);
  const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(backups.internalDir(), r.name))).toString());
  assert.ok(bundle.files['memory.json'].includes('Araguaína'));
  assert.ok(!('ai-online.json' in bundle.files), 'chave do Groq fora do backup');
  assert.ok(fs.existsSync(path.join(ext, r.name)), 'cópia externa');
  assert.equal(backups.dailyBackup(), null, 'só um por dia');
});

test('restaurar: volta os dados e guarda antes o estado atual', async () => {
  const name = backups.listBackups().find((b) => !/antes/.test(b.name)).name;
  memory.add('facts', 'Fato criado depois do backup.');
  assert.equal((await fetch(`${base}/api/backups/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).status, 400, 'exige confirmação');
  const r = await (await fetch(`${base}/api/backups/restore?confirm=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json();
  assert.ok(r.restored >= 1);
  assert.match(r.safety, /antes-de-restaurar/);
  const facts = memory.list().facts.map((f) => f.text);
  assert.ok(facts.includes('O usuário mora em Araguaína.'));
  assert.ok(!facts.includes('Fato criado depois do backup.'));
  assert.ok(fs.existsSync(path.join(dir, 'ai-online.json')), 'restaurar não apaga a chave do Groq');
});

test('nome de arquivo inválido ou arquivo danificado: recusa sem mexer em nada', () => {
  assert.throws(() => backups.restoreBackup('../../etc/passwd'), /inválido/);
  fs.writeFileSync(path.join(backups.internalDir(), 'jarvis-2020-01-01.json.gz'), 'lixo');
  assert.throws(() => backups.restoreBackup('jarvis-2020-01-01.json.gz'), /danificado/);
});

test('mantém só os últimos 14 backups', () => {
  for (let i = 1; i <= 20; i++) fs.writeFileSync(path.join(backups.internalDir(), `jarvis-2025-01-${String(i).padStart(2, '0')}.json.gz`), 'x');
  backups.makeBackup();
  const left = fs.readdirSync(backups.internalDir()).filter((f) => !/antes/.test(f));
  assert.equal(left.length, 14);
});

test('rotas: listar e fazer backup agora', async () => {
  const r = await (await fetch(`${base}/api/backups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  assert.ok(r.files >= 1);
  const l = await (await fetch(`${base}/api/backups`)).json();
  assert.ok(l.backups.length >= 1);
  assert.equal(l.external, ext);
});
