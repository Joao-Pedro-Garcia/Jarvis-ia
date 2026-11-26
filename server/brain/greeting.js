// BOM DIA AO ACORDAR — curto e direto, como o usuário pediu:
// "Bom dia, Lucas! O que vai ser hoje?". Clima, notícias etc. só quando ele perguntar.
import { getPersonality } from './personality.js';

const TZ = () => process.env.JARVIS_TIMEZONE || 'America/Araguaina';

export function period(now = new Date()) {
  const h = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ() })) % 24;
  return h >= 5 && h < 12 ? 'manha' : h >= 12 && h < 18 ? 'tarde' : 'noite';
}
const SALUTE = { manha: 'Bom dia', tarde: 'Boa tarde', noite: 'Boa noite' };

/** Saudação ao acordar. Devolve { text, speech, period }. Nunca lança. */
export async function wakeGreeting({ now = new Date() } = {}) {
  const p = period(now);
  let nome = '';
  try { nome = getPersonality()?.nome_usuario || ''; } catch { /* sem perfil */ }
  const text = `${SALUTE[p]}${nome ? `, ${nome}` : ''}! O que vai ser hoje?`;
  return { text, speech: text, period: p };
}
