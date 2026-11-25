// Sistema de logs/diagnóstico. Guarda os últimos eventos em memória e grava
// em data/logs/jarvis.log (JSONL, com rotação simples). Textos do usuário são
// truncados/mascarados para não registrar dados privados desnecessariamente.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const LOG_DIR = path.join(DATA_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'jarvis.log');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const RING_SIZE = 500;
const ring = [];
let fileEnabled = process.env.JARVIS_LOG_TO_FILE !== '0';
fs.mkdirSync(LOG_DIR, { recursive: true });

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_\-]+/g,
  /\b(?:\d[ .-]?){11,16}\b/g, // CPF / cartões / telefones longos
  /[\w.+-]+@[\w-]+\.[\w.]+/g, // e-mails
];

export function redact(text, max = 80) {
  if (text == null) return text;
  let s = String(text);
  for (const re of SECRET_PATTERNS) s = s.replace(re, '[oculto]');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function write(level, category, message, meta) {
  const entry = { at: new Date().toISOString(), level, category, message: redact(message, 300) };
  if (meta && Object.keys(meta).length) entry.meta = meta;
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  if (fileEnabled) {
    try {
      if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_FILE_BYTES) {
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
      }
      fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`);
    } catch { /* disco indisponível: mantém apenas em memória */ }
  }
  if (process.env.JARVIS_LOG_CONSOLE !== '0' && (level === 'error' || level === 'warn' || process.env.JARVIS_DEBUG)) {
    console[level === 'error' ? 'error' : 'log'](`[${level}] ${category}: ${entry.message}`);
  }
  return entry;
}

export const log = {
  info: (cat, msg, meta) => write('info', cat, msg, meta),
  warn: (cat, msg, meta) => write('warn', cat, msg, meta),
  error: (cat, msg, meta) => write('error', cat, msg, meta),
  debug: (cat, msg, meta) => (process.env.JARVIS_DEBUG ? write('debug', cat, msg, meta) : null),
};

export function recentLogs({ limit = 200, category, level } = {}) {
  return ring
    .filter((e) => (!category || e.category === category) && (!level || e.level === level))
    .slice(-limit)
    .reverse();
}

export function setFileLogging(enabled) { fileEnabled = !!enabled; }
export function clearLogs() {
  ring.length = 0;
  try { fs.rmSync(LOG_FILE, { force: true }); fs.rmSync(`${LOG_FILE}.1`, { force: true }); } catch {}
}
