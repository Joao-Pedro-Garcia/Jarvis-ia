// CONFIGURAÇÕES persistentes (servidor). O navegador mantém cópia local.
import { load, save } from './store.js';
import { bus, EVENTS } from './events.js';

export const DEFAULT_SETTINGS = {
  voice: { enabled: true, silent: false, bargeIn: true, rate: 1.05, pitch: 1, volume: 1, lang: 'pt-BR', voiceName: '', maxSpokenChars: 1500, engine: 'celular', neuralVoice: 'pt-BR-AntonioNeural' },
  hearing: { lang: 'pt-BR', silenceMs: 1800, continuousConversation: true, wakeWord: false, wakeWordName: 'jarvis', engine: 'auto', endMode: 'tap' },
  clap: { enabled: false, sensitivity: 0.6, minGapMs: 120, maxGapMs: 700, maxClapMs: 110, cooldownMs: 2500, thresholdOverride: 0, calibratedPeak: 0 },
  ui: { theme: 'ciano', animations: true, mode: 'desempenho', particles: true, keepAwake: false, startAsleep: true },
  notifications: { enabled: false },
  privacy: { saveConversationLogs: false, allowWebSearch: true, autoMemory: true },
  security: { safeMode: false },
  bible: { pageSizeOverride: 0 },
  ai: { threads: 0, tunedFor: '' }, // núcleos para a IA local (0 = automático) e o modelo para o qual foi medido
};

function merge(base, patch) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object') out[k] = merge(base[k], v);
    else if (k in base) out[k] = v;
  }
  return out;
}

export function getSettings() {
  const saved = load('settings', {});
  // 600 era o limite padrão antigo (a fala parava no meio): passa para o novo padrão.
  if (saved?.voice?.maxSpokenChars === 600) saved.voice.maxSpokenChars = DEFAULT_SETTINGS.voice.maxSpokenChars;
  return merge(DEFAULT_SETTINGS, saved);
}

export function updateSettings(patch) {
  const next = merge(getSettings(), patch);
  save('settings', next);
  bus.emitEvent(EVENTS.SETTINGS_UPDATED, { keys: Object.keys(patch || {}) });
  return next;
}
