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
  source = ctx.createMediaStreamSource(stream);
  try {
    await ctx.audioWorklet.addModule('/js/modules/clap-worklet.js');
    node = new AudioWorkletNode(ctx, 'clap-analyzer');
    node.port.onmessage = (e) => onFrame(e.data);
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
  if (!stream) { try { await startClap(settings); } catch {} return; }
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
