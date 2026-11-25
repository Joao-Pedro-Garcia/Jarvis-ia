// PALMAS — captura do microfone (Web Audio) + detector de duas palmas.
import { ClapDetector, analyzeBlock } from './clap-detector.js';
import { bus, EVENTS } from '../core/bus.js';
import { clientLog } from '../core/logger.js';

let ctx = null, stream = null, node = null, source = null, analyser = null, pollTimer = null;
let detector = new ClapDetector();
let enabled = false;
let paused = false;
let lastLevelEmit = 0;

export const clapStatus = () => ({ enabled, running: !!stream && !paused, paused });

function onFrame(frame) {
  if (paused) return;
  const now = performance.now();
  if (now - lastLevelEmit > 60) { lastLevelEmit = now; bus.emit(EVENTS.CLAP_LEVEL, { peak: frame.peak, threshold: detector.threshold() }); }
  for (const ev of detector.process(frame)) {
    if (ev.type === 'clap') bus.emit(EVENTS.CLAP_DETECTED, ev);
    else if (ev.type === 'double') {
      clientLog('palmas', 'Duas palmas detectadas — ativação');
      bus.emit(EVENTS.DOUBLE_CLAP, ev);
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
    source.connect(node);
    // Saída muda: necessária em alguns navegadores para o processamento rodar.
    const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute).connect(ctx.destination);
  } catch {
    // Reserva: AnalyserNode com amostragem periódica (menos preciso em 2º plano).
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
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
  ctx = stream = node = source = analyser = null;
  detector = new ClapDetector(detector.o);
  if (!keepEnabled) { enabled = false; paused = false; clientLog('palmas', 'Detector de palmas desligado'); }
}

export function configureClap(settings) { detector.configure(settings || {}); }
