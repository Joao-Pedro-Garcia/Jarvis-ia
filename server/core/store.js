// Armazenamento JSON simples com escrita atômica (sem banco de dados externo).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const cache = new Map();

export function filePath(name) {
  return path.join(DATA_DIR, name.endsWith('.json') ? name : `${name}.json`);
}

export function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  const p = filePath(name);
  let value = structuredClone(fallback);
  try {
    if (fs.existsSync(p)) value = { ...structuredClone(fallback), ...JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (err) {
    // Arquivo corrompido: preserva cópia e recomeça a partir do padrão.
    try { fs.copyFileSync(p, `${p}.corrupt-${Date.now()}`); } catch {}
  }
  if (Array.isArray(fallback)) value = Array.isArray(value) ? value : structuredClone(fallback);
  cache.set(name, value);
  return value;
}

export function save(name, value) {
  cache.set(name, value);
  const p = filePath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, p);
  return value;
}

export function update(name, fallback, fn) {
  const current = load(name, fallback);
  const next = fn(current) ?? current;
  return save(name, next);
}

/** Usado pelos testes para começar do zero. */
export function clearCache() { cache.clear(); }
