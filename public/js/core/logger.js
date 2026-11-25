// Envia eventos de diagnóstico do navegador ao servidor (sem conteúdo privado).
import { api } from './api.js';

let queue = [];
let timer = null;
export function clientLog(category, message, level = 'info') {
  queue.push({ category, message: String(message).slice(0, 300), level });
  if (!timer) timer = setTimeout(flush, 800);
  if (level === 'error') console.error(`[${category}]`, message);
}
async function flush() {
  timer = null;
  const batch = queue.splice(0, 20);
  for (const entry of batch) { try { await api.post('/api/logs/client', entry); } catch { /* offline */ } }
}
window.addEventListener('error', (e) => clientLog('erro-cliente', `${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`, 'error'));
window.addEventListener('unhandledrejection', (e) => clientLog('erro-cliente', `Promise: ${e.reason?.message || e.reason}`, 'error'));
