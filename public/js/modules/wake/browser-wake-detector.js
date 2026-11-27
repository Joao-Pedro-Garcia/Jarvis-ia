// Implementação para navegador: duas palmas (AudioWorklet) + palavra de ativação opcional.
import { WakeDetector } from './wake-detector.js';
import { startClap, stopClap, pauseClap, resumeClap, configureClap, clapStatus } from '../clap.js';
import { setWakeWord, wakeStatus } from '../hearing.js';

// Android: um microfone só. Com as palmas ligadas, o reconhecimento do Google NÃO fica
// ouvindo o nome (as palmas receberiam silêncio) — o "Jarvis" é ouvido pelo microfone das palmas.
const ANDROID = /Android/i.test(navigator.userAgent);
const googleWake = (s) => !!s.hearing.wakeWord && !(ANDROID && s.clap.enabled);

export class BrowserWakeDetector extends WakeDetector {
  constructor() { super('browser', 'Navegador (Web Audio)'); this.settings = null; }
  isSupported() { return !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext)); }
  limitations() {
    return [
      'Funciona com o JARVIS aberto e em primeiro plano.',
      'Para detecção contínua de palmas com a tela bloqueada, o navegador pode interromper o microfone em segundo plano.',
      'No Android, o microfone é liberado enquanto o reconhecimento de fala está ativo.',
    ];
  }
  async start(settings) { this.settings = settings; if (settings.clap.enabled) await startClap(settings.clap); setWakeWord(googleWake(settings), { lang: settings.hearing.lang, name: settings.hearing.wakeWordName }); }
  async stop() { await stopClap(); setWakeWord(false); }
  async pause() { await pauseClap(); }
  async resume(settings) { await resumeClap((settings || this.settings)?.clap); }
  configure(settings) { this.settings = settings; configureClap(settings.clap); }
  async setClapEnabled(on, settings) { this.settings = settings; if (on) await startClap(settings.clap); else await stopClap(); setWakeWord(googleWake(settings), { lang: settings.hearing.lang, name: settings.hearing.wakeWordName }); }
  setWakeWord(on, settings) { setWakeWord(on && googleWake(settings), { lang: settings.hearing.lang, name: settings.hearing.wakeWordName }); }
  status() {
    const c = clapStatus(); const w = wakeStatus();
    return { running: c.running || w.running, paused: c.paused, background: document.hidden, clap: c, wake: w,
      detail: document.hidden ? 'App em segundo plano: o navegador pode ter suspendido o microfone.' : c.running ? 'Ouvindo palmas.' : c.enabled ? 'Pausado (microfone em uso pela fala).' : 'Palmas desligadas.' };
  }
}
