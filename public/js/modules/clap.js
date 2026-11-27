// PALMAS — captura do microfone (Web Audio) + detector de duas palmas.
import { ClapDetector, analyzeBlock } from './clap-detector.js';
import { bus, EVENTS } from '../core/bus.js';
import { clientLog } from '../core/logger.js';

let ctx = null, stream = null, node = null, source = null, analyser = null, pollTimer = null;
let detector = new ClapDetector();
let enabled = false;
let paused = false;
let lastLevelEmit = 0;
let mode = null; // 'worklet' | 'analyser'
let testing = false;
let lastDetection = null;
let maxPeak = 0;

/** Durante o teste do diagnóstico, as palmas NÃO disparam o fluxo de conversa. */
export const clapTesting = () => testing;
export function clapDiagnostics() {
  return { enabled, running: !!stream && !paused, paused, mode, audioContext: ctx?.state || 'fechado', threshold: detector.threshold(), maxPeak, lastDetection, hidden: document.hidden };
}

export const clapStatus = () => ({ enabled, running: !!stream && !paused, paused });

function onFrame(frame) {
  if (paused) return;
  if (voiceWake) voiceFrame(frame);
  const now = performance.now();
  if (frame.peak > maxPeak) maxPeak = frame.peak;
  if (now - lastLevelEmit > 60) { lastLevelEmit = now; bus.emit(EVENTS.CLAP_LEVEL, { peak: frame.peak, threshold: detector.threshold() }); }
  for (const ev of detector.process(frame)) {
    if (ev.type === 'clap') bus.emit(EVENTS.CLAP_DETECTED, ev);
    else if (ev.type === 'double') {
      lastDetection = new Date().toISOString();
      clientLog('palmas', `Duas palmas detectadas${testing ? ' (teste)' : ' — ativação'}`);
      bus.emit(EVENTS.PALMS_DETECTED, { ...ev, test: testing });
      if (!testing) bus.emit(EVENTS.DOUBLE_CLAP, ev);
    } else if (ev.type === 'reject') clientLog('palmas', `Padrão rejeitado: ${ev.reason}`);
  }
}

export async function startClap(settings) {
  detector.configure(settings || {});
  if (stream) { paused = false; return true; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
  } catch (err) {
    clientLog('permissoes', `Microfone negado para PALMAS: ${err.name}`, 'warn');
    throw new Error(err.name === 'NotAllowedError' ? 'Permissão do microfone negada.' : `Microfone indisponível (${err.name}).`);
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Um contexto de áudio criado fora de um toque pode nascer "suspenso" (sem som chegando):
  // reativa já e sempre que a tela voltar a aparecer.
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* reativa no próximo toque */ } }
  source = ctx.createMediaStreamSource(stream);
  try {
    await ctx.audioWorklet.addModule('/js/modules/clap-worklet.js');
    node = new AudioWorkletNode(ctx, 'clap-analyzer');
    node.port.onmessage = (e) => onFrame(e.data);
    if (voiceWake) node.port.postMessage({ pcm: true });
    mode = 'worklet';
    source.connect(node);
    // Saída muda: necessária em alguns navegadores para o processamento rodar.
    const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute).connect(ctx.destination);
  } catch {
    // Reserva: AnalyserNode com amostragem periódica (menos preciso em 2º plano).
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    mode = 'analyser';
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    pollTimer = setInterval(() => { analyser.getFloatTimeDomainData(buf); onFrame({ ...analyzeBlock(buf), t: performance.now() }); }, 8);
  }
  enabled = true; paused = false;
  clientLog('palmas', 'Detector de palmas ativo');
  return true;
}

/** Pausa (ex.: enquanto o reconhecimento de voz usa o microfone). */
export async function pauseClap() {
  if (!stream || paused) return;
  paused = true;
  // No Android, liberar o microfone evita conflito com o reconhecimento de fala.
  if (/Android/i.test(navigator.userAgent)) await stopClap(true);
}

export async function resumeClap(settings) {
  if (!enabled) return;
  if (!stream) {
    // Religar pode falhar se outro uso do microfone ainda não soltou: tenta de novo.
    for (let i = 0; i < 3; i++) {
      try { await startClap(settings); return; } catch (err) { clientLog('palmas', `Religar o detector falhou (${err.message}); tentando de novo`, 'warn'); await new Promise((r) => setTimeout(r, 1200)); }
    }
    return;
  }
  if (ctx?.state === 'suspended') { try { await ctx.resume(); } catch {} }
  detector.configure(settings || {});
  paused = false;
}

export async function stopClap(keepEnabled = false) {
  clearInterval(pollTimer); pollTimer = null;
  try { node?.disconnect(); source?.disconnect(); } catch {}
  stream?.getTracks().forEach((t) => t.stop());
  try { await ctx?.close(); } catch {}
  ctx = stream = node = source = analyser = null; mode = null;
  detector = new ClapDetector(detector.o);
  if (!keepEnabled) { enabled = false; paused = false; clientLog('palmas', 'Detector de palmas desligado'); }
}

export function configureClap(settings) { detector.configure(settings || {}); }

// Reativa o áudio se o navegador o suspendeu (tela apagou/voltou, outro app tocou som).
const wakeAudio = () => { if (ctx?.state === 'suspended' && !paused) ctx.resume().catch(() => {}); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, wakeAudio, { passive: true });

// ---------- "Jarvis" pelo MESMO microfone das palmas ----------
// No Android o microfone é um só: se o reconhecimento do Google ficar ouvindo o nome, as
// palmas recebem silêncio. Então, dormindo, guardamos os últimos segundos de áudio e,
// quando alguém fala, mandamos só esse trecho curto para o Whisper conferir se foi "Jarvis".
const RATE = 16000;
const ring = new Int16Array(RATE * 4);
let ringPos = 0; let total = 0; let frac = 0;
let voiceWake = null;
let vad = null;
let lastClipAt = 0; let clipTimes = [];
export function setVoiceWake(on, onClip) {
  voiceWake = on ? { onClip } : null;
  vad = null;
  node?.port.postMessage({ pcm: !!on });
  clientLog('palmas', on ? '"Jarvis" pelo microfone das palmas: ligado' : '"Jarvis" pelo microfone das palmas: desligado');
}
export const voiceWakeOn = () => !!voiceWake && mode === 'worklet';
function pushPcm(f32) {
  const step = (ctx?.sampleRate || 48000) / RATE;
  let i = frac;
  for (; i < f32.length; i += step) {
    const a = Math.floor(i); const b = Math.min(f32.length, Math.floor(i + step));
    let s = 0; for (let k = a; k < b; k++) s += f32[k];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    ring[ringPos] = v * 32767; ringPos = (ringPos + 1) % ring.length; total++;
  }
  frac = i - f32.length;
}
function clipWav(samples) {
  const n = Math.min(samples, ring.length);
  const b = new ArrayBuffer(44 + n * 2); const v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  let p = (ringPos - n + ring.length) % ring.length;
  for (let i = 0; i < n; i++) { v.setInt16(44 + i * 2, ring[p], true); p = (p + 1) % ring.length; }
  return new Blob([b], { type: 'audio/wav' });
}
function voiceFrame(f) {
  if (f.pcm) pushPcm(f.pcm);
  const now = performance.now();
  const loud = f.rms > Math.max(detector.floor * 5, 0.008);
  if (loud) {
    if (!vad) vad = { startTotal: Math.max(0, total - RATE * 0.35), lastLoud: now, loudFrames: 0 };
    vad.lastLoud = now; vad.loudFrames++;
    return;
  }
  if (!vad) return;
  const dur = (total - vad.startTotal) / RATE;
  if (now - vad.lastLoud < 450 && dur < 3.2) return;
  const seg = vad; vad = null;
  // fala de verdade: entre ~0,4 s e 3,2 s, com várias janelas altas (palma é curta demais)
  if (dur < 0.45 || dur > 3.4 || seg.loudFrames < 12) return;
  clipTimes = clipTimes.filter((t) => now - t < 600000);
  if (now - lastClipAt < 2500 || clipTimes.length >= 40) return; // não gasta o limite grátis com barulho
  lastClipAt = now; clipTimes.push(now);
  try { voiceWake?.onClip(clipWav(total - seg.startTotal)); } catch { /* ignora */ }
}
/** Dormindo: detecção rigorosa (só palmas nítidas acordam). */
export function setClapStrict(on) { detector.configure({ strict: !!on }); clientLog('palmas', on ? 'Detecção rigorosa (dormindo)' : 'Detecção normal'); }

/**
 * CALIBRAÇÃO: você bate palmas algumas vezes e o JARVIS mede a força típica das SUAS
 * palmas. Depois, dormindo, ele exige palmas parecidas com essas (barulhos fracos não
 * acordam, e palmas de verdade não são recusadas). Devolve { ok, peak, count }.
 */
export async function calibrateClaps(settings, { ms = 15000, want = 6, onClap } = {}) {
  const wasRunning = !!stream && !paused;
  const wasEnabled = enabled;
  const prev = { ...detector.o };
  testing = true;
  const peaks = [];
  const off = bus.on(EVENTS.CLAP_DETECTED, (ev) => { peaks.push(ev.peak); onClap?.(peaks.length, want); });
  try {
    if (!wasRunning) await startClap(settings);
    else if (paused) paused = false;
    if (ctx?.state === 'suspended') { try { await ctx.resume(); } catch {} }
    detector.configure({ strict: false, sensitivity: 1, thresholdOverride: 0, calibratedPeak: 0 });
    const t0 = Date.now();
    while (Date.now() - t0 < ms && peaks.length < want) await new Promise((r) => setTimeout(r, 100));
  } finally {
    off();
    detector.configure(prev);
    testing = false;
    if (!wasRunning) await stopClap(wasEnabled);
  }
  if (peaks.length < 3) return { ok: false, count: peaks.length };
  const top = [...peaks].sort((a, b) => b - a).slice(0, want);
  const peak = top[Math.floor(top.length / 2)];
  clientLog('palmas', `Calibração: ${peaks.length} palmas, pico típico ${peak.toFixed(3)}`);
  return { ok: true, peak: Math.round(peak * 1000) / 1000, count: peaks.length };
}

/**
 * TESTE REAL das palmas (diagnóstico): liga o detector se preciso, espera até
 * `ms` por duas palmas e devolve o que aconteceu. Não dispara a conversa.
 */
export async function testClaps(settings, { ms = 8000, onLevel } = {}) {
  const wasRunning = !!stream && !paused;
  const wasEnabled = enabled;
  testing = true; maxPeak = 0;
  const result = { detected: false, rejects: [], claps: 0 };
  const offs = [
    bus.on(EVENTS.CLAP_DETECTED, () => { result.claps++; }),
    bus.on(EVENTS.CLAP_LEVEL, ({ peak, threshold }) => onLevel?.(peak, threshold)),
  ];
  try {
    if (!wasRunning) await startClap(settings);
    else if (paused) paused = false;
    if (ctx?.state === 'suspended') { try { await ctx.resume(); } catch {} }
    result.audioContext = ctx?.state; result.mode = mode; result.threshold = detector.threshold();
    result.detected = await new Promise((resolve) => {
      const off = bus.on(EVENTS.PALMS_DETECTED, () => { off(); resolve(true); });
      setTimeout(() => { off(); resolve(false); }, ms);
    });
  } catch (err) {
    result.error = err.message;
  } finally {
    offs.forEach((f) => f());
    testing = false;
    result.maxPeak = maxPeak;
    if (!wasRunning) { await stopClap(wasEnabled); }
  }
  return result;
}
