// VISÃO — você manda imagens (fotos, prints de mensagens) ou um vídeo e o JARVIS responde
// sobre elas, levando em conta a conversa (ex.: "olha esse print e me diz o que responder").
// Vídeo: o navegador tira alguns quadros e o Whisper transcreve o áudio; o modelo vê os
// quadros em ordem + a transcrição. Só com o Groq conectado (a IA do celular não enxerga).
import * as groq from './ai/groq.js';
import { getPersonality } from './personality.js';
import * as memory from '../modules/memory/memory.js';
import { log } from '../core/logger.js';

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 3.8 * 1024 * 1024; // limite do Groq para imagem em base64 (≈4 MB)

/** Valida o que veio do navegador. Lança erro com status 400 se algo estiver errado. */
export function cleanMedia(m) {
  if (!m || typeof m !== 'object') return null;
  const kind = m.kind === 'video' ? 'video' : 'image';
  const images = (Array.isArray(m.images) ? m.images : []).filter((u) => typeof u === 'string' && DATA_URL.test(u.slice(0, 64)) && DATA_URL.test(u) && u.length <= MAX_IMAGE_CHARS).slice(0, 5);
  if (!images.length) throw Object.assign(new Error('Imagem inválida ou grande demais (envie JPG, PNG ou WEBP).'), { status: 400 });
  const transcript = typeof m.transcript === 'string' ? m.transcript.slice(0, 8000).trim() : '';
  const duration = Number(m.duration) > 0 ? Math.round(Number(m.duration)) : null;
  return { kind, images, transcript, duration, count: Number(m.count) || images.length };
}

export const mediaLabel = (m) => (m.kind === 'video' ? `🎬 vídeo${m.duration ? ` de ${m.duration} s` : ''}` : `📷 ${m.count > 1 ? `${m.count} imagens` : 'imagem'}`);

/** Responde sobre a mídia. Devolve { text, source } — nunca inventa: sem Groq, explica. */
export async function answer(text, media, sess) {
  if (!groq.groqProvider.configured()) {
    return { text: 'Para eu entender imagens e vídeos, conecte o Groq em Configurações → INTELIGÊNCIA (é grátis). A IA do celular não consegue enxergar imagens.', source: 'local', ok: false };
  }
  const p = getPersonality();
  const mem = memory.contextSnippet(20);
  const system = [
    `Você é ${p.nome}, assistente pessoal${p.nome_usuario ? ` de ${p.nome_usuario}` : ''}. Responda em português do Brasil, de forma direta e útil (a resposta pode ser falada).`,
    media.kind === 'video'
      ? `O usuário enviou um VÍDEO${media.duration ? ` de ${media.duration} segundos` : ''}. Você recebe alguns quadros em ordem cronológica${media.transcript ? ' e a transcrição do áudio' : ' (o áudio não foi transcrito)'}. Descreva o que acontece e responda ao pedido.`
      : 'O usuário enviou imagem(ns). Se for print de conversa, mensagem, documento ou tela, leia o texto com atenção e responda ao que ele pediu (resumir, explicar, sugerir resposta). Se for foto, descreva o que importa.',
    'Leve em conta a conversa anterior: o usuário pode estar mandando a imagem por causa da sua última resposta.',
    'Nunca invente o que não dá para ver; se algo estiver ilegível, diga. Não repita dados sensíveis (senhas, números de cartão ou documento) que aparecerem na imagem.',
    mem ? `Sobre o usuário:\n${mem.slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n');
  const history = [];
  for (const h of sess.history.slice(-11, -1)) {
    const role = h.role === 'user' ? 'user' : 'assistant';
    if (history.length && history[history.length - 1].role === role) history[history.length - 1].content += `\n${h.content}`;
    else history.push({ role, content: h.content });
  }
  while (history.length && history[0].role !== 'user') history.shift();
  if (history.length && history[history.length - 1].role === 'user') history.pop();
  const ask = text || (media.kind === 'video' ? 'Do que se trata este vídeo?' : 'O que você vê aqui?');
  const prompt = media.kind === 'video' && media.transcript ? `${ask}\n\nTranscrição do áudio do vídeo:\n"""${media.transcript}"""` : ask;
  try {
    const t0 = Date.now();
    const out = await groq.seeImages({ system, history, text: prompt, images: media.images });
    log.info('cerebro', `Visão: ${media.images.length} imagem(ns) em ${Date.now() - t0} ms`);
    return { text: out.text, source: `IA ONLINE: Groq (${out.model}) · visão`, ok: true };
  } catch (err) {
    const msg = err.code === 'NO_VISION' ? err.message : groq.groqProvider.friendlyError(err);
    log.warn('cerebro', `Visão falhou: ${msg}`);
    return { text: `Não consegui analisar ${media.kind === 'video' ? 'o vídeo' : 'a imagem'} agora (${msg}).`, source: 'erro', ok: false };
  }
}
