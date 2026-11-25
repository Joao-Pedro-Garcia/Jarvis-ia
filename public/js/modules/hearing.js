// OUVIDO — reconhecimento de fala do navegador (Web Speech API).
// Chrome/Edge/Android: funciona (o áudio é processado pelo serviço do navegador,
// por isso exige internet). Firefox não suporta: a interface oferece texto.
import { bus, EVENTS } from '../core/bus.js';
import { clientLog } from '../core/logger.js';

// Estados reais do microfone são publicados via evento 'mic:state' (ver device.js).
const micState = (s) => bus.emit('mic:set', s);

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const hearingSupported = !!SR;

let rec = null;
let active = false;
let wakeRec = null;
let wakeEnabled = false;
let wakeName = 'jarvis';
let silenceTimer = null;

const ERRORS = {
  'not-allowed': 'Permissão do microfone negada. Libere o microfone nas configurações do navegador.',
  'service-not-allowed': 'O navegador bloqueou o reconhecimento de voz.',
  'no-speech': 'Não ouvi nada.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: 'O reconhecimento de voz precisa de internet neste navegador.',
  aborted: null,
  'language-not-supported': 'Idioma não suportado pelo reconhecimento de voz.',
};

export const isListening = () => active;

/** Escuta UM comando. Resolve com o texto final (ou '' se nada). */
export function listenOnce({ lang = 'pt-BR', silenceMs = 1800 } = {}) {
  if (!SR) return Promise.reject(new Error('Reconhecimento de voz não suportado neste navegador. Use Chrome, Edge ou o navegador do Android — ou digite.'));
  stopWake();
  if (active) stopListening();
  return new Promise((resolve, reject) => {
    rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true; // controlamos o fim pelo silêncio
    rec.maxAlternatives = 1;
    let finalText = '';
    let settled = false;
    const finish = (err) => {
      if (settled) return; settled = true;
      clearTimeout(silenceTimer);
      active = false;
      try { rec.stop(); } catch {}
      micState(err && /negada|bloqueou/.test(err.message) ? 'denied' : err && /microfone encontrado/.test(err.message) ? 'unavailable' : 'inactive');
      bus.emit(EVENTS.LISTEN_ENDED, { text: finalText });
      if (err) reject(err); else resolve(finalText.trim());
      resumeWake();
    };
    const armSilence = () => { clearTimeout(silenceTimer); silenceTimer = setTimeout(() => finish(), finalText ? silenceMs : Math.max(silenceMs * 3, 6000)); };
    // Só agora o navegador confirmou que está ouvindo de verdade.
    rec.onstart = () => { active = true; micState('active'); bus.emit(EVENTS.LISTEN_STARTED); clientLog('ouvido', 'Escuta iniciada'); armSilence(); };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      bus.emit(EVENTS.VOICE_INTERIM, { text: (finalText + interim).trim() });
      armSilence();
    };
    rec.onerror = (e) => {
      const msg = ERRORS[e.error];
      if (e.error === 'no-speech' || e.error === 'aborted') return finish();
      clientLog(e.error === 'not-allowed' ? 'permissoes' : 'ouvido', `Erro no reconhecimento: ${e.error}`, 'warn');
      finish(new Error(msg || `Erro no reconhecimento de voz (${e.error}).`));
    };
    rec.onend = () => finish();
    try { rec.start(); } catch (err) { finish(err); }
  });
}

export function stopListening() {
  clearTimeout(silenceTimer);
  if (rec) { try { rec.abort(); } catch {} }
  active = false;
}

// ---------- Ativação por voz ("Jarvis, ...") — opcional, desligada por padrão ----------
export function setWakeWord(enabled, { lang = 'pt-BR', name = 'jarvis' } = {}) {
  wakeEnabled = enabled && !!SR;
  wakeName = name.toLowerCase();
  if (wakeEnabled) startWake(lang); else stopWake();
}

function startWake(lang = 'pt-BR') {
  if (!wakeEnabled || active || wakeRec) return;
  wakeRec = new SR();
  wakeRec.lang = lang; wakeRec.continuous = true; wakeRec.interimResults = false;
  wakeRec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const txt = e.results[i][0].transcript.trim();
      const norm = txt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const idx = norm.search(new RegExp(`\\b(${wakeName}|jarvis|jarves|jarbas|djarvis)\\b`));
      if (idx >= 0) {
        const rest = txt.slice(idx).replace(/^\S+[,.!\s]*/, '').trim();
        clientLog('ouvido', 'Palavra de ativação detectada');
        bus.emit(EVENTS.VOICE_RECEIVED, { text: rest, wake: true });
      }
    }
  };
  wakeRec.onend = () => { wakeRec = null; if (wakeEnabled && !active) setTimeout(() => startWake(lang), 400); };
  wakeRec.onerror = (e) => { if (e.error === 'not-allowed') { wakeEnabled = false; clientLog('permissoes', 'Ativação por voz sem permissão', 'warn'); } };
  try { wakeRec.start(); } catch { wakeRec = null; }
}
function stopWake() { if (wakeRec) { const r = wakeRec; wakeRec = null; r.onend = null; try { r.abort(); } catch {} } }
function resumeWake() { if (wakeEnabled) setTimeout(() => startWake(), 600); }
export const wakeStatus = () => ({ enabled: wakeEnabled, running: !!wakeRec });

// ---------- Interrupção pela voz ("pare") durante a fala do JARVIS ----------
const STOP_WORDS = /^(pare|para|parar|chega|silencio|stop|cala a boca|ja chega|pode parar|jarvis para|jarvis pare)$/;
const PAUSE_WORDS = /^(pausa|pause|espera|jarvis pausa)$/;
let bargeRec = null;

/** Escuta apenas comandos curtos de parar/pausar enquanto o JARVIS fala. */
export function startBargeIn({ lang = 'pt-BR', onStop, onPause } = {}) {
  if (!SR || active || bargeRec) return () => {};
  stopWake();
  const r = new SR();
  r.lang = lang; r.continuous = true; r.interimResults = true;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      // Só frases MUITO curtas: o eco da própria fala do JARVIS é longo e não dispara.
      const t = e.results[i][0].transcript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').trim();
      if (STOP_WORDS.test(t)) { clientLog('voz', 'Fala interrompida pelo comando de voz'); onStop?.(); return; }
      if (PAUSE_WORDS.test(t)) { onPause?.(); return; }
    }
  };
  r.onerror = () => {};
  r.onend = () => { if (bargeRec === r) bargeRec = null; };
  try { r.start(); bargeRec = r; } catch { bargeRec = null; }
  return stopBargeIn;
}

export function stopBargeIn() {
  if (!bargeRec) return;
  const r = bargeRec; bargeRec = null; r.onend = null;
  try { r.abort(); } catch {}
  resumeWake();
}
