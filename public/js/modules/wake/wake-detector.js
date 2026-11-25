// WakeDetector — abstração de "detectores de ativação" (palmas, palavra de ativação).
// Implementação atual: BrowserWakeDetector (Web Audio + Web Speech, exige o
// JARVIS aberto e em primeiro plano). Preparado para AndroidNativeWakeDetector
// (app nativo com serviço em primeiro plano), que só é usado se existir de verdade.
//
// Contrato:
//   id, name
//   isSupported(): boolean
//   limitations(): string[]           — limitações honestas exibidas ao usuário
//   start(settings): Promise<void>    — pode lançar erro (ex.: permissão negada)
//   stop(): Promise<void>
//   pause() / resume(settings)        — liberar o microfone para o reconhecimento de fala
//   configure(settings)
//   status(): { running, paused, background, detail }
// Ao detectar ativação, deve emitir no barramento: EVENTS.DOUBLE_CLAP ou EVENTS.VOICE_RECEIVED {wake:true}.
export class WakeDetector {
  constructor(id, name) { this.id = id; this.name = name; }
  isSupported() { return false; }
  limitations() { return []; }
  async start() { throw new Error('não implementado'); }
  async stop() {}
  async pause() {}
  async resume() {}
  configure() {}
  status() { return { running: false, paused: false, background: false, detail: '' }; }
}

const registry = [];
export function registerWakeDetector(det) { registry.push(det); }
/** Escolhe o melhor detector disponível (nativo primeiro, se existir de verdade). */
export function pickWakeDetector() { return registry.find((d) => d.isSupported()) || null; }
export const allWakeDetectors = () => registry.slice();
