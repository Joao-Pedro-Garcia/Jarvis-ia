// Capacidades do dispositivo: microfone (estado real), teste real de microfone,
// notificações e manter a tela ligada (Screen Wake Lock).
import { bus } from '../core/bus.js';
import { clientLog } from '../core/logger.js';
import { hearingSupported } from './hearing.js';

// ---------- Microfone ----------
// active | inactive | denied | unavailable
let micState = 'inactive';
export const MIC_LABEL = { active: 'ATIVO', inactive: 'INATIVO', denied: 'SEM PERMISSÃO', unavailable: 'INDISPONÍVEL' };
export const micStatus = () => micState;
export function setMicState(s) { if (s !== micState) { micState = s; bus.emit('mic:state', s); } }

export async function initMicState() {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return setMicState('unavailable');
  try {
    const p = await navigator.permissions.query({ name: 'microphone' });
    const apply = () => setMicState(p.state === 'denied' ? 'denied' : micState === 'active' ? 'active' : 'inactive');
    apply(); p.onchange = apply;
  } catch { /* Firefox/Safari antigos: sem Permissions API para microfone */ }
}

export function environmentChecks() {
  return {
    https: window.isSecureContext,
    micApi: !!navigator.mediaDevices?.getUserMedia,
    recognition: hearingSupported,
    synthesis: 'speechSynthesis' in window,
    notifications: 'Notification' in window,
    wakeLock: 'wakeLock' in navigator,
    serviceWorker: 'serviceWorker' in navigator,
    standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    browser: browserName(),
  };
}

export function browserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return /Android/.test(ua) ? 'Chrome Android' : 'Chrome';
  if (/Safari\//.test(ua)) return /iPhone|iPad/.test(ua) ? 'Safari iOS' : 'Safari';
  return 'Desconhecido';
}

/**
 * Teste REAL do microfone: pede permissão, mede o nível por `ms` e devolve
 * { ok, peak, reason }. `onLevel(0..1)` permite mostrar um medidor ao vivo.
 */
export async function testMicrophone({ ms = 3000, onLevel } = {}) {
  if (!window.isSecureContext) return { ok: false, reason: 'HTTPS necessário: o navegador só libera o microfone em HTTPS ou localhost.' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'Este navegador não oferece acesso ao microfone.' };
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) {
    setMicState(err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    clientLog('permissoes', `Teste de microfone: ${err.name}`, 'warn');
    return { ok: false, reason: err.name === 'NotAllowedError' ? 'Permissão negada. Libere o microfone nas configurações do site.' : `Microfone indisponível (${err.name}).` };
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  let peak = 0;
  const end = performance.now() + ms;
  await new Promise((resolve) => {
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v));
      peak = Math.max(peak, p); onLevel?.(p);
      if (performance.now() < end) setTimeout(tick, 50); else resolve();
    };
    tick();
  });
  stream.getTracks().forEach((t) => t.stop());
  await ctx.close();
  if (micState !== 'active') setMicState('inactive');
  const ok = peak > 0.01;
  clientLog('permissoes', `Teste de microfone: pico ${peak.toFixed(3)}`);
  return { ok, peak, reason: ok ? 'Microfone captando som.' : 'Permissão concedida, mas nenhum som captado (microfone mudo ou sem sinal).' };
}

// ---------- Notificações ----------
export function notificationState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // default | granted | denied
}

export async function requestNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  const r = await Notification.requestPermission();
  clientLog('permissoes', `Notificações: ${r}`);
  return r;
}

/** Mostra notificação real (via Service Worker quando possível — exigido no Android). */
export async function notify(title, body) {
  if (notificationState() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: `jarvis-${Date.now()}`, vibrate: [120, 60, 120] });
    else new Notification(title, { body, icon: '/icons/icon-192.png' });
    return true;
  } catch (err) { clientLog('erro-cliente', `Notificação falhou: ${err.message}`, 'warn'); return false; }
}

// ---------- Manter tela ligada ----------
let lock = null;
let wantLock = false;
export async function setKeepAwake(on) {
  wantLock = on;
  if (!('wakeLock' in navigator)) return false;
  try {
    if (on && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    if (!on && lock) { await lock.release(); lock = null; }
    return true;
  } catch { return false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && wantLock && !lock) setKeepAwake(true); });
export const keepAwakeActive = () => !!lock;
