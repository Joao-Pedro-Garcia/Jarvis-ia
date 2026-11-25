// Baixa o texto bíblico completo para data/bible/acf.json (uso offline).
import { loadEnv } from '../server/core/env.js';
loadEnv();
const { downloadFull, DEFAULT_SOURCE } = await import('../server/modules/bible/provider.js');
console.log(`Baixando de ${process.env.BIBLE_SOURCE_URL || DEFAULT_SOURCE} …`);
try { await downloadFull(); console.log('✔ Bíblia salva em data/bible/acf.json — o módulo BÍBLIA agora funciona offline.'); }
catch (err) { console.error(`✘ Falha: ${err.message}`); process.exit(1); }
