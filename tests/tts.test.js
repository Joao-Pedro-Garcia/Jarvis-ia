// Voz própria do JARVIS: cliente WebSocket contra um servidor de voz SIMULADO
// (a rede de desenvolvimento não alcança o serviço real).
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('tts');
process.env.JARVIS_ESPEAK = '0'; // sem eSpeak: testa a falta de reserva no servidor

let mode = 'ok';
let received = [];
let connections = 0;
const AUDIO = Buffer.from('ID3-fake-mp3-audio-bytes');

const fake = net.createServer((sock) => {
  connections++;
  let buf = Buffer.alloc(0);
  let open = false;
  sock.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!open) {
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) return;
      const head = buf.subarray(0, end).toString();
      buf = buf.subarray(end + 4);
      received.push({ head });
      if (mode === 'deny' || (mode === 'clock' && connections === 1) || (mode === 'newver' && /Sec-MS-GEC-Version=1-143\./.test(head))) {
        sock.end(`HTTP/1.1 403 Forbidden\r\nDate: ${new Date(Date.now() + 3600e3).toUTCString()}\r\nContent-Length: 0\r\n\r\n`);
        return;
      }
      if (mode === 'silent') return; // nunca responde → tempo esgotado
      const key = /sec-websocket-key: (.+)/i.exec(head)[1].trim();
      const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      open = true;
    }
    const { parseFrames } = await import('../server/modules/voice/edge-tts.js');
    const { frames, rest } = parseFrames(buf);
    buf = rest;
    for (const f of frames) {
      const txt = f.payload.toString('utf8');
      received.push({ frame: txt });
      if (/Path:ssml/.test(txt)) {
        const send = (opcode, payload) => { const h = Buffer.alloc(2); h[0] = 0x80 | opcode; h[1] = payload.length; sock.write(Buffer.concat([h, payload])); };
        const audioMsg = (data) => { const header = Buffer.from('X-RequestId:x\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n'); const len = Buffer.alloc(2); len.writeUInt16BE(header.length); return Buffer.concat([len, header, data]); };
        send(1, Buffer.from('X-RequestId:x\r\nPath:turn.start\r\n\r\n{}'));
        send(2, audioMsg(AUDIO.subarray(0, 10)));
        send(2, audioMsg(AUDIO.subarray(10)));
        send(1, Buffer.from('X-RequestId:x\r\nPath:turn.end\r\n\r\n{}'));
      }
    }
  });
  sock.on('error', () => {});
});

let edge, tts, base, server;
before(async () => {
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  process.env.JARVIS_EDGE_TTS_URL = `ws://127.0.0.1:${fake.address().port}/consumer/speech/synthesize/readaloud/edge/v1`;
  edge = await import('../server/modules/voice/edge-tts.js');
  tts = await import('../server/modules/voice/tts.js');
  const { createServer } = await import('../server/index.js');
  ({ server } = createServer());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { fake.close(); server.close(); });
afterEach(() => { mode = 'ok'; received = []; connections = 0; tts.resetTts(); });

test('token anti-abuso: 64 hex maiúsculos, igual dentro da mesma janela de 5 min', () => {
  const t0 = 1_700_000_100; // múltiplo de 300 + 100 s após o início da janela (em ticks do Windows)
  const a = edge.secMsGec(t0);
  assert.match(a, /^[0-9A-F]{64}$/);
  assert.equal(edge.secMsGec(t0 + 10), a);
  assert.notEqual(edge.secMsGec(t0 + 600), a);
});

test('SSML: voz masculina por padrão, velocidade/tom convertidos e texto escapado', () => {
  const x = edge.ssml('Preço < 5 & "ok"', { rate: 1.2, pitch: 0.9 });
  assert.match(x, /Microsoft Server Speech Text to Speech Voice \(pt-BR, AntonioNeural\)/);
  assert.match(x, /rate='\+20%'/);
  assert.match(x, /pitch='-10Hz'/);
  assert.match(x, /Preço &lt; 5 &amp; &quot;ok&quot;/);
  assert.match(edge.ssml('oi', { voice: 'voz-inventada' }), /AntonioNeural/, 'voz desconhecida volta para a padrão');
});

test('quadros WebSocket: o que o cliente codifica o leitor decodifica (inclui texto grande)', () => {
  const big = 'á'.repeat(70000);
  const { frames, rest } = edge.parseFrames(Buffer.concat([edge.encodeFrame(1, 'olá'), edge.encodeFrame(1, big)]));
  assert.equal(rest.length, 0);
  assert.deepEqual(frames.map((f) => f.payload.toString('utf8')), ['olá', big]);
});

test('sintetiza: aperto de mão com cabeçalhos do Edge, config + SSML, junta os pedaços de áudio', async () => {
  const audio = await edge.synthesize('Bom dia, senhor.');
  assert.deepEqual(audio, AUDIO);
  const head = received[0].head;
  assert.match(head, /TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4/);
  assert.match(head, /Sec-MS-GEC=[0-9A-F]{64}/);
  assert.match(head, /Origin: chrome-extension:\/\/jdiccldimpdaibmpdkjnbmckianbfold/);
  const frames = received.filter((r) => r.frame).map((r) => r.frame);
  assert.match(frames[0], /Path:speech\.config/);
  assert.match(frames[0], /audio-24khz-48kbitrate-mono-mp3/);
  assert.match(frames[1], /Path:ssml[\s\S]*Bom dia, senhor\./);
});

test('403 por relógio do celular errado → acerta pela hora do servidor e tenta de novo', async () => {
  mode = 'clock';
  const audio = await edge.synthesize('teste');
  assert.deepEqual(audio, AUDIO);
  assert.equal(connections, 2);
});

test('403 por versão do Edge não aceita → tenta outra versão e lembra a que funcionou', async () => {
  mode = 'newver';
  assert.deepEqual(await edge.synthesize('teste'), AUDIO);
  const versions = received.filter((r) => r.head).map((r) => /Sec-MS-GEC-Version=1-([\d.]+)/.exec(r.head)[1]);
  assert.equal(versions[0].split('.')[0], '143');
  assert.notEqual(versions.at(-1).split('.')[0], '143');
  received = [];
  await edge.synthesize('de novo');
  assert.equal(received.filter((r) => r.head).length, 1, 'na próxima já usa a versão que funcionou');
  assert.match(received.find((r) => r.head).head, /Cookie: muid=[0-9A-F]{32};/);
});

test('servidor mudo → desiste no tempo limite (não trava a fala)', async () => {
  mode = 'silent';
  const t = Date.now();
  await assert.rejects(edge.synthesize('oi', { timeoutMs: 300 }), /tempo de resposta/);
  assert.ok(Date.now() - t < 2000);
});

test('rota /api/tts devolve MP3; frase repetida sai do cache sem nova conexão', async () => {
  const ask = () => fetch(`${base}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Às suas ordens.' }) });
  const r1 = await ask();
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r1.headers.get('x-voice-engine'), 'neural');
  assert.deepEqual(Buffer.from(await r1.arrayBuffer()), AUDIO);
  const before = connections;
  assert.equal((await ask()).status, 200);
  assert.equal(connections, before, 'cache: não conectou de novo');
});

test('voz própria recusada e sem eSpeak → 503 (o navegador usa a voz do celular) e não insiste por 1 min', async () => {
  mode = 'deny';
  const ask = () => fetch(`${base}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'teste de falha' }) });
  const r = await ask();
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /voz do JARVIS indisponível/);
  const n = connections;
  assert.equal((await ask()).status, 503);
  assert.equal(connections, n, 'durante 1 min não tenta de novo (sem esperar timeout a cada frase)');
  const st = await (await fetch(`${base}/api/tts`)).json();
  assert.equal(st.neural.available, false);
  assert.equal(st.voices[0].id, 'pt-BR-AntonioNeural');
});

test('texto vazio é recusado', async () => {
  const r = await fetch(`${base}/api/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '  ' }) });
  assert.equal(r.status, 400);
});
