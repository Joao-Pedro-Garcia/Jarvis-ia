// VOZ DO JARVIS (no servidor) — texto → áudio, com voz masculina que não depende
// das vozes instaladas no Android.
//   1) "neural": vozes naturais gratuitas (Edge) — precisa de internet.
//   2) "espeak": eSpeak NG, 100% offline (som robótico) — só se instalado
//      (Termux: pkg install espeak).
// Se nenhuma funcionar, o navegador usa a voz do celular (o cliente cuida disso).
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { synthesize, VOICES, DEFAULT_VOICE } from './edge-tts.js';
import { log } from '../../core/logger.js';

export { VOICES, DEFAULT_VOICE };
const MAX_CHARS = 1200;
const CACHE_MAX = 60;
const cache = new Map(); // chave → { audio, type } (LRU simples: frases repetidas saem na hora)
let neuralDownUntil = 0; // após falha, evita esperar o timeout em toda frase
let neuralLastError = null;
let espeakBin; // undefined = ainda não procurado

export function findEspeak() {
  if (espeakBin !== undefined) return espeakBin;
  espeakBin = null;
  if (process.env.JARVIS_ESPEAK === '0') return null;
  for (const bin of ['espeak-ng', 'espeak']) {
    try { if (spawnSync(bin, ['--version'], { timeout: 3000 }).status === 0) { espeakBin = bin; break; } } catch { /* não instalado */ }
  }
  return espeakBin;
}
export const resetTts = () => { cache.clear(); neuralDownUntil = 0; neuralLastError = null; espeakBin = undefined; };

function espeak(text, { rate = 1, pitch = 1 } = {}) {
  const bin = findEspeak();
  if (!bin) return Promise.reject(Object.assign(new Error('eSpeak não instalado'), { status: 503 }));
  return new Promise((resolve, reject) => {
    const args = ['-v', 'pt-br+m3', '-s', String(Math.round(165 * rate)), '-p', String(Math.round(40 * pitch)), '--stdout', text];
    const p = spawn(bin, args);
    const out = [];
    const t = setTimeout(() => p.kill(), 10000);
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); const b = Buffer.concat(out); code === 0 && b.length ? resolve(b) : reject(new Error(`eSpeak terminou com código ${code}`)); });
  });
}

/**
 * Gera o áudio. engine: 'neural' (padrão, com reserva no eSpeak) ou 'espeak'.
 * Devolve { audio: Buffer, type, engine, cached }.
 */
export async function speakToAudio(text, { voice = DEFAULT_VOICE, rate = 1, pitch = 1, engine = 'neural' } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  if (!clean) throw Object.assign(new Error('Texto vazio'), { status: 400 });
  const r = Math.round(Number(rate) * 100) / 100 || 1;
  const p = Math.round(Number(pitch) * 100) / 100 || 1;
  const key = crypto.createHash('sha1').update(`${engine}|${voice}|${r}|${p}|${clean}`).digest('hex');
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return { ...hit, cached: true }; }

  let out = null;
  if (engine !== 'espeak' && Date.now() >= neuralDownUntil) {
    try {
      out = { audio: await synthesize(clean, { voice, rate: r, pitch: p }), type: 'audio/mpeg', engine: 'neural' };
      if (neuralLastError) log.info('sistema', 'Voz neural voltou a funcionar');
      neuralLastError = null;
    } catch (err) {
      neuralLastError = err.message;
      neuralDownUntil = Date.now() + 60000;
      log.warn('sistema', `Voz neural indisponível (${err.message}); usando a reserva por 1 min`);
    }
  }
  if (!out && findEspeak()) out = { audio: await espeak(clean, { rate: r, pitch: p }), type: 'audio/wav', engine: 'espeak' };
  if (!out) throw Object.assign(new Error(neuralLastError ? `voz do JARVIS indisponível: ${neuralLastError}` : 'voz do JARVIS indisponível'), { status: 503 });
  cache.set(key, out);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return { ...out, cached: false };
}

export function ttsStatus() {
  return {
    voices: VOICES,
    defaultVoice: DEFAULT_VOICE,
    neural: { available: Date.now() >= neuralDownUntil, lastError: neuralLastError },
    espeak: !!findEspeak(),
  };
}
