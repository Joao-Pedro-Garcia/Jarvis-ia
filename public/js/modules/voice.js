// VOZ — síntese de fala local do navegador (Web Speech Synthesis).
import { bus, EVENTS } from '../core/bus.js';
import { clientLog } from '../core/logger.js';

const synth = window.speechSynthesis;
export const voiceSupported = !!synth;
let voices = [];
let speakingToken = 0;
let opts = { rate: 1.05, pitch: 1, volume: 1, lang: 'pt-BR', voiceName: '' };
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

/** Divide em frases (Chrome corta falas muito longas). */
function chunks(text) {
  const parts = text.match(/[^.!?;:]+[.!?;:]*\s*/g) || [text];
  const out = []; let cur = '';
  for (const p of parts) {
    if ((cur + p).length > 180 && cur) { out.push(cur.trim()); cur = ''; }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function isSpeaking() { return !!synth && (synth.speaking || synth.pending); }

/** Fala o texto. Resolve quando termina (ou foi interrompido). */
export function speak(text) {
  if (!synth || !text) return Promise.resolve(false);
  stopSpeaking();
  const token = ++speakingToken;
  const list = chunks(text);
  const voice = pickVoice();
  bus.emit(EVENTS.SPEECH_STARTED, { text });
  return new Promise((resolve) => {
    let i = 0;
    // Chrome às vezes pausa sozinho em falas longas: "keepalive".
    const keep = setInterval(() => { if (synth.speaking && !synth.paused && !paused) { synth.pause(); synth.resume(); } }, 10000);
    const done = (completed) => { clearInterval(keep); if (token === speakingToken) bus.emit(EVENTS.SPEECH_FINISHED, { completed }); resolve(completed); };
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
  if (synth) synth.cancel();
}

// ---------- Pausar / continuar ----------
let paused = false;
export const isPaused = () => paused;
export function pauseSpeaking() {
  if (!synth || !isSpeaking()) return false;
  synth.pause(); paused = true; bus.emit('speech:paused');
  return true;
}
export function resumeSpeaking() {
  if (!synth || !paused) return false;
  synth.resume(); paused = false; bus.emit('speech:resumed');
  return true;
}

/** Alguns navegadores (iOS/Android) exigem um gesto do usuário antes de falar. */
export function unlockVoice() {
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

export const voiceInfo = () => { const v = pickVoice(); return v ? { name: v.name, lang: v.lang, local: v.localService } : null; };

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
