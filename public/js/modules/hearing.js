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

const ANDROID = /Android/i.test(navigator.userAgent);
const GOOGLE_HELP = ' No Android, quem transcreve a voz é o app Google: abra Configurações → Apps → Google → Permissões → Microfone → Permitir. Confira também se o microfone está permitido para este site no Chrome (ícone ⓘ ao lado do endereço).';
const ERRORS = {
  'not-allowed': `O reconhecimento de voz foi bloqueado.${ANDROID ? GOOGLE_HELP : ' Libere o microfone nas configurações do navegador (cadeado ou ⓘ ao lado do endereço).'}`,
  'service-not-allowed': `O serviço de reconhecimento de voz está bloqueado ou desativado.${ANDROID ? `${GOOGLE_HELP} Atualize também o app Google na Play Store.` : ''}`,
  'no-speech': 'Não ouvi nada.',
  'audio-capture': 'Nenhum microfone encontrado.',
  network: `O reconhecimento de voz precisa de internet${ANDROID ? ' (no Android ele usa o serviço de voz do Google)' : ' neste navegador'}. Confira o Wi-Fi ou os dados móveis.`,
  aborted: null,
  'language-not-supported': 'Idioma não suportado pelo reconhecimento de voz.',
};

export const isListening = () => active;

// Como terminou a última escuta (para explicar ao usuário quando nada foi transcrito).
let outcome = { started: false, speech: false, error: null };
export const lastListenOutcome = () => ({ ...outcome });

/** Escuta UM comando. Resolve com o texto final (ou '' se nada). */
// No Android o microfone leva um instante para ser liberado por outra escuta; começar
// antes disso faz o reconhecimento do Google receber áudio fraco ("só ouve de perto").
export const MIC_RELEASE_MS = ANDROID ? 400 : 0;
export const waitMicRelease = () => new Promise((r) => setTimeout(r, MIC_RELEASE_MS));

// ---------- Transcrição Whisper (Groq) — entende voz baixa e tom normal ----------
// Grava pelo próprio microfone da página (sem o app Google), detecta o fim da fala
// pelo silêncio (limiar que se adapta ao ruído do ambiente) e manda o áudio para o
// servidor transcrever. Se o Whisper falhar, volta para o reconhecimento do navegador.
let sttEnabled = false;
let sttDownUntil = 0;
let wAbort = null;
export function configureStt({ enabled }) { sttEnabled = !!enabled; }
export const usingWhisper = () => sttEnabled && Date.now() >= sttDownUntil && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

let wFinish = null;
async function listenWhisper({ silenceMs, manual = false }) {
  outcome = { started: false, speech: false, error: null, engine: 'whisper', manual };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (err) {
    outcome.error = err.name;
    micState(err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    throw new Error(err.name === 'NotAllowedError' ? 'Permissão do microfone negada. Toque no ⓘ ao lado do endereço → Permissões → Microfone → Permitir.' : 'Nenhum microfone encontrado.');
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain();
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  const dest = ctx.createMediaStreamDestination();
  src.connect(gain); gain.connect(an); gain.connect(dest);
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
  const recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };

  const buf = new Float32Array(an.fftSize);
  let floor = 0.004; let speechRms = 0; let lastVoice = 0; let voiced = 0;
  const t0 = performance.now();
  active = true; outcome.started = true;
  micState('active'); bus.emit(EVENTS.LISTEN_STARTED); clientLog('ouvido', 'Escuta iniciada (Whisper)');
  recorder.start(250);

  const stopped = await new Promise((resolve) => {
    let done = false;
    const end = (why) => { if (done) return; done = true; clearInterval(loop); resolve(why); };
    wAbort = () => end('abort');
    wFinish = () => end('done'); // toque de novo no microfone: termina e ENVIA
    const loop = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length) / (gain.gain.value || 1);
      const now = performance.now();
      const elapsed = now - t0;
      // Ruído de fundo: aprende nos primeiros 400 ms e depois só nos momentos sem voz.
      if (elapsed < 400) { floor = Math.max(0.0015, elapsed < 60 ? rms : floor * 0.8 + rms * 0.2); return; }
      const thr = Math.max(floor * 2.2, 0.0035); // baixo o bastante para fala em tom baixo
      if (rms > thr) {
        voiced++; lastVoice = now;
        if (voiced >= 3 && !outcome.speech) { outcome.speech = true; bus.emit(EVENTS.VOICE_INTERIM, { text: '🎙 ouvindo…' }); }
        speechRms = speechRms ? speechRms * 0.9 + rms * 0.1 : rms;
        // Voz baixa: aumenta o ganho (até 6×) para a gravação chegar clara ao Whisper.
        const target = Math.min(6, Math.max(1, 0.06 / Math.max(speechRms, 0.001)));
        gain.gain.value = gain.gain.value * 0.9 + target * 0.1;
      } else {
        floor = floor * 0.97 + Math.min(rms, floor * 1.5) * 0.03;
        if (!outcome.speech) voiced = Math.max(0, voiced - 1);
      }
      // Manual: só termina quando você tocar de novo (pausas no meio da fala não encerram).
      if (manual) { if (elapsed > 180000) end('max'); return; }
      if (outcome.speech && now - lastVoice > Math.max(silenceMs, 1200)) end('silence');
      else if (!outcome.speech && elapsed > 8000) end('no-speech');
      else if (elapsed > 30000) end('max');
    }, 50);
  });
  wAbort = null; wFinish = null;
  const recordedMs = performance.now() - t0;
  await new Promise((r) => { recorder.onstop = r; try { recorder.stop(); } catch { r(); } });
  stream.getTracks().forEach((t) => t.stop());
  ctx.close().catch(() => {});
  micState('inactive'); // 'active' segue true até o texto chegar: um toque agora não abre outra escuta
  // Manual: você tocou para enviar → manda mesmo se a voz foi baixa demais para o detector.
  if (manual && stopped !== 'abort' && recordedMs > 700) outcome.speech = true;
  if (stopped === 'abort' || !outcome.speech) {
    if (!outcome.speech) outcome.error = 'no-speech';
    bus.emit(EVENTS.LISTEN_ENDED, { text: '' });
    return '';
  }
  bus.emit(EVENTS.VOICE_INTERIM, { text: '✍ transcrevendo…' });
  const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
  const res = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] || 'audio/webm' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { stt: true });
  const text = String(data.text || '').trim();
  if (!text) outcome.error = 'no-text';
  bus.emit(EVENTS.VOICE_INTERIM, { text });
  bus.emit(EVENTS.LISTEN_ENDED, { text });
  clientLog('ouvido', `Whisper: ${text ? `${text.length} caracteres` : 'nada transcrito'} (${data.ms ?? '?'} ms)`);
  return text;
}

/** Toque de novo no microfone: termina a escuta e ENVIA o que foi dito (stopListening descarta). */
export function finishListening() {
  if (wFinish) { wFinish(); return true; }
  if (rec && active) { manualStop = true; try { rec.stop(); } catch {} return true; }
  return false;
}
let manualStop = false;

export async function listenOnce({ lang = 'pt-BR', silenceMs = 1800, manual = false } = {}) {
  if (usingWhisper()) {
    const hadWake = !!wakeRec;
    stopWake();
    if (active) stopListening();
    if (hadWake && MIC_RELEASE_MS) await waitMicRelease();
    try {
      return await listenWhisper({ silenceMs, manual });
    } catch (err) {
      active = false;
      if (!err.stt) throw err; // microfone negado etc.: mesmo erro para os dois modos
      sttDownUntil = Date.now() + 60000;
      clientLog('ouvido', `Whisper indisponível (${err.message}); usando o reconhecimento do navegador`, 'warn');
      bus.emit('stt:fallback', { reason: err.message });
      return '';
    } finally { active = false; resumeWake(); }
  }
  if (!SR) throw new Error('Reconhecimento de voz não suportado neste navegador. Use Chrome, Edge ou o navegador do Android — ou digite.');
  const hadWake = !!wakeRec;
  stopWake();
  if (active) stopListening();
  if (hadWake && MIC_RELEASE_MS) await waitMicRelease();
  return new Promise((resolve, reject) => {
    rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true; // controlamos o fim pelo silêncio
    rec.maxAlternatives = 1;
    let finalText = '';
    let heard = false; // já chegou algum texto parcial (fala baixa costuma demorar a virar texto final)
    let settled = false;
    manualStop = false;
    outcome = { started: false, speech: false, error: null, manual };
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
    // Paciência: fala já transcrita → encerra após o silêncio configurado; voz percebida mas
    // ainda sem texto final → espera mais; nada ainda → espera até 8 s antes de desistir.
    const armSilence = () => {
      clearTimeout(silenceTimer);
      if (manual) { silenceTimer = setTimeout(() => finish(), 180000); return; } // manual: só o seu toque encerra (máx. 3 min)
      const wait = finalText ? silenceMs : heard || outcome.speech ? Math.max(silenceMs * 2, 3500) : Math.max(silenceMs * 4, 8000);
      silenceTimer = setTimeout(() => finish(), wait);
    };
    // Só agora o navegador confirmou que está ouvindo de verdade.
    rec.onspeechstart = () => { outcome.speech = true; armSilence(); };
    rec.onstart = () => { outcome.started = true; active = true; micState('active'); bus.emit(EVENTS.LISTEN_STARTED); clientLog('ouvido', 'Escuta iniciada'); armSilence(); };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      if (interim.trim()) heard = true;
      bus.emit(EVENTS.VOICE_INTERIM, { text: (finalText + interim).trim() });
      armSilence();
    };
    rec.onerror = (e) => {
      const msg = ERRORS[e.error];
      outcome.error = e.error;
      if (manual && !manualStop && e.error === 'no-speech') return; // manual: segue ouvindo (onend reinicia)
      if (e.error === 'no-speech' || e.error === 'aborted') return finish();
      clientLog(e.error === 'not-allowed' ? 'permissoes' : 'ouvido', `Erro no reconhecimento: ${e.error}`, 'warn');
      finish(new Error(msg || `Erro no reconhecimento de voz (${e.error}).`));
    };
    rec.onend = () => {
      // Manual: o Android encerra sozinho depois de uma pausa — reabre e continua juntando o texto.
      if (manual && !manualStop && !settled) { try { rec.start(); return; } catch { /* não reabriu: encerra */ } }
      finish();
    };
    try { rec.start(); } catch (err) { finish(err); }
  });
}

export function stopListening() {
  clearTimeout(silenceTimer);
  manualStop = true; // cancelar de verdade (não reabrir no modo manual)
  if (wAbort) wAbort();
  if (rec) { try { rec.abort(); } catch {} }
  active = false;
}

// ---------- Ativação por voz ("Jarvis, ...") — opcional, desligada por padrão ----------
export function setWakeWord(enabled, { lang = 'pt-BR', name = 'jarvis' } = {}) {
  wakeEnabled = enabled && !!SR;
  wakeName = name.toLowerCase();
  if (wakeEnabled) startWake(lang); else stopWake();
}

// Enquanto o JARVIS fala, a escuta do "Jarvis" fica parada: no Android cada reinício do
// reconhecimento toma o áudio e CORTA a fala no meio.
let holds = 0; // várias falas seguidas: só solta quando a última terminar
let speechHold = false;
let wakeLang = 'pt-BR';
export function holdWake(on) {
  holds = Math.max(0, holds + (on ? 1 : -1));
  speechHold = holds > 0;
  if (speechHold) stopWake(); else resumeWake();
}
function startWake(lang = wakeLang) {
  wakeLang = lang;
  if (!wakeEnabled || active || wakeRec || speechHold) return;
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
