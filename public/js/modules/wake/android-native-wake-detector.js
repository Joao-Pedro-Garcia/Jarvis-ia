// Ponte para uma FUTURA versão Android nativa. NÃO há app nativo neste projeto:
// este detector só fica ativo se a página estiver rodando dentro de um app que
// injete `window.JarvisNative` (WebView) com a interface abaixo. Caso contrário,
// isSupported() é false e o JARVIS usa o detector do navegador.
//
// Interface esperada do app nativo (a implementar em Kotlin, com um serviço em
// primeiro plano e notificação permanente, conforme as regras do Android):
//   JarvisNative.startWakeDetection(jsonSettings) / stopWakeDetection()
//   JarvisNative.isWakeDetectionRunning(): boolean
//   o app chama window.__jarvisNativeWake('double-clap' | 'wake-word', texto)
import { WakeDetector } from './wake-detector.js';
import { bus, EVENTS } from '../../core/bus.js';

export class AndroidNativeWakeDetector extends WakeDetector {
  constructor() { super('android-native', 'Android nativo (serviço em primeiro plano)'); }
  isSupported() { return typeof window.JarvisNative?.startWakeDetection === 'function'; }
  limitations() { return this.isSupported() ? ['Detecção mantida pelo serviço nativo do Android (notificação permanente).'] : ['Requer o app Android nativo do JARVIS, que ainda não existe.']; }
  async start(settings) {
    window.__jarvisNativeWake = (kind, text) => (kind === 'double-clap' ? bus.emit(EVENTS.DOUBLE_CLAP, { native: true }) : bus.emit(EVENTS.VOICE_RECEIVED, { text: text || '', wake: true }));
    window.JarvisNative.startWakeDetection(JSON.stringify({ clap: settings.clap, wakeWord: settings.hearing.wakeWord }));
  }
  async stop() { window.JarvisNative?.stopWakeDetection?.(); }
  status() { const running = !!window.JarvisNative?.isWakeDetectionRunning?.(); return { running, paused: false, background: true, detail: running ? 'Serviço nativo ativo.' : 'Serviço nativo parado.' }; }
}
