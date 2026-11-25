// Utilidades de DOM seguras (todo conteúdo externo passa por esc()).
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function safeUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } }
export const brl = (v, d = 2) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtDate(isoDate) { return isoDate ? isoDate.split('-').reverse().join('/') : '—'; }
export function relTime(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}
let toastTimer;
export function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
/** Botão de exclusão com confirmação em dois toques (ação irreversível). */
export function confirmButton(btn, onConfirm, label = 'Confirmar?') {
  let armed = false; let timer;
  const original = btn.textContent;
  btn.addEventListener('click', () => {
    if (!armed) { armed = true; btn.textContent = label; btn.classList.add('danger'); timer = setTimeout(() => { armed = false; btn.textContent = original; }, 3500); return; }
    clearTimeout(timer); armed = false; btn.textContent = original; onConfirm();
  });
}
