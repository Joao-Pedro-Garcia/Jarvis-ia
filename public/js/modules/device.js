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

/** Estado da permissão do microfone: granted | prompt | denied | unknown. */
export async function micPermission() {
  try { return (await navigator.permissions.query({ name: 'microphone' })).state; } catch { return 'unknown'; }
}

const MIC_ERRORS = {
  NotAllowedError: 'Permissão negada. Toque no cadeado da barra de endereço → Permissões → Microfone → Permitir, e recarregue a página.',
  SecurityError: 'O navegador bloqueou o microfone por segurança (é preciso HTTPS ou localhost).',
  NotFoundError: 'Nenhum microfone encontrado neste aparelho.',
  NotReadableError: 'O microfone existe, mas está em uso por outro aplicativo ou bloqueado pelo sistema. Feche apps de gravação/chamada e tente de novo.',
  AbortError: 'O sistema interrompeu o acesso ao microfone. Tente de novo.',
  OverconstrainedError: 'O microfone não aceitou a configuração pedida.',
};

/**
 * Teste REAL do microfone, em etapas: PERMISSÃO → ACESSO → ÁUDIO RECEBIDO → NÍVEL.
 * Devolve { ok, peak, levelDb, steps:{permission,access,audio}, reason }.
 * `onLevel(0..1)` permite mostrar um medidor ao vivo.
 */
export async function testMicrophone({ ms = 3000, onLevel } = {}) {
  const steps = { permission: 'pendente', access: 'pendente', audio: 'pendente' };
  const fail = (reason, extra = {}) => ({ ok: false, steps, reason, ...extra });
  if (!window.isSecureContext) { steps.permission = 'bloqueada'; return fail('HTTPS necessário: o navegador só libera o microfone em HTTPS ou localhost.'); }
  if (!navigator.mediaDevices?.getUserMedia) return fail('Este navegador não oferece acesso ao microfone.');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (err) {
    setMicState(err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
    steps.permission = err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'negada' : 'ok';
    steps.access = 'falhou';
    clientLog('permissoes', `Teste de microfone: ${err.name}`, 'warn');
    return fail(MIC_ERRORS[err.name] || `Microfone indisponível (${err.name}: ${err.message}).`, { error: err.name });
  }
  steps.permission = 'ok'; steps.access = 'ok';
  const track = stream.getAudioTracks()[0];
  const device = track?.label || 'microfone padrão';
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
  const an = ctx.createAnalyser(); an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  let peak = 0, sumSq = 0, n = 0;
  const end = performance.now() + ms;
  await new Promise((resolve) => {
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let p = 0; for (const v of buf) { p = Math.max(p, Math.abs(v)); sumSq += v * v; n++; }
      peak = Math.max(peak, p); onLevel?.(p);
      if (performance.now() < end) setTimeout(tick, 50); else resolve();
    };
    tick();
  });
  const muted = track?.muted;
  stream.getTracks().forEach((t) => t.stop());
  await ctx.close();
  if (micState !== 'active') setMicState('inactive');
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  const levelDb = peak > 0 ? Math.round(20 * Math.log10(peak)) : -Infinity;
  const ok = peak > 0.01;
  steps.audio = ok ? 'ok' : 'sem sinal';
  clientLog('permissoes', `Teste de microfone: pico ${peak.toFixed(3)} (${levelDb} dBFS)`);
  return {
    ok, peak, rms, levelDb, device, steps,
    reason: ok ? `Microfone captando som. PERMISSÃO OK · MICROFONE ACESSÍVEL (${device}) · ÁUDIO RECEBIDO · nível de pico ${levelDb} dBFS.`
      : `PERMISSÃO OK · MICROFONE ACESSÍVEL (${device}) · nenhum som captado${muted ? ' (o sistema marcou o microfone como mudo)' : ''}. Verifique se o microfone não está mudo e fale perto dele.`,
  };
}

// ---------- Armazenamento local ----------
export async function storageCheck() {
  const out = { localStorage: false, persisted: null, usage: null, quota: null };
  try { const k = `jarvis.test.${Date.now()}`; localStorage.setItem(k, '1'); out.localStorage = localStorage.getItem(k) === '1'; localStorage.removeItem(k); } catch {}
  try { out.persisted = await navigator.storage?.persisted?.() ?? null; const e = await navigator.storage?.estimate?.(); if (e) { out.usage = e.usage; out.quota = e.quota; } } catch {}
  return out;
}

// ---------- PWA ----------
export async function pwaCheck() {
  const out = { manifest: false, icons: 0, serviceWorker: 'serviceWorker' in navigator, swActive: false, swVersion: null, standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true };
  try {
    const href = document.querySelector('link[rel="manifest"]')?.href;
    if (href) { const m = await (await fetch(href, { cache: 'no-cache' })).json(); out.manifest = !!(m.name && m.start_url && m.display); out.icons = (m.icons || []).filter((i) => /192|512/.test(i.sizes)).length; }
  } catch {}
  try { const reg = await navigator.serviceWorker?.getRegistration(); out.swActive = !!reg?.active; out.swWaiting = !!reg?.waiting; } catch {}
  return out;
}

/** HTTPS: em desenvolvimento, localhost é aceito; em produção, exige HTTPS. */
export function httpsState() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (location.protocol === 'https:') return { status: 'ok', detail: 'HTTPS ativo.' };
  if (local) return { status: 'ok', detail: 'Desenvolvimento em localhost (o navegador libera o microfone sem HTTPS). No celular/rede, use HTTPS.' };
  return { status: 'fail', detail: 'Sem HTTPS fora do localhost: o navegador BLOQUEIA o microfone. Configure HTTPS_KEY/HTTPS_CERT (veja o README).' };
}

// ---------- Notificações ----------
export function notificationState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // default | granted | denied
}

export const NOTIFICATION_HELP = {
  denied: 'As notificações estão BLOQUEADAS para este site. Para ativar: toque no cadeado (ou ⓘ) na barra de endereço → Permissões/Configurações do site → Notificações → Permitir. No Android, confira também Configurações → Apps → Chrome (ou JARVIS) → Notificações. Depois toque em "Verificar de novo".',
  default: 'Toque em "ATIVAR NOTIFICAÇÕES" e escolha "Permitir" no aviso do navegador.',
  unsupported: 'Este navegador não suporta notificações. Os lembretes aparecem na tela e são falados enquanto o JARVIS estiver aberto.',
  granted: 'Notificações permitidas. Lembretes aparecem mesmo com o JARVIS em segundo plano (com o app totalmente fechado não há aviso: isso exigiria um servidor de push).',
};

export async function requestNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied'; // o navegador não pergunta de novo: só o usuário pode liberar
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
