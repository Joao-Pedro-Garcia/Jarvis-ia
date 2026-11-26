// BACKUP AUTOMÁTICO — uma cópia por dia de tudo o que é seu (memórias, tarefas e
// rotinas, conversas, configurações, Bíblia, personalidade), guardada por 14 dias.
//   • data/backups/auto/          (dentro do JARVIS)
//   • ~/storage/shared/Documents/JARVIS-backups  (no armazenamento do celular, se o Termux
//     tiver permissão: `termux-setup-storage`) ou JARVIS_BACKUP_DIR — sobrevive mesmo se o
//     Termux for apagado.
// NÃO entram: a chave do Groq (data/ai-online.json) e a chave de criptografia (.secret.key).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DATA_DIR } from './paths.js';
import { clearCache } from './store.js';
import { log } from './logger.js';

const KEEP = 14;
const EXCLUDE = new Set(['ai-online.json']);
const NAME_RE = /^jarvis-\d{4}-\d{2}-\d{2}(-[\w-]+)?\.json\.gz$/;
export const internalDir = () => path.join(DATA_DIR, 'backups', 'auto');
export function externalDir() {
  if (process.env.JARVIS_BACKUP_DIR) return path.resolve(process.env.JARVIS_BACKUP_DIR);
  const shared = path.join(os.homedir(), 'storage', 'shared');
  return fs.existsSync(shared) ? path.join(shared, 'Documents', 'JARVIS-backups') : null;
}
const today = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: process.env.JARVIS_TIMEZONE || 'America/Araguaina' });

function dataFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR).filter((f) => /^[\w-]+\.json$/.test(f) && !EXCLUDE.has(f) && fs.statSync(path.join(DATA_DIR, f)).isFile());
}

function prune(dir) {
  const files = fs.readdirSync(dir).filter((f) => NAME_RE.test(f) && !/-antes-de-restaurar/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(dir, f));
}

/** Faz um backup agora. Devolve { name, files, bytes, external }. */
export function makeBackup(tag = '') {
  const files = {};
  for (const f of dataFiles()) files[f] = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
  const bundle = { app: 'JARVIS', version: 1, createdAt: new Date().toISOString(), files };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(bundle)));
  const name = `jarvis-${today()}${tag ? `-${tag}` : ''}.json.gz`;
  fs.mkdirSync(internalDir(), { recursive: true });
  fs.writeFileSync(path.join(internalDir(), name), gz);
  prune(internalDir());
  let external = null;
  const ext = externalDir();
  if (ext && !tag) {
    try { fs.mkdirSync(ext, { recursive: true }); fs.writeFileSync(path.join(ext, name), gz); prune(ext); external = ext; } catch (err) { log.warn('sistema', `Backup no armazenamento do celular falhou: ${err.message}`); }
  }
  log.info('sistema', `Backup feito: ${Object.keys(files).length} arquivo(s)${external ? ' (cópia também no armazenamento do celular)' : ''}`);
  return { name, files: Object.keys(files).length, bytes: gz.length, external };
}

export function listBackups() {
  const dir = internalDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => NAME_RE.test(f)).sort().reverse()
    .map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, bytes: st.size, at: st.mtime.toISOString() }; });
}

/** Faz o backup do dia, se ainda não existir. */
export function dailyBackup() {
  try {
    if (!dataFiles().length) return null;
    if (listBackups().some((b) => b.name === `jarvis-${today()}.json.gz`)) return null;
    return makeBackup();
  } catch (err) { log.warn('sistema', `Backup automático falhou: ${err.message}`); return null; }
}

/** Restaura um backup (antes, guarda o estado atual em "…-antes-de-restaurar"). */
export function restoreBackup(name) {
  if (!NAME_RE.test(String(name || ''))) throw Object.assign(new Error('Backup inválido'), { status: 400 });
  const p = path.join(internalDir(), name);
  if (!fs.existsSync(p)) throw Object.assign(new Error('Backup não encontrado'), { status: 404 });
  let bundle;
  try { bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8')); } catch { throw Object.assign(new Error('Arquivo de backup danificado'), { status: 422 }); }
  if (bundle?.app !== 'JARVIS' || typeof bundle.files !== 'object') throw Object.assign(new Error('Arquivo de backup danificado'), { status: 422 });
  const entries = Object.entries(bundle.files).filter(([f, c]) => /^[\w-]+\.json$/.test(f) && !EXCLUDE.has(f) && typeof c === 'string');
  for (const [, c] of entries) JSON.parse(c); // tudo válido antes de mexer em qualquer arquivo
  const safety = makeBackup('antes-de-restaurar');
  for (const [f, c] of entries) fs.writeFileSync(path.join(DATA_DIR, f), c);
  clearCache();
  log.info('sistema', `Backup restaurado (${entries.length} arquivo(s)); estado anterior guardado em ${safety.name}`);
  return { restored: entries.length, safety: safety.name };
}

let timer = null;
export function startDailyBackup() {
  if (timer || process.env.JARVIS_AUTO_BACKUP === '0') return;
  setTimeout(dailyBackup, 60000).unref();
  timer = setInterval(dailyBackup, 3600e3);
  timer.unref();
}
