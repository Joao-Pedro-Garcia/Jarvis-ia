// CELULAR: bateria, lanterna e despertador pelo Termux — com programas FALSOS no PATH
// (termux-battery-status, termux-torch, am) para testar sem um Android.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('phone');
const { processInput } = await import('../server/brain/brain.js');
const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-bin-'));
const callLog = path.join(bin, 'calls.txt');
const origPath = process.env.PATH;
const fake = (name, body) => { fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} $*" >> "${callLog}"\n${body}\n`); fs.chmodSync(path.join(bin, name), 0o755); };
const calls = () => (fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8') : '');
const ask = async (t) => processInput(t, { sessionId: `ph-${Math.random()}` });

test('sem Termux:API (PC ou não instalado): explica como instalar, não finge', async () => {
  const saved = process.env.PATH;
  process.env.PATH = '/nonexistent';
  try {
    let r = await ask('quanto de bateria tem o celular?');
    assert.equal(r.intent, 'phone.battery');
    assert.match(r.text, /Termux:API pela F-Droid[\s\S]*pkg install termux-api/);
    r = await ask('liga a lanterna');
    assert.equal(r.intent, 'phone.torch');
    assert.match(r.text, /Não consigo mexer na lanterna daqui/);
    r = await ask('coloca um despertador para as 6h30');
    assert.match(r.text, /Não consegui criar o despertador/);
  } finally { process.env.PATH = saved; }
});

before(() => {
  fake('termux-battery-status', 'echo \'{"health":"GOOD","percentage":14,"plugged":"UNPLUGGED","status":"DISCHARGING","temperature":31.2}\'');
  fake('termux-torch', 'exit 0');
  fake('am', 'echo "Starting: Intent { act=android.intent.action.SET_ALARM }"');
  process.env.PATH = `${bin}:${origPath}`;
});
after(() => { process.env.PATH = origPath; fs.rmSync(bin, { recursive: true, force: true }); });

test('bateria: lê de verdade e sugere carregar quando está baixa', async () => {
  const r = await ask('como está a bateria?');
  assert.equal(r.text, 'A bateria está em 14%. Melhor colocar para carregar.');
});

test('"bateria do carro" é assunto de motor, não do celular', async () => {
  const r = await ask('a bateria do carro está fraca, o que pode ser?');
  assert.notEqual(r.intent, 'phone.battery');
});

test('lanterna liga e desliga', async () => {
  assert.equal((await ask('acende a lanterna')).text, 'Lanterna ligada.');
  assert.equal((await ask('desliga a lanterna')).text, 'Lanterna desligada.');
  assert.match(calls(), /termux-torch on[\s\S]*termux-torch off/);
});

test('despertador de verdade no relógio do Android (hora, minuto e dias)', async () => {
  let r = await ask('me acorda às 6h30');
  assert.equal(r.intent, 'phone.alarm');
  assert.match(r.text, /Despertador pedido ao relógio do celular para as 6h30/);
  assert.match(calls(), /am start -a android\.intent\.action\.SET_ALARM --ei android\.intent\.extra\.alarm\.HOUR 6 --ei android\.intent\.extra\.alarm\.MINUTES 30/);
  r = await ask('coloca um despertador de segunda a sexta às 5h');
  assert.match(calls(), /--eial android\.intent\.extra\.alarm\.DAYS 2,3,4,5,6 --ei android\.intent\.extra\.alarm\.HOUR 5 --ei android\.intent\.extra\.alarm\.MINUTES 0/);
  assert.match(r.text, /de segunda a sexta/);
  r = await ask('coloca um despertador');
  assert.match(r.text, /Para que horas\?/);
});
