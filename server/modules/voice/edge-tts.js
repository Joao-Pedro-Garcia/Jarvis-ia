// VOZ NEURAL GRATUITA — as vozes naturais do "Ler em voz alta" do Microsoft Edge.
// Sem chave, sem cadastro, sem cartão. Precisa de internet. É um serviço NÃO
// oficial (o mesmo que o navegador Edge usa): pode parar de funcionar sem aviso,
// e então o JARVIS volta sozinho para a voz do celular.
// Privacidade: o TEXTO das respostas faladas vai para a Microsoft para virar áudio.
//
// Cliente WebSocket mínimo (RFC 6455) feito aqui mesmo, sem dependências: o
// servidor exige cabeçalhos (Origin, User-Agent) que o WebSocket do Node não deixa definir.
import tls from 'node:tls';
import net from 'node:net';
import crypto from 'node:crypto';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL = '140.0.3485.14';
const CHROMIUM_MAJOR = CHROMIUM_FULL.split('.')[0];
const DEFAULT_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const endpoint = () => process.env.JARVIS_EDGE_TTS_URL || DEFAULT_URL;

// Vozes masculinas que falam português. A primeira é a padrão.
export const VOICES = [
  { id: 'pt-BR-AntonioNeural', name: 'Antônio (português do Brasil)', gender: 'M' },
  { id: 'en-US-AndrewMultilingualNeural', name: 'Andrew (multilíngue, leve sotaque)', gender: 'M' },
  { id: 'en-US-BrianMultilingualNeural', name: 'Brian (multilíngue, leve sotaque)', gender: 'M' },
  { id: 'pt-PT-DuarteNeural', name: 'Duarte (português de Portugal)', gender: 'M' },
  { id: 'pt-BR-FranciscaNeural', name: 'Francisca (feminina)', gender: 'F' },
];
export const DEFAULT_VOICE = VOICES[0].id;

let clockSkew = 0; // segundos de diferença para o relógio do servidor (corrige 403 por hora errada)

/** Token anti-abuso exigido pelo servidor: SHA-256 de (ticks do Windows arredondados a 5 min + token). */
export function secMsGec(nowSec = Date.now() / 1000 + clockSkew) {
  let ticks = Math.floor(nowSec) + 11644473600;
  ticks -= ticks % 300;
  const hundredNs = BigInt(ticks) * 10000000n;
  return crypto.createHash('sha256').update(`${hundredNs}${TRUSTED_CLIENT_TOKEN}`, 'ascii').digest('hex').toUpperCase();
}

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const signed = (n, unit) => `${n >= 0 ? '+' : ''}${Math.round(n)}${unit}`;
const stamp = () => new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');

export function ssml(text, { voice = DEFAULT_VOICE, rate = 1, pitch = 1 } = {}) {
  const v = VOICES.some((x) => x.id === voice) ? voice : DEFAULT_VOICE;
  const [lang, region, short] = v.split('-');
  const full = `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${short})`;
  // rate 1 = normal; 1.2 = 20% mais rápido. pitch 1 = normal; 0.9 = mais grave.
  const r = signed((Math.min(Math.max(rate, 0.5), 2) - 1) * 100, '%');
  const p = signed((Math.min(Math.max(pitch, 0.5), 1.5) - 1) * 100, 'Hz');
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'><voice name='${full}'><prosody pitch='${p}' rate='${r}' volume='+0%'>${escXml(text)}</prosody></voice></speak>`;
}

// ---------- quadros WebSocket ----------
function frame(opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const mask = crypto.randomBytes(4);
  let head;
  if (data.length < 126) { head = Buffer.alloc(2); head[1] = 0x80 | data.length; }
  else if (data.length < 65536) { head = Buffer.alloc(4); head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2); }
  else { head = Buffer.alloc(10); head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
  head[0] = 0x80 | opcode;
  const body = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) body[i] = data[i] ^ mask[i & 3];
  return Buffer.concat([head, mask, body]);
}

/** Lê quadros completos do buffer. Devolve { frames, rest }. */
export function parseFrames(buf) {
  const frames = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off]; const b1 = buf[off + 1];
    let len = b1 & 0x7f; let p = off + 2;
    if (len === 126) { if (buf.length - p < 2) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (buf.length - p < 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    const masked = (b1 & 0x80) !== 0;
    let mask = null;
    if (masked) { if (buf.length - p < 4) break; mask = buf.subarray(p, p + 4); p += 4; }
    if (buf.length - p < len) break;
    let payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    frames.push({ fin: (b0 & 0x80) !== 0, opcode: b0 & 0x0f, payload });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off) };
}
export const encodeFrame = frame;

/**
 * Converte texto em MP3 (24 kHz). Resolve com um Buffer.
 * Erros têm .status (403 = recusado, 0 = rede/tempo).
 */
export function synthesize(text, { voice, rate, pitch, timeoutMs = 8000 } = {}, retried = false) {
  return new Promise((resolve, reject) => {
    const connId = crypto.randomUUID().replace(/-/g, '');
    const u = new URL(endpoint());
    u.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN);
    u.searchParams.set('Sec-MS-GEC', secMsGec());
    u.searchParams.set('Sec-MS-GEC-Version', `1-${CHROMIUM_FULL}`);
    u.searchParams.set('ConnectionId', connId);
    const secure = u.protocol === 'wss:';
    const port = Number(u.port) || (secure ? 443 : 80);
    const sock = secure ? tls.connect({ host: u.hostname, port, servername: u.hostname }) : net.connect({ host: u.hostname, port });
    const key = crypto.randomBytes(16).toString('base64');
    const audio = [];
    let buf = Buffer.alloc(0);
    let upgraded = false;
    let finished = false;
    const fail = (msg, status = 0) => { if (finished) return; finished = true; clearTimeout(timer); sock.destroy(); reject(Object.assign(new Error(msg), { status })); };
    const timer = setTimeout(() => fail('tempo de resposta esgotado'), timeoutMs);

    sock.once(secure ? 'secureConnect' : 'connect', () => {
      sock.write([
        `GET ${u.pathname}${u.search} HTTP/1.1`,
        `Host: ${u.host}`,
        'Upgrade: websocket', 'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13',
        'Pragma: no-cache', 'Cache-Control: no-cache',
        'Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
        'Accept-Encoding: gzip, deflate, br', 'Accept-Language: en-US,en;q=0.9',
        '', '',
      ].join('\r\n'));
    });

    const start = () => {
      const now = stamp();
      sock.write(frame(1, `X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`));
      sock.write(frame(1, `X-RequestId:${connId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${now}Z\r\nPath:ssml\r\n\r\n${ssml(text, { voice, rate, pitch })}`));
    };

    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = buf.subarray(0, end).toString('latin1');
        buf = buf.subarray(end + 4);
        const status = Number(head.split(' ')[1]);
        if (status !== 101) {
          // 403 costuma ser relógio do celular fora da hora: ajusta pelo relógio do servidor e tenta 1 vez.
          const date = /\r\ndate:\s*([^\r\n]+)/i.exec(head)?.[1];
          if (status === 403 && date && !retried) {
            const server = Date.parse(date) / 1000;
            if (Number.isFinite(server)) {
              clockSkew = server - Date.now() / 1000;
              finished = true; clearTimeout(timer); sock.destroy();
              return synthesize(text, { voice, rate, pitch, timeoutMs }, true).then(resolve, reject);
            }
          }
          return fail(`servidor de voz recusou (HTTP ${status || '?'})`, status || 0);
        }
        upgraded = true;
        start();
      }
      const { frames, rest } = parseFrames(buf);
      buf = rest;
      for (const f of frames) {
        if (f.opcode === 2 && f.payload.length >= 2) {
          const hl = f.payload.readUInt16BE(0);
          const header = f.payload.subarray(2, 2 + hl).toString('utf8');
          if (/Path:audio/.test(header)) audio.push(f.payload.subarray(2 + hl));
        } else if (f.opcode === 1) {
          if (/Path:turn\.end/.test(f.payload.toString('utf8'))) {
            finished = true; clearTimeout(timer);
            sock.end(frame(8, Buffer.from([0x03, 0xe8])));
            const out = Buffer.concat(audio);
            return out.length ? resolve(out) : reject(Object.assign(new Error('o servidor de voz não devolveu áudio'), { status: 502 }));
          }
        } else if (f.opcode === 8) {
          return fail('o servidor de voz fechou a conexão', 502);
        } else if (f.opcode === 9) {
          sock.write(frame(10, f.payload));
        }
      }
    });
    sock.on('error', (err) => fail(err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN' ? 'sem internet para a voz' : err.message));
    sock.on('close', () => fail('conexão de voz encerrada'));
  });
}
