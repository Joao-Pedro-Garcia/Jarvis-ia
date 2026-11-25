// Ambiente isolado de testes: diretório de dados temporário + Bíblia sintética
// (estrutura idêntica à fonte real) para rodar sem internet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function setupTestEnv(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `jarvis-${name}-`));
  process.env.JARVIS_DATA_DIR = dir;
  process.env.JARVIS_LOG_CONSOLE = '0';
  process.env.JARVIS_TIMEZONE = 'America/Araguaina';
  for (const k of ['ANTHROPIC_API_KEY', 'AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL', 'JARVIS_ACCESS_TOKEN', 'JARVIS_SECRET_KEY']) delete process.env[k];
  return dir;
}

// Quantidade real de versículos de Gênesis 1–10; demais capítulos sintéticos.
const GN = [31, 25, 24, 26, 32, 22, 24, 22, 29, 32];
export async function writeFixtureBible(dir) {
  const { BOOKS } = await import('../../server/modules/bible/books.js');
  const arr = BOOKS.map((b) => ({
    abbrev: b.abbrev, name: b.name,
    chapters: Array.from({ length: b.chapters }, (_, c) => Array.from({ length: b.abbrev === 'gn' && GN[c] ? GN[c] : 20 }, (_, v) => `${b.name} ${c + 1}:${v + 1} texto de teste.`)),
  }));
  fs.mkdirSync(path.join(dir, 'bible'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'bible', 'acf.json'), JSON.stringify(arr));
}

/** Substitui o fetch global por respostas roteadas por URL (testes de rede). */
export function mockFetch(routes) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push(String(url));
    for (const [pattern, handler] of routes) {
      if (String(url).includes(pattern)) return handler(url, opts);
    }
    throw new TypeError('fetch failed (sem rota simulada)');
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
export const jsonResponse = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
export const textResponse = (txt, status = 200) => new Response(txt, { status });
