// Máquina de estados do assistente.
import { bus, EVENTS } from './bus.js';

export const STATES = {
  standby: { core: 'ONLINE', pt: 'EM ESPERA' },
  listening: { core: 'LISTENING', pt: 'OUVINDO' },
  thinking: { core: 'THINKING', pt: 'PROCESSANDO' },
  speaking: { core: 'SPEAKING', pt: 'RESPONDENDO' },
  error: { core: 'ERROR', pt: 'ERRO' },
};

let state = 'standby';
let errorTimer = null;
export const getState = () => state;

export function setState(next, detail = '') {
  if (!STATES[next]) return;
  clearTimeout(errorTimer);
  const prev = state;
  state = next;
  document.body.dataset.state = next;
  document.getElementById('core-state').textContent = STATES[next].core;
  document.getElementById('core-sub').textContent = detail || STATES[next].pt;
  const sys = document.getElementById('sys-state');
  if (sys) sys.textContent = STATES[next].pt;
  bus.emit(EVENTS.STATE_CHANGED, { prev, next, detail });
  if (next === 'error') errorTimer = setTimeout(() => state === 'error' && setState('standby'), 4500);
}
