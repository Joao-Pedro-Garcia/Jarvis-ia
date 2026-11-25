// Painéis sobrepostos (folhas holográficas).
import { $ } from './dom.js';
import { bus } from '../core/bus.js';

let current = null;
let onCloseCb = null;
export const currentSheet = () => current;

export function openSheet(id, title, render, { onClose } = {}) {
  current = id;
  onCloseCb = onClose || null;
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body');
  body.innerHTML = '';
  $('#overlay').hidden = false;
  bus.emit('sheet:open', id);
  render(body);
  return body;
}

export function closeSheet() {
  if (!current) return;
  $('#overlay').hidden = true;
  const cb = onCloseCb; current = null; onCloseCb = null;
  bus.emit('sheet:close');
  cb?.();
}

$('#sheet-close').addEventListener('click', closeSheet);
$('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeSheet(); });
