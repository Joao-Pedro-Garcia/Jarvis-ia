// Carrega variáveis do arquivo .env (sem dependência externa). Variáveis já
// definidas no ambiente têm prioridade. Chaves NUNCA são enviadas ao frontend.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';

export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return false;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}
