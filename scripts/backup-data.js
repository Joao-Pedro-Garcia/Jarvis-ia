// Backup dos DADOS LOCAIS do JARVIS (pasta data/), que ficam fora do Git:
// progresso da Bíblia, memórias, tarefas, configurações, personalidade etc.
// Uso: npm run backup              → backups/jarvis-data-AAAA-MM-DDTHH-MM-SS/ (sem a chave secreta)
//      npm run backup -- --with-key → inclui data/.secret.key (guarde em local seguro!)
// Não apaga nem altera nada em data/.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ROOT } from '../server/core/paths.js';

const withKey = process.argv.includes('--with-key');
if (!fs.existsSync(DATA_DIR) || !fs.readdirSync(DATA_DIR).length) {
  console.log(`Nada para copiar: ${DATA_DIR} está vazio ou não existe.`);
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(ROOT, 'backups', `jarvis-data-${stamp}`);
fs.mkdirSync(dest, { recursive: true });
let files = 0;
fs.cpSync(DATA_DIR, dest, {
  recursive: true,
  filter: (src) => {
    const skip = !withKey && path.basename(src) === '.secret.key';
    if (!skip && fs.statSync(src).isFile()) files++;
    return !skip;
  },
});
const hasKey = fs.existsSync(path.join(DATA_DIR, '.secret.key'));
console.log(`✔ Backup criado: ${path.relative(ROOT, dest)} (${files} arquivos)`);
if (hasKey && !withKey) console.log('⚠ A chave data/.secret.key NÃO foi copiada. Sem ela, memórias protegidas não podem ser lidas. Use --with-key e guarde em local seguro.');
console.log('Para restaurar: pare o servidor e copie o conteúdo do backup para data/.');
