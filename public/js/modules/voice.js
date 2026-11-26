// VOZ — 1) voz do JARVIS (gerada no servidor: masculina e natural, /api/tts);
//        2) reserva: síntese do próprio navegador/celular (Web Speech Synthesis).
import { bus, EVENTS } from '../core/bus.js';
import { clientLog } from '../core/logger.js';

const synth = window.speechSynthesis;
const ANDROID = /Android/i.test(navigator.userAgent);
export const voiceSupported = !!synth || typeof Audio !== 'undefined';
let voices = [];
let speakingToken = 0;
let opts = { rate: 1.05, pitch: 1, volume: 1, lang: 'pt-BR', voiceName: '', engine: 'celular', neuralVoice: '' };
let lastPlayback = null; // última vez que o navegador CONFIRMOU o início de uma fala (evento onstart)
export const lastPlaybackAt = () => lastPlayback;

function loadVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

export function listVoices(lang = 'pt') {
  return voices.filter((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())).map((v) => ({ name: v.name, lang: v.lang, local: v.localService }));
}

function pickVoice() {
  if (opts.voiceName) { const v = voices.find((x) => x.name === opts.voiceName); if (v) return v; }
  const same = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === opts.lang.toLowerCase());
  const pool = same.length ? same : voices.filter((v) => v.lang.toLowerCase().startsWith(opts.lang.slice(0, 2)));
  // Prefere vozes naturais/neurais quando existirem.
  return pool.find((v) => /natural|neural|online|google/i.test(v.name)) || pool[0] || null;
}

export function configureVoice(o) { opts = { ...opts, ...o }; }

/**
 * Divide em blocos só no fim de frases (. ! ?), nunca em vírgula/dois-pontos:
 * cada bloco a mais é uma pausa a mais. `first` deixa o 1º bloco curto para a
 * fala começar mais rápido.
 */
export function chunks(text, max = 300, first = max) {
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const out = []; let cur = '';
  for (const p of parts) {
    const lim = out.length ? max : first;
    if ((cur + p).length > lim && cur) { out.push(cur.trim()); cur = ''; }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function isSpeaking() { return audioActive || (!!synth && (synth.speaking || synth.pending)); }

// ---------- voz do JARVIS (servidor) ----------
let audioEl = null;
let audioActive = false;
let serverDownUntil = 0;
let lastEngine = null;
const urls = new Set();
const player = () => (audioEl ||= new Audio());
export const resetJarvisVoice = () => { serverDownUntil = 0; };
// 'neural' (experimental) ou 'espeak' (robótica). Qualquer outro valor = voz do celular.
export const usingJarvisVoice = () => (opts.engine === 'neural' || opts.engine === 'espeak') && Date.now() >= serverDownUntil;

async function fetchAudio(text) {
  const res = await fetch('/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: opts.neuralVoice || undefined, rate: opts.rate, pitch: opts.pitch, engine: opts.engine }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  lastEngine = res.headers.get('X-Voice-Engine') || 'neural';
  const url = URL.createObjectURL(await res.blob());
  urls.add(url);
  return url;
}
const freeUrl = (u) => { if (u && urls.delete(u)) URL.revokeObjectURL(u); };

function playUrl(url, token) {
  return new Promise((resolve, reject) => {
    const a = player();
    a.volume = Math.min(Math.max(opts.volume, 0), 1);
    let t = null;
    const end = (ok, err) => { clearInterval(t); a.onended = a.onerror = a.onplaying = null; freeUrl(url); ok ? resolve() : reject(err); };
    a.onplaying = () => { lastPlayback = new Date().toISOString(); };
    a.onended = () => end(true);
    a.onerror = () => (token !== speakingToken ? end(true) : end(false, new Error('o navegador não tocou o áudio')));
    t = setInterval(() => { if (token !== speakingToken) end(true); else if (!a.paused) bus.emit(EVENTS.SPEECH_BOUNDARY); }, 250);
    a.src = url;
    a.play().catch((e) => (token !== speakingToken ? end(true) : end(false, e)));
  });
}

/** Fala pela voz do JARVIS. Lança erro se nem o 1º bloco sair (o chamador usa a reserva). */
async function speakServer(text, token) {
  const list = chunks(text, 280, 140);
  let next = fetchAudio(list[0]);
  next.catch(() => {});
  audioActive = true;
  try {
    for (let i = 0; i < list.length; i++) {
      let url;
      try { url = await next; } catch (err) {
        if (i === 0) throw err;
        // Caiu no meio: o resto sai pela voz do celular.
        audioActive = false;
        return token === speakingToken ? speakBrowser(list.slice(i).join(' '), token, false) : false;
      }
      if (token !== speakingToken) { freeUrl(url); return false; }
      if (i + 1 < list.length) { next = fetchAudio(list[i + 1]); next.catch(() => {}); } // baixa o próximo enquanto este toca: sem pausa
      await playUrl(url, token);
      if (token !== speakingToken) return false;
    }
    return true;
  } finally { if (token === speakingToken) audioActive = false; }
}

/** Fala o texto. Resolve quando termina (ou foi interrompido). */
export async function speak(text) {
  if (!text) return false;
  stopSpeaking();
  const token = ++speakingToken;
  bus.emit(EVENTS.SPEECH_STARTED, { text });
  if (usingJarvisVoice()) {
    try {
      const ok = await speakServer(text, token);
      if (token === speakingToken) bus.emit(EVENTS.SPEECH_FINISHED, { completed: ok });
      return ok;
    } catch (err) {
      audioActive = false;
      if (token !== speakingToken) return false;
      serverDownUntil = Date.now() + 60000;
      clientLog('voz', `Voz do JARVIS indisponível (${err.message}); usando a voz do celular`, 'warn');
      bus.emit('voice:fallback', { reason: err.message });
    }
  }
  if (!synth) { bus.emit(EVENTS.SPEECH_FINISHED, { completed: false }); return false; }
  return speakBrowser(text, token);
}

function speakBrowser(text, token, emit = true) {
  if (!synth) return Promise.resolve(false);
  const list = chunks(text, 220).flatMap((c) => (c.length > 260 ? c.match(/[^,;]+[,;]?\s*/g).reduce((a, p) => { if (a.length && (a[a.length - 1] + p).length <= 220) a[a.length - 1] += p; else a.push(p); return a; }, []).map((x) => x.trim()) : [c]));
  const voice = pickVoice();
  return new Promise((resolve) => {
    let i = 0;
    // Chrome do computador às vezes pausa sozinho em falas longas: "keepalive".
    // NUNCA no Android: lá pause() CANCELA a fala (ela parava no começo).
    const keep = ANDROID ? null : setInterval(() => { if (synth.speaking && !synth.paused && !paused) { synth.pause(); synth.resume(); } }, 10000);
    const done = (completed) => { clearInterval(keep); if (emit && token === speakingToken) bus.emit(EVENTS.SPEECH_FINISHED, { completed }); resolve(completed); };
    const next = () => {
      if (token !== speakingToken) return done(false);
      if (i >= list.length) return done(true);
      const u = new SpeechSynthesisUtterance(list[i++]);
      u.lang = voice?.lang || opts.lang; if (voice) u.voice = voice;
      u.rate = opts.rate; u.pitch = opts.pitch; u.volume = opts.volume;
      u.onboundary = () => bus.emit(EVENTS.SPEECH_BOUNDARY);
      u.onstart = () => { lastPlayback = new Date().toISOString(); };
      // Segurança: alguns navegadores não disparam onend (sem vozes instaladas, etc.).
      let ended = false;
      let guard;
      const arm = (ms) => { clearTimeout(guard); guard = setTimeout(() => { if (paused) return arm(1000); if (!ended) { ended = true; next(); } }, ms); };
      arm(2500 + (u.text.length * 110) / opts.rate);
      u.onend = () => { if (ended) return; ended = true; clearTimeout(guard); next(); };
      u.onerror = (e) => {
        if (ended) return; ended = true; clearTimeout(guard);
        if (e.error !== 'interrupted' && e.error !== 'canceled') clientLog('voz', `Erro na síntese: ${e.error}`, 'warn');
        token === speakingToken ? next() : done(false);
      };
      synth.speak(u);
    };
    next();
  });
}

export function stopSpeaking() {
  speakingToken++;
  paused = false;
  if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); }
  audioActive = false;
  for (const u of [...urls]) freeUrl(u);
  if (synth) synth.cancel();
}

// ---------- Pausar / continuar ----------
let paused = false;
export const isPaused = () => paused;
export function pauseSpeaking() {
  if (!isSpeaking()) return false;
  if (audioActive) audioEl?.pause(); else if (synth) synth.pause(); else return false;
  paused = true; bus.emit('speech:paused');
  return true;
}
export function resumeSpeaking() {
  if (!paused) return false;
  if (audioActive) audioEl?.play().catch(() => {}); else if (synth) synth.resume();
  paused = false; bus.emit('speech:resumed');
  return true;
}

/** Alguns navegadores (iOS/Android) exigem um gesto do usuário antes de falar. */
export function unlockVoice() {
  // Libera o <audio> da voz do JARVIS com um toque de silêncio (WAV de 10 ms).
  try {
    const n = 240; const b = new ArrayBuffer(44 + n * 2); const v = new DataView(b);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    const a = player(); const url = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
    a.src = url; a.play().catch(() => {}).finally(() => setTimeout(() => URL.revokeObjectURL(url), 500));
  } catch { /* sem áudio */ }
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u);
}

/** Espera a lista de vozes (no Chrome ela chega de forma assíncrona). */
export function waitVoices(ms = 1500) {
  if (!synth) return Promise.resolve([]);
  loadVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => { loadVoices(); resolve(voices); };
    const t = setTimeout(done, ms);
    synth.addEventListener?.('voiceschanged', () => { clearTimeout(t); done(); }, { once: true });
  });
}

export const voiceInfo = () => {
  if (usingJarvisVoice() && lastEngine) return { name: lastEngine === 'espeak' ? 'Voz do JARVIS (eSpeak, offline)' : 'Voz do JARVIS (neural, online)', lang: opts.lang, local: lastEngine === 'espeak' };
  const v = pickVoice(); return v ? { name: v.name, lang: v.lang, local: v.localService } : null;
};

/**
 * TESTE REAL da síntese de voz: suporte, vozes instaladas, idioma, volume,
 * reprodução (eventos start/end do navegador) e interrupção (cancel).
 * Devolve { status: ok|limited|fail, detail, checks }.
 */
export async function testVoice({ text = 'Teste de voz do JARVIS.', interrupt = true } = {}) {
  const checks = { supported: !!synth, voices: 0, ptVoices: 0, voice: null, volume: opts.volume, played: false, ended: false, interrupted: null, error: null };
  if (!synth) return { status: 'fail', detail: 'SpeechSynthesis não existe neste navegador: as respostas aparecem só em texto.', checks };
  await waitVoices();
  checks.voices = voices.length;
  checks.ptVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('pt')).length;
  const v = pickVoice();
  checks.voice = v ? `${v.name} (${v.lang}${v.localService ? ', local' : ', online'})` : null;
  stopSpeaking();
  const run = (txt, cancelAfterStart) => new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = v?.lang || opts.lang; if (v) u.voice = v;
    u.rate = opts.rate; u.volume = opts.volume; u.pitch = opts.pitch;
    const r = { started: false, ended: false, error: null };
    const timer = setTimeout(() => resolve(r), 6000);
    u.onstart = () => { r.started = true; lastPlayback = new Date().toISOString(); if (cancelAfterStart) setTimeout(() => synth.cancel(), 150); };
    u.onend = () => { r.ended = true; clearTimeout(timer); resolve(r); };
    u.onerror = (e) => { r.error = e.error; clearTimeout(timer); resolve(r); };
    synth.speak(u);
  });
  const play = await run(text, false);
  checks.played = play.started; checks.ended = play.ended; checks.error = play.error;
  if (interrupt && play.started) {
    const cut = await run('Este é um teste de interrupção. Esta frase deveria ser cortada antes do fim, porque o JARVIS precisa parar de falar na hora.', true);
    checks.interrupted = cut.started && (cut.error === 'interrupted' || cut.error === 'canceled' || cut.ended) && !synth.speaking;
  }
  clientLog('voz', `Teste de voz: vozes ${checks.voices} (pt ${checks.ptVoices}), reproduziu ${checks.played}, interrupção ${checks.interrupted}`);
  if (!checks.voices) return { status: 'fail', detail: 'Nenhuma voz instalada neste aparelho/navegador: a síntese não consegue falar. Instale um pacote de voz (Android: Configurações → Idioma → Saída de texto para fala).', checks };
  if (!play.started) return { status: 'fail', detail: `O navegador não iniciou a fala${play.error ? ` (erro: ${play.error})` : ' (sem resposta em 6 s)'}. Toque na tela primeiro — alguns navegadores exigem um gesto para liberar o áudio.`, checks };
  const parts = [`Reproduziu com a voz ${checks.voice}`, `${checks.ptVoices} voz(es) em português de ${checks.voices}`, `volume ${Math.round(opts.volume * 100)}%`, checks.interrupted == null ? 'interrupção não testada' : checks.interrupted ? 'interrupção OK' : 'interrupção FALHOU'];
  if (opts.volume === 0) return { status: 'limited', detail: `${parts.join(' · ')}. O volume está em 0% nas configurações.`, checks };
  if (!checks.ptVoices) return { status: 'limited', detail: `${parts.join(' · ')}. Nenhuma voz em português instalada: o JARVIS fala com sotaque de outro idioma. Instale uma voz pt-BR no sistema.`, checks };
  if (checks.interrupted === false) return { status: 'limited', detail: `${parts.join(' · ')}.`, checks };
  return { status: 'ok', detail: `${parts.join(' · ')}.`, checks };
}
