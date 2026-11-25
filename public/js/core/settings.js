// Configurações: servidor é a fonte da verdade; cópia local para início rápido/offline.
import { api } from './api.js';
import { bus, EVENTS } from './bus.js';

const KEY = 'jarvis.settings';
let current = null;
try { current = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}

export function getSettings() { return current; }

export function applyServerSettings(s) {
  current = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  bus.emit(EVENTS.SETTINGS_CHANGED, s);
}

export async function saveSettings(patch) {
  // aplica localmente na hora, depois persiste
  const merged = deepMerge(current || {}, patch);
  applyServerSettings(merged);
  try { applyServerSettings(await api.put('/api/settings', patch)); } catch (e) { console.warn('Configurações salvas só localmente:', e.message); }
  return current;
}

function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a[k] || {}, v) : v;
  return out;
}
