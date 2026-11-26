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
import { localReply, getMode, clearMode, socialReply } from './local-mind.js';
import * as tasks from '../modules/tasks/tasks.js';
import { normalizeInput, resolveIntent, dispatch, handlePending, moduleResult, speechFrom, speechLimit, getRecentCommands } from './orchestrator.js';

export { getRecentCommands };

/** Resposta sem IA: modo local inteligente (nunca finge ser IA). */
function localAnswer(text, ctx, tone, base, emergency, prefix = '') {
  const lr = localReply(text, { sess: ctx.sess, tone });
  const t = emergency || `${prefix}${lr.text}`;
  return moduleResult({ ...base, module: emergency ? base.module : lr.module, mode: emergency ? 'URGENTE' : lr.mode, intent: emergency ? 'conversation.urgent' : lr.intent,
    message: t, text: t, source: 'local', offline: true, success: !!emergency || !lr.unanswered, wantsAI: !emergency && !!lr.unanswered });
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

/**
 * Instruções para IA local (celular/PC comum): curtas e SEMPRE IGUAIS (sem hora, sem
 * tom do momento). Assim o Ollama reaproveita a leitura já feita e só lê a mensagem
 * nova — no celular, ler o texto é a parte mais lenta (≈6 tokens/s num Poco M7 Pro).
 */
function compactPrompt(p) {
  const mem = memory.contextSnippet();
  return [
    `Você é ${p.nome}, assistente pessoal${p.nome_usuario ? ` de ${p.nome_usuario}` : ''}. Responda em português do Brasil, em 1 a 3 frases curtas e naturais (a resposta é falada).`,
    'Assunto sério: sério e objetivo. Desabafo: acolha e pergunte com carinho. Brincadeira: leve. Técnico: preciso, com unidades.',
    'Nunca invente notícias, preços, cotações ou fatos. Se não souber, diga que não sabe.',
    mem ? `Sobre o usuário: ${mem.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Histórico para IA local: em vez de uma janela que "desliza" (o que obriga a reler
 * tudo a cada pergunta), cresce até LOCAL_WINDOW mensagens e então recomeça. Enquanto
 * cresce, o começo é idêntico ao da pergunta anterior e o Ollama reaproveita a leitura.
 */
const LOCAL_WINDOW = 8;
function localHistory(sess) {
  const since = sess.context.aiWinAt || 0;
  const msgs = [];
  for (const h of sess.history.slice(0, -1).filter((x) => (x.at || 0) >= since)) {
    const role = h.role === 'user' ? 'user' : 'assistant';
    const content = String(h.content).slice(0, 400);
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${content}`;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
  if (msgs.length >= LOCAL_WINDOW) { sess.context.aiWinAt = Date.now(); return []; }
  return msgs;
}

async function converse(text, ctx, tone) {
  const { sess } = ctx;
  const domain = detectDomain(text);
  const base = { module: domain === 'motor' ? 'MOTOR' : domain === 'engenharia' ? 'ENGENHARIA' : 'CÉREBRO', tone: tone.mode };
  const emergency = tone.mode === 'urgente' ? emergencyText(text) : '';
  // Cumprimentos e agradecimentos: resposta instantânea, sem acionar a IA.
  if (!emergency && tone.mode !== 'desabafo') {
    const quick = socialReply(text, { nome: getPersonality().nome_usuario });
    if (quick) return moduleResult({ ...base, ...quick, message: quick.text, source: 'local (resposta instantânea)' });
  }
  await llm.refresh().catch(() => {});
  if (!llm.available()) return localAnswer(text, ctx, tone, base, emergency);
  const p = getPersonality();
  const isLocal = llm.kind() === 'local';
  const bibleCtx = sess.context.activeModule === 'bible' ? `O leitor da Bíblia está aberto. ${reading.whereAmI(ctx.pageSize)}` : '';
  const system = isLocal ? compactPrompt(p) : systemPrompt(p, {
    tone, domain,
    memory: memory.contextSnippet(),
    context: [bibleCtx, sess.context.activeModule === 'news' ? 'O painel de notícias está aberto.' : ''].filter(Boolean).join(' '),
    now: `${formatDateLong()}, ${formatTimeSpoken().text} (fuso ${process.env.JARVIS_TIMEZONE || 'America/Araguaina'})`,
  });
  const needsWeb = /\b(hoje|agora|atual\w*|ultim\w+|recente\w*|ontem|esta semana|resultado do jogo|placar|previsao do tempo|clima em|tempo em|preco d[eoa]|lancamento|quem ganhou)\b/.test(normalize(text));
  try {
    const { text: answer, via, onlineError } = await llm.complete({
      system,
      // IA local: instruções fixas + histórico que só cresce → o Ollama lê só a mensagem nova.
      messages: isLocal ? [...localHistory(sess), { role: 'user', content: text }] : [...history(sess), { role: 'user', content: text }],
      maxTokens: isLocal ? (tone.mode === 'estudo' || domain ? 200 : 110) : tone.mode === 'estudo' || domain ? 2500 : 1200,
      effort: domain || tone.mode === 'estudo' ? 'medium' : undefined,
      webSearch: needsWeb && getSettings().privacy.allowWebSearch,
      onToken: ctx.onToken,
    });
    let out = answer || 'Hmm, fiquei sem resposta agora. Pode repetir?';
    if (emergency && !/19[0-3]/.test(out)) out = `${emergency}\n\n${out}`;
    if (domain === 'motor' && /\b(barulho|ruido|falha|nao liga|nao pega|esquentando|superaquec\w+|fumaca|vazamento|cheiro|luz da injecao|engasga|trepida|vibra)\b/.test(normalize(text)) && !/inspe(c|ç)/i.test(out)) out += `\n\n${ENGINE_DISCLAIMER}`;
    const source = via === 'local' ? `IA LOCAL (reserva — ${onlineError}): ${llm.status().fallback?.model || ''}` : `${llm.status().state}: ${llm.status().providerName} (${llm.model()})`;
    return moduleResult({ ...base, intent: domain ? `conversation.${domain}` : 'conversation', message: out, text: out, source });
  } catch (err) {
    if (emergency) { const t = emergency; return moduleResult({ ...base, success: true, intent: 'conversation.urgent', message: t, text: t, source: 'local' }); }
    const r = localAnswer(text, ctx, tone, base, '', `Não consegui acessar a IA agora (${err.message}). Respondendo no modo local: `);
    return { ...r, intent: r.success ? r.intent : 'conversation.error', error: !r.success };
  }
}

/** "crie uma tarefa" → "qual?" → próxima frase vira a tarefa. */
function createAwaitedTask(text, sess) {
  sess.context.awaiting = null;
  const clean = text.replace(/^\s*(ei |ok )?jarvis[,\s]*/i, '').replace(/[.!]+$/, '').trim();
  if (memory.detectSensitive(clean)) return moduleResult({ intent: 'task.add', module: 'TAREFAS', text: 'Isso parece conter dados sensíveis. Por segurança, não vou salvar.', message: '' });
  const task = tasks.add(clean.charAt(0).toUpperCase() + clean.slice(1));
  sess.context.lastTaskId = task.id;
  const t = `Tarefa anotada: ${task.text}. Se quiser um horário, diga "adia para amanhã às 9h".`;
  return moduleResult({ intent: 'task.add', module: 'TAREFAS', text: t, message: t, data: { task } });
}

/** Modo da resposta (exibido na interface): CONVERSA, AJUDA, ESTUDO, TÉCNICO, DESABAFO, BRINCADEIRA, ORDEM, REVISÃO, CÁLCULO, BÍBLIA, URGENTE. */
export function modeOf(result, tone) {
  const i = String(result.intent || '');
  if (/^bible\./.test(i)) return 'BÍBLIA';
  if (/^(engineering|engine|physics|calc)\./.test(i)) return 'CÁLCULO';
  if (/^routine\.review/.test(i)) return 'REVISÃO';
  if (/^system\.help/.test(i)) return 'AJUDA';
  if (!i.startsWith('conversation')) return 'ORDEM';
  return { desabafo: 'DESABAFO', resenha: 'BRINCADEIRA', estudo: 'ESTUDO', tecnico: 'TÉCNICO', urgente: 'URGENTE', serio: 'CONVERSA', normal: 'CONVERSA' }[tone.mode] || 'CONVERSA';
}

/**
 * Processa uma fala/texto do usuário.
 * @param {string} raw
 * @param {{sessionId?:string, pageSize?:number, source?:'voice'|'text', client?:object}} opts
 */
export async function processInput(raw, { sessionId = 'default', pageSize = 8, source = 'text', client = {}, onToken = null } = {}) {
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
  const ctx = { sess, pageSize, settings, source, client, confirmed: false, onToken };

  let result = await handlePending(norm, ctx);
  if (!result) {
    const found = resolveIntent(norm, sess);
    if (found) { sess.context.awaiting = null; result = await dispatch(found, ctx); }
    else if (sess.context.awaiting === 'task.text') result = createAwaitedTask(text, sess);
  }
  const tone = detectTone(text, { isCommand: !!result });
  if (!result) result = await converse(text, ctx, tone);

  result.tone = result.tone || tone.mode;
  result.mode = result.mode || modeOf(result, tone);
  if (!String(result.intent || '').startsWith('conversation') && getMode(sess) === 'desabafo') clearMode(sess);
  if (result.success !== false && !String(result.intent || '').startsWith('conversation.explain')) sess.context.lastResult = { intent: result.intent, module: result.module, text: result.text, formula: result.formula || null };
  const s = getSettings(); // pode ter mudado (modo silencioso)
  if (result.speech === undefined) result.speech = result.text;
  result.speech = s.voice.enabled && !s.voice.silent ? speechFrom(result.speech, speechLimit(result, s)) : '';
  result.silent = s.voice.silent;
  result.awaitingConfirmation = !!sess.pending || !!result.awaitingConfirmation;
  result.activeModule = sess.context.activeModule || null;
  result.ms = Date.now() - started;
  memory.pushHistory(sess, 'assistant', result.sensitive ? '[informação protegida exibida]' : result.text, { intent: result.intent });
  log.info('cerebro', `Resposta: ${result.intent} · módulo ${result.module} · ${result.success === false ? 'falhou' : 'ok'} · ${result.ms}ms · fonte ${result.source || 'local'} · tom ${result.tone}`, { intent: result.intent, module: result.module, ok: result.success !== false, ms: result.ms, source: result.source || 'local' });
  return result;
}
