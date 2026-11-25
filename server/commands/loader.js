// COMANDOS PERSONALIZADOS: qualquer arquivo .js em server/commands/custom/
// que exporte `default` (um comando ou uma lista) é registrado ao iniciar.
// Não é preciso alterar nenhum outro arquivo. Veja server/commands/custom/moeda.js.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { registerCommand } from '../brain/commands.js';
import { log } from '../core/logger.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'custom');

export async function loadCustomCommands() {
  if (!fs.existsSync(DIR)) return [];
  const loaded = [];
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort()) {
    try {
      const mod = await import(pathToFileURL(path.join(DIR, file)).href);
      for (const cmd of [].concat(mod.default || [])) { registerCommand({ module: 'PERSONALIZADO', ...cmd }); loaded.push(cmd.name); }
    } catch (err) { log.error('comandos', `Comando personalizado inválido (${file}): ${err.message}`); }
  }
  if (loaded.length) log.info('comandos', `Comandos personalizados: ${loaded.join(', ')}`);
  return loaded;
}
