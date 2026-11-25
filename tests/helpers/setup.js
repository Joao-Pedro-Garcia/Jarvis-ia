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
  delete process.env.ANTHROPIC_API_KEY;
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
