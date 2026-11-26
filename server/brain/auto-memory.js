// MEMÓRIA AUTOMÁTICA — aprende sozinho, durante a conversa, fatos DURADOUROS que você
// conta sobre você (nome, trabalho, família, datas, gostos, rotina, metas) e os guarda
// na Memória (aparecem no painel 🧠, com a marca "aprendido"; dá para apagar).
// Regras: só com a IA online (Groq: rápida e não trava a conversa); roda em segundo
// plano depois da resposta; NUNCA guarda dados sensíveis (senhas, documentos, cartão,
// endereço, telefone, saúde detalhada); não duplica o que já sabe; desliga em
// Configurações → PRIVACIDADE ("Aprender sozinho com as conversas").
import * as llm from './llm.js';
import * as memory from '../modules/memory/memory.js';
import { getSettings } from '../core/settings.js';
import { bus, EVENTS } from '../core/events.js';
import { log } from '../core/logger.js';

const SYSTEM = [
  'Você extrai, de UMA mensagem do usuário, fatos DURADOUROS sobre ELE que valem ser lembrados por meses:',
  'nome/apelido, profissão e trabalho, cidade, família e pessoas próximas (nome e relação), datas importantes (aniversários),',
  'gostos e preferências, rotina fixa, metas, veículo, time, igreja/religião (só se ele disser).',
  'NÃO registre: senhas, documentos, números de cartão/conta/CPF, endereço completo, telefone, e-mail, diagnósticos ou remédios,',
  'coisas passageiras (humor do momento, o que vai fazer hoje), perguntas, pedidos, nem nada que você deduziu ou que ele não afirmou.',
  'Escreva cada fato curto, em 3ª pessoa, começando com "O usuário" (ex.: "O usuário trabalha como frentista.").',
  'Não repita o que já está em "Já sei". No máximo 3 fatos.',
  'Responda APENAS com JSON: {"fatos":[{"tipo":"fato"|"preferencia","texto":"..."}]} — use {"fatos":[]} se não houver nada.',
].join(' ');

// Só vale perguntar à IA quando a frase parece falar do próprio usuário.
const ABOUT_ME = /\b(eu|meu|minha|meus|minhas|me chamo|sou|trabalho|moro|gosto|prefiro|adoro|odeio|amo|tenho|nasci|faço aniversário|minha esposa|meu filho)\b/i;
let running = false;
let queued = null; // mensagem que chegou enquanto outra era analisada (analisa depois, não perde)

export const enabled = () => getSettings().privacy?.autoMemory !== false;

export function parseFacts(raw) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const d = JSON.parse(m[0]);
    return (Array.isArray(d.fatos) ? d.fatos : []).filter((f) => f && typeof f.texto === 'string')
      .map((f) => ({ kind: /prefer/i.test(f.tipo || '') ? 'preferences' : 'facts', text: f.texto.trim().replace(/\s+/g, ' ').slice(0, 200) }))
      .filter((f) => f.text.length >= 8).slice(0, 3);
  } catch { return []; }
}

/** Já existe algo igual ou quase igual na memória? */
export function known(text) {
  return memory.search(text, { limit: 1, kinds: ['facts', 'preferences'], min: 0.55 }).length > 0;
}

/**
 * Aprende com UMA mensagem do usuário. Nunca lança; devolve os fatos guardados.
 */
export async function learnFrom(text) {
  let mine = false;
  try {
    const t = String(text || '').trim();
    if (!enabled() || t.length < 12 || t.length > 1500 || !ABOUT_ME.test(t)) return [];
    if (memory.detectSensitive(t)) return []; // frase com dado sensível: nem manda para a IA
    if (llm.kind() !== 'online' || !llm.available()) return []; // IA do celular: lenta demais para isso
    if (running) { queued = t; return []; }
    running = true; mine = true;
    const already = memory.contextSnippet(40).split('\n').filter((l) => /\((fato|preferência)\)/.test(l)).join('\n').slice(0, 1500);
    const out = await llm.complete({
      system: SYSTEM,
      messages: [{ role: 'user', content: `Já sei:\n${already || '(nada ainda)'}\n\nMensagem do usuário:\n"""${t}"""` }],
      maxTokens: 250,
      timeoutMs: 12000,
    });
    if (out?.via === 'local') return [];
    const saved = [];
    for (const f of parseFacts(out?.text)) {
      if (memory.detectSensitive(f.text) || known(f.text)) continue;
      const item = memory.add(f.kind, f.text, { source: 'auto' });
      saved.push(item.text);
    }
    if (saved.length) {
      log.info('memoria', `Aprendi ${saved.length} fato(s) novo(s) na conversa`); // conteúdo não vai para o log
      bus.emitEvent(EVENTS.MEMORY_LEARNED, { items: saved });
    }
    return saved;
  } catch (err) {
    log.warn('memoria', `Memória automática falhou: ${err.message}`);
    return [];
  } finally {
    if (mine) {
      running = false;
      if (queued) { const next = queued; queued = null; setTimeout(() => learnFrom(next), 0); }
    }
  }
}
