// BOM DIA AO ACORDAR — saudação criativa e variada (sem inventar fatos).
// 1) cumprimento pela hora + nome; 2) uma frase criativa (IA online, se responder em
// até 2,5 s; senão, frases próprias que não se repetem em seguida); 3) clima REAL de
// agora (só se já estiver disponível — nunca inventado); 4) "como posso ajudar".
import * as llm from './llm.js';
import { getPersonality } from './personality.js';
import * as weather from '../modules/weather/weather.js';
import { log } from '../core/logger.js';

const TZ = () => process.env.JARVIS_TIMEZONE || 'America/Araguaina';

export function period(now = new Date()) {
  const h = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ() })) % 24;
  return h >= 5 && h < 12 ? 'manha' : h >= 12 && h < 18 ? 'tarde' : 'noite';
}
const SALUTE = { manha: 'Bom dia', tarde: 'Boa tarde', noite: 'Boa noite' };

// Frases próprias (sem fatos inventados). {n} = nome.
const LINES = {
  manha: [
    'Sistemas aquecidos, café virtual pronto e eu aqui, às suas ordens.',
    'O sol já levantou e eu também. Vamos fazer deste dia um sucesso.',
    'Todos os sistemas operacionais. Hoje é um ótimo dia para resolver coisas grandes.',
    'Acordei com energia total. Bora começar o dia com o pé direito, {n}?',
    'Reatores ligados e mente afiada. O dia é seu, eu só ajudo a acelerar.',
    'Mais um dia, mais uma missão. Estou pronto quando você estiver.',
    'Despertar concluído com sucesso. Nenhum bug, só boas vibrações.',
  ],
  tarde: [
    'A tarde chegou e eu continuo em plena forma. No que vamos trabalhar?',
    'Metade do dia vencida, a outra metade é nossa. Estou pronto.',
    'Voltei ao modo ativo. Café da tarde opcional, ajuda garantida.',
    'Sistemas renovados para a segunda rodada do dia.',
    'Que bom te ouvir. A tarde promete, {n}.',
    'Pronto para transformar esta tarde em produtividade pura.',
  ],
  noite: [
    'A noite chegou, mas eu não perco o brilho. Em que posso ajudar?',
    'Luzes baixas, sistemas ligados. Estou aqui com você.',
    'Fim de dia é hora de fechar as pendências com chave de ouro.',
    'Acordei para o turno da noite. Silencioso, rápido e às ordens.',
    'Que bom te ver de novo, {n}. Vamos encerrar o dia bem.',
    'Modo noturno ativado: menos barulho, mesma eficiência.',
  ],
};
let lastIdx = { manha: -1, tarde: -1, noite: -1 };

export function localLine(p, nome) {
  const list = LINES[p];
  let i = Math.floor(Math.random() * list.length);
  if (i === lastIdx[p]) i = (i + 1) % list.length;
  lastIdx[p] = i;
  return list[i].replace(/,? \{n\}/g, nome ? `, ${nome}` : '').replace('{n}', nome || '');
}

async function aiLine(p, nome, ms) {
  if (llm.kind() !== 'online' || !llm.available()) return null; // IA do celular é lenta demais para o bom-dia
  const weekday = new Date().toLocaleDateString('pt-BR', { weekday: 'long', timeZone: TZ() });
  const call = llm.complete({
    system: 'Você é o JARVIS, assistente pessoal brasileiro: elegante, confiante, bem-humorado. Responda só com a frase pedida, em português do Brasil, sem emojis, sem aspas.',
    messages: [{ role: 'user', content: `Crie UMA frase curta (no máximo 18 palavras), criativa e animada, para eu dizer ao ${nome || 'meu usuário'} logo depois de ser acordado por ele. Período: ${p === 'manha' ? 'manhã' : p}, ${weekday}. Não cumprimente (o "bom dia" já foi dito), não fale de clima, não invente fatos nem notícias, não faça pergunta.` }],
    maxTokens: 60,
    timeoutMs: ms,
  });
  const out = await Promise.race([call, new Promise((r) => setTimeout(() => r(null), ms))]).catch(() => null);
  const text = out?.text?.trim().replace(/^["“']|["”']$/g, '');
  if (!text || text.length > 180 || out?.via === 'local') return null;
  return text;
}

/** Saudação ao acordar. Devolve { text, speech, period, source }. Nunca lança. */
export async function wakeGreeting({ budgetMs = 2500 } = {}) {
  const p = period();
  let nome = '';
  try { nome = getPersonality()?.nome_usuario || ''; } catch { /* sem perfil */ }
  const [ai, w] = await Promise.all([
    aiLine(p, nome, budgetMs).catch((e) => { log.warn('cerebro', `Bom dia criativo pela IA falhou: ${e.message}`); return null; }),
    weather.weatherFast(Math.min(budgetMs, 2000)).catch(() => null),
  ]);
  const salute = `${SALUTE[p]}${nome ? `, ${nome}` : ''}!`;
  const line = ai || localLine(p, nome);
  const hook = weather.weatherHook(w);
  const text = [salute, line, hook, 'Como posso ajudar?'].filter(Boolean).join(' ');
  return { text, speech: text, period: p, source: ai ? 'ia' : 'local' };
}
