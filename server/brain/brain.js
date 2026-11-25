// CÉREBRO — núcleo que interpreta tudo.
// TEXTO → normalização → intenção (comandos) → permissão/confirmação → ação
// ou conversa (IA) → resposta { text, speech, ui } → VOZ + INTERFACE.
import { bus, EVENTS } from '../core/events.js';
import { log, redact } from '../core/logger.js';
import { stripWake, normalize } from '../core/text.js';
import { formatDateLong, formatTimeSpoken } from '../core/time.js';
import { getSettings } from '../core/settings.js';
import * as memory from '../modules/memory/memory.js';
import * as reading from '../modules/bible/reading.js';
import { ENGINE_DISCLAIMER } from '../modules/engine/engine.js';
import { detect, findCommand, YES, NO } from './commands.js';
import { detectTone, detectDomain } from './tone.js';
import { getPersonality, systemPrompt } from './personality.js';
import * as llm from './llm.js';

const recentCommands = [];
export const getRecentCommands = () => recentCommands.slice(-20).reverse();

function speechFrom(text, max) {
  // Remove emojis, marcações e URLs; limita o tamanho falado.
  let s = String(text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    s = `${end > max * 0.4 ? cut.slice(0, end + 1) : cut} O restante está na tela.`;
  }
  return s;
}

function recordCommand(name, module, ok) {
  recentCommands.push({ name, module, ok, at: new Date().toISOString() });
  if (recentCommands.length > 100) recentCommands.shift();
}

async function runCommand(cmd, params, ctx) {
  bus.emitEvent(EVENTS.COMMAND_DETECTED, { name: cmd.name, module: cmd.module });
  log.info('comandos', `Comando: ${cmd.name}`);
  try {
    const result = await cmd.action(params, ctx);
    recordCommand(cmd.name, cmd.module, true);
    bus.emitEvent(EVENTS.COMMAND_EXECUTED, { name: cmd.name });
    return { ...result, intent: cmd.name, module: cmd.module };
  } catch (err) {
    recordCommand(cmd.name, cmd.module, false);
    log.error('comandos', `Falha em ${cmd.name}: ${err.message}`);
    bus.emitEvent(EVENTS.COMMAND_FAILED, { name: cmd.name, error: err.message });
    return { text: `Tive um problema ao executar isso: ${err.message}.`, intent: cmd.name, module: cmd.module, error: true };
  }
}

function localFallback(text, tone) {
  const t = normalize(text);
  if (tone.mode === 'desabafo') {
    return 'Poxa, sinto muito que você esteja passando por isso. Estou aqui. Se quiser, me conta mais — e, se for algo muito pesado, conversar com alguém de confiança ou ligar para o CVV no 188 (24 horas, gratuito) pode ajudar. Observação: minha IA conversacional não está configurada agora, então minhas respostas estão limitadas.';
  }
  if (/^(oi|ola|e ai|eai|bom dia|boa tarde|boa noite|fala|salve|opa)\b/.test(t)) {
    const h = formatTimeSpoken().h;
    return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}! Estou online. Posso abrir a Bíblia, trazer notícias, fazer contas, conversões e guardar memórias. Para conversar livremente, configure a chave da IA.`;
  }
  if (/\b(obrigad\w|valeu|vlw)\b/.test(t)) return 'Por nada. Estou por aqui.';
  if (/\b(quem e voce|seu nome|o que voce e)\b/.test(t)) return 'Sou o JARVIS, sua IA pessoal. No momento estou no modo local: comandos, Bíblia, memória, contas e notícias funcionam; a conversa livre depende da IA configurada no servidor.';
  return 'Entendi, mas para responder a isso eu preciso da IA conversacional, que não está disponível agora (chave não configurada ou sem internet). Comandos como "Bíblia", "Notícias", contas, conversões e memória continuam funcionando.';
}

async function converse(text, ctx, tone) {
  const { sess } = ctx;
  const domain = detectDomain(text);
  if (!llm.available()) {
    return { text: localFallback(text, tone), intent: 'conversation.local', module: 'CÉREBRO', tone: tone.mode, offline: true };
  }
  const p = getPersonality();
  const bibleCtx = sess.context.activeModule === 'bible' ? `O leitor da Bíblia está aberto. ${reading.whereAmI()}` : '';
  const system = systemPrompt(p, {
    tone, domain,
    memory: memory.contextSnippet(),
    context: [bibleCtx, sess.context.activeModule === 'news' ? 'O painel de notícias está aberto.' : ''].filter(Boolean).join(' '),
    now: `${formatDateLong()}, ${formatTimeSpoken().text} (fuso ${process.env.JARVIS_TIMEZONE || 'America/Araguaina'})`,
  });
  // Histórico recente da sessão (MEMÓRIA DE SESSÃO) para manter o contexto.
  const msgs = [];
  for (const h of sess.history.slice(-16, -1)) {
    const role = h.role === 'user' ? 'user' : 'assistant';
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += `\n${h.content}`;
    else msgs.push({ role, content: h.content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
  msgs.push({ role: 'user', content: text });
  const needsWeb = /\b(hoje|agora|atual\w*|ultim\w+|recente\w*|ontem|esta semana|resultado do jogo|placar|previsao do tempo|clima em|tempo em|preco d[eoa]|lancamento|quem ganhou)\b/.test(normalize(text));
  try {
    const { text: answer } = await llm.complete({
      system, messages: msgs,
      maxTokens: tone.mode === 'estudo' || domain ? 2500 : 1200,
      effort: domain || tone.mode === 'estudo' ? 'medium' : undefined,
      webSearch: needsWeb && getSettings().privacy.allowWebSearch,
    });
    let out = answer || 'Hmm, fiquei sem resposta agora. Pode repetir?';
    if (domain === 'motor' && /\b(barulho|ruido|falha|nao liga|nao pega|esquentando|fumaca|vazamento|cheiro|luz da injecao|engasga|trepida|vibra)\b/.test(normalize(text)) && !/inspe(c|ç)/i.test(out)) {
      out += `\n\n${ENGINE_DISCLAIMER}`;
    }
    return { text: out, intent: domain ? `conversation.${domain}` : 'conversation', module: domain === 'motor' ? 'MOTOR' : domain === 'engenharia' ? 'ENGENHARIA' : 'CÉREBRO', tone: tone.mode };
  } catch (err) {
    const offline = err.code === 'NO_KEY' || /conex|timeout|esgotado/.test(err.message);
    return { text: `${offline ? 'Estou sem acesso à IA agora' : `A IA respondeu com erro (${err.message})`}. ${localFallback(text, tone)}`, intent: 'conversation.error', module: 'CÉREBRO', tone: tone.mode, error: true };
  }
}

/**
 * Processa uma fala/texto do usuário.
 * @param {string} raw texto
 * @param {{sessionId?:string, pageSize?:number, source?:'voice'|'text'}} opts
 */
export async function processInput(raw, { sessionId = 'default', pageSize = 8, source = 'text' } = {}) {
  const started = Date.now();
  const sess = memory.session(sessionId);
  const settings = getSettings();
  const p = getPersonality();
  const text = String(raw || '').trim().slice(0, 2000);
  if (!text) return { text: '', speech: '' };
  bus.emitEvent(source === 'voice' ? EVENTS.VOICE_RECEIVED : EVENTS.TEXT_RECEIVED, { length: text.length });
  log.info('cerebro', `Entrada (${source}): ${redact(text, 60)}`);
  memory.pushHistory(sess, 'user', text);
  sess.lastRaw = text;
  const t = stripWake(text, p.nome);
  const ctx = { sess, pageSize, settings, source, confirmed: false };
  let result;

  // 1) Confirmação pendente (ações importantes)
  if (sess.pending) {
    const pending = sess.pending;
    if (YES.test(t)) {
      sess.pending = null;
      const cmd = findCommand(pending.name);
      result = await runCommand(cmd, pending.params, { ...ctx, confirmed: true });
    } else if (NO.test(t)) {
      sess.pending = null;
      result = { text: 'Cancelado. Nada foi alterado.', intent: 'confirmation.cancel', module: 'SISTEMA' };
    } else {
      sess.pending = null; // qualquer outra coisa cancela a pendência e segue normalmente
    }
  }

  // 2) Comandos
  if (!result) {
    const found = detect(t, sess);
    if (found) {
      const { cmd, params } = found;
      const question = cmd.confirmText ? cmd.confirmText(params) : null;
      const needsConfirm = cmd.permission === 'confirm'
        || (cmd.permission === 'restricted' && !!question)
        || (settings.security.safeMode && (cmd.mutates || cmd.permission !== 'safe'));
      if (cmd.permission === 'restricted' && settings.security.safeMode) {
        result = { text: 'O modo seguro está ativo: controle de dispositivos bloqueado. Diga "desativar modo seguro" para liberar.', intent: cmd.name, module: cmd.module };
      } else if (needsConfirm && cmd.name === 'memory.forget' && !question) {
        result = { text: 'Não encontrei nenhuma memória correspondente.', intent: cmd.name, module: cmd.module };
      } else if (needsConfirm) {
        const q = question || `Modo seguro: confirma executar "${cmd.description || cmd.name}"?`;
        sess.pending = { name: cmd.name, params, question: q };
        bus.emitEvent(EVENTS.CONFIRMATION_REQUESTED, { name: cmd.name });
        result = { text: q, intent: cmd.name, module: cmd.module, awaitingConfirmation: true };
      } else {
        result = await runCommand(cmd, params, ctx);
      }
    }
  }

  // 3) Conversa (IA)
  const tone = detectTone(text, { isCommand: !!result });
  if (!result) result = await converse(text, ctx, tone);

  result.tone = result.tone || tone.mode;
  if (result.speech === undefined) result.speech = result.text;
  result.speech = settings.voice.enabled ? speechFrom(result.speech, settings.voice.maxSpokenChars) : '';
  result.awaitingConfirmation = result.awaitingConfirmation || !!sess.pending;
  result.activeModule = sess.context.activeModule || null;
  result.ms = Date.now() - started;
  memory.pushHistory(sess, 'assistant', result.text, { intent: result.intent });
  log.info('cerebro', `Resposta: ${result.intent} (${result.ms}ms, tom ${result.tone})`);
  return result;
}
