// VOZ — síntese de fala local do navegador (Web Speech Synthesis).
import { bus, EVENTS } from '../core/bus.js';
import { clientLog } from '../core/logger.js';

const synth = window.speechSynthesis;
export const voiceSupported = !!synth;
let voices = [];
let speakingToken = 0;
let opts = { rate: 1.05, pitch: 1, volume: 1, lang: 'pt-BR', voiceName: '' };

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
    const keep = setInterval(() => { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } }, 10000);
    const done = (completed) => { clearInterval(keep); if (token === speakingToken) bus.emit(EVENTS.SPEECH_FINISHED, { completed }); resolve(completed); };
    const next = () => {
      if (token !== speakingToken) return done(false);
      if (i >= list.length) return done(true);
      const u = new SpeechSynthesisUtterance(list[i++]);
      u.lang = voice?.lang || opts.lang; if (voice) u.voice = voice;
      u.rate = opts.rate; u.pitch = opts.pitch; u.volume = opts.volume;
      u.onboundary = () => bus.emit(EVENTS.SPEECH_BOUNDARY);
      // Segurança: alguns navegadores não disparam onend (sem vozes instaladas, etc.).
      let ended = false;
      const guard = setTimeout(() => { if (!ended) { ended = true; next(); } }, 2500 + (u.text.length * 110) / opts.rate);
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
  if (synth) synth.cancel();
}

/** Alguns navegadores (iOS/Android) exigem um gesto do usuário antes de falar. */
export function unlockVoice() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u);
}
