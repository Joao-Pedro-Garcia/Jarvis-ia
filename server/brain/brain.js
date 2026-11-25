// CÉREBRO — ponto de entrada. Usa o ORQUESTRADOR para comandos e a camada de
// IA (llm.js) para conversa livre. Sem IA configurada, responde com honestidade.
import { bus, EVENTS } from '../core/events.js';
import { log } from '../core/logger.js';
import { normalize } from '../core/text.js';
import { formatDateLong, formatTimeSpoken } from '../core/time.js';
import { getSettings } from '../core/settings.js';
import * as memory from '../modules/memory/memory.js';
import * as reading from '../modules/bible/reading.js';
import { ENGINE_DISCLAIMER } from '../modules/engine/engine.js';
import { detectTone, detectDomain, emergencyText } from './tone.js';
import { getPersonality, systemPrompt } from './personality.js';
import * as llm from './llm.js';
import { normalizeInput, resolveIntent, dispatch, handlePending, moduleResult, speechFrom, speechLimit, getRecentCommands } from './orchestrator.js';

export { getRecentCommands };

const NO_AI = 'A IA conversacional externa não está configurada, então não consigo conversar livremente sobre isso. Comandos funcionam normalmente: diga "ajuda" para ver a lista.';

function localFallback(text, tone) {
  const t = normalize(text);
  if (tone.mode === 'desabafo') {
    return 'Poxa, sinto muito que você esteja passando por isso. Estou aqui. Se quiser, me conta mais — e, se for algo muito pesado, conversar com alguém de confiança ou ligar para o CVV no 188 (24 horas, gratuito) pode ajudar. Observação: minha IA conversacional não está configurada agora, então minhas respostas estão limitadas.';
  }
  if (/^(oi|ola|e ai|eai|bom dia|boa tarde|boa noite|fala|salve|opa)\b/.test(t)) {
    const h = formatTimeSpoken().h;
    return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}! Estou online no modo local. Posso abrir a Bíblia, trazer notícias, cuidar de tarefas, fazer contas e guardar memórias. Para conversar livremente, configure a IA no servidor.`;
  }
  if (/\b(obrigad\w|valeu|vlw)\b/.test(t)) return 'Por nada. Estou por aqui.';
  if (/\b(quem e voce|seu nome|o que voce e)\b/.test(t)) return 'Sou o JARVIS, sua IA pessoal. No momento estou no modo local: comandos, Bíblia, memória, tarefas, contas e notícias funcionam; a conversa livre depende da IA configurada no servidor.';
  return NO_AI;
}

function history(sess) {
  const msgs = [];
  for (const h of sess.history.slice(-16, -1)) {
    const role = h.role === 'user' ? 'user' : 'assistant';
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${h.content}`;
    else msgs.push({ role, content: h.content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
  return msgs;
}

async function converse(text, ctx, tone) {
  const { sess } = ctx;
  const domain = detectDomain(text);
  const base = { module: domain === 'motor' ? 'MOTOR' : domain === 'engenharia' ? 'ENGENHARIA' : 'CÉREBRO', tone: tone.mode };
  const emergency = tone.mode === 'urgente' ? emergencyText(text) : '';
  if (!llm.available()) {
    const t = emergency || localFallback(text, tone);
    return moduleResult({ ...base, intent: emergency ? 'conversation.urgent' : 'conversation.local', message: t, text: t, source: 'local', offline: true, success: !!emergency || t !== NO_AI });
  }
  const p = getPersonality();
  const bibleCtx = sess.context.activeModule === 'bible' ? `O leitor da Bíblia está aberto. ${reading.whereAmI(ctx.pageSize)}` : '';
  const system = systemPrompt(p, {
    tone, domain,
    memory: memory.contextSnippet(),
    context: [bibleCtx, sess.context.activeModule === 'news' ? 'O painel de notícias está aberto.' : ''].filter(Boolean).join(' '),
    now: `${formatDateLong()}, ${formatTimeSpoken().text} (fuso ${process.env.JARVIS_TIMEZONE || 'America/Araguaina'})`,
  });
  const needsWeb = /\b(hoje|agora|atual\w*|ultim\w+|recente\w*|ontem|esta semana|resultado do jogo|placar|previsao do tempo|clima em|tempo em|preco d[eoa]|lancamento|quem ganhou)\b/.test(normalize(text));
  try {
    const { text: answer } = await llm.complete({
      system, messages: [...history(sess), { role: 'user', content: text }],
      maxTokens: tone.mode === 'estudo' || domain ? 2500 : 1200,
      effort: domain || tone.mode === 'estudo' ? 'medium' : undefined,
      webSearch: needsWeb && getSettings().privacy.allowWebSearch,
    });
    let out = answer || 'Hmm, fiquei sem resposta agora. Pode repetir?';
    if (emergency && !/19[0-3]/.test(out)) out = `${emergency}\n\n${out}`;
    if (domain === 'motor' && /\b(barulho|ruido|falha|nao liga|nao pega|esquentando|superaquec\w+|fumaca|vazamento|cheiro|luz da injecao|engasga|trepida|vibra)\b/.test(normalize(text)) && !/inspe(c|ç)/i.test(out)) out += `\n\n${ENGINE_DISCLAIMER}`;
    return moduleResult({ ...base, intent: domain ? `conversation.${domain}` : 'conversation', message: out, text: out, source: `IA: ${llm.status().providerName} (${llm.model()})` });
  } catch (err) {
    const t = `${emergency ? `${emergency}\n\n` : ''}Não consegui acessar a IA agora (${err.message}). ${emergency ? '' : localFallback(text, tone)}`.trim();
    return moduleResult({ ...base, success: false, intent: 'conversation.error', message: t, text: t, source: 'local', error: true });
  }
}

/**
 * Processa uma fala/texto do usuário.
 * @param {string} raw
 * @param {{sessionId?:string, pageSize?:number, source?:'voice'|'text', client?:object}} opts
 */
export async function processInput(raw, { sessionId = 'default', pageSize = 8, source = 'text', client = {} } = {}) {
  const started = Date.now();
  const sess = memory.session(sessionId);
  const settings = getSettings();
  const text = String(raw || '').trim().slice(0, 2000);
  if (!text) return { text: '', speech: '', success: false };
  bus.emitEvent(source === 'voice' ? EVENTS.VOICE_RECEIVED : EVENTS.TEXT_RECEIVED, { length: text.length });
  log.info('cerebro', `Entrada recebida (${source}, ${text.length} caracteres)`); // conteúdo não é registrado
  memory.pushHistory(sess, 'user', text);
  sess.lastRaw = text;
  const norm = normalizeInput(text, getPersonality().nome);
  const ctx = { sess, pageSize, settings, source, client, confirmed: false };

  let result = await handlePending(norm, ctx);
  if (!result) {
    const found = resolveIntent(norm, sess);
    if (found) result = await dispatch(found, ctx);
  }
  const tone = detectTone(text, { isCommand: !!result });
  if (!result) result = await converse(text, ctx, tone);

  result.tone = result.tone || tone.mode;
  const s = getSettings(); // pode ter mudado (modo silencioso)
  if (result.speech === undefined) result.speech = result.text;
  result.speech = s.voice.enabled && !s.voice.silent ? speechFrom(result.speech, speechLimit(result, s)) : '';
  result.silent = s.voice.silent;
  result.awaitingConfirmation = !!sess.pending || !!result.awaitingConfirmation;
  result.activeModule = sess.context.activeModule || null;
  result.ms = Date.now() - started;
  memory.pushHistory(sess, 'assistant', result.sensitive ? '[informação protegida exibida]' : result.text, { intent: result.intent });
  log.info('cerebro', `Resposta: ${result.intent} (${result.ms}ms, tom ${result.tone})`);
  return result;
}
