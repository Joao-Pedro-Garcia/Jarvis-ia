// ORQUESTRADOR — pipeline central:
// ENTRADA → NORMALIZAÇÃO → INTENÇÃO → ORQUESTRADOR (permissões/confirmação)
// → MÓDULO → RESULTADO ESTRUTURADO → RESPOSTA (texto + fala + interface)
import { bus, EVENTS } from '../core/events.js';
import { log } from '../core/logger.js';
import { stripWake, correctWords } from '../core/text.js';
import { detect, findCommand, YES, NO } from './commands.js';

const recentCommands = [];
export const getRecentCommands = () => recentCommands.slice(-20).reverse();

/** 1) Normalização: remove "Jarvis", cortesias e corrige erros de transcrição. */
export function normalizeInput(raw, assistantName = 'jarvis') {
  const stripped = stripWake(raw, assistantName);
  const corrected = correctWords(stripped);
  return { raw, text: corrected, corrected: corrected !== stripped };
}

/** 2) Intenção: comando registrado ou null (conversa). */
export function resolveIntent(norm, sess) {
  return detect(norm.text, sess);
}

/** Resultado estruturado padrão de qualquer módulo. */
export function moduleResult({ success = true, intent, module, data = null, message = '', source = 'local', ...rest }) {
  return { success, intent, module, data, message, source, timestamp: new Date().toISOString(), ...rest };
}

function record(name, module, ok) {
  recentCommands.push({ name, module, ok, at: new Date().toISOString() });
  if (recentCommands.length > 100) recentCommands.shift();
}

const SOURCES = { 'news.exchange': 'AwesomeAPI / Banco Central (PTAX)', 'news.fuel': 'ANP — Levantamento de Preços', 'news.summary': 'Feeds jornalísticos + AwesomeAPI + ANP', 'news.brazil': 'Feeds jornalísticos', 'news.world': 'Feeds jornalísticos', 'news.curiosity': 'Feeds jornalísticos', 'news.detail': 'Feed + IA', 'house.control': 'Home Assistant', 'house.status': 'Home Assistant' };

/** 3) Executa o módulo do comando e devolve um resultado estruturado. */
export async function runCommand(cmd, params, ctx) {
  bus.emitEvent(EVENTS.COMMAND_DETECTED, { name: cmd.name, module: cmd.module });
  log.info('comandos', `Comando: ${cmd.name}`);
  try {
    const r = await cmd.action(params, ctx);
    record(cmd.name, cmd.module, true);
    bus.emitEvent(EVENTS.COMMAND_EXECUTED, { name: cmd.name });
    const { text, ...rest } = r;
    return moduleResult({ ...rest, success: !r.error, intent: cmd.name, module: cmd.module, message: text, text, source: r.source || SOURCES[cmd.name] || 'local', data: r.data ?? null });
  } catch (err) {
    record(cmd.name, cmd.module, false);
    log.error('comandos', `Falha em ${cmd.name}: ${err.message}`);
    bus.emitEvent(EVENTS.COMMAND_FAILED, { name: cmd.name, error: err.message });
    const text = `Tive um problema ao executar isso: ${err.message}. O restante do JARVIS continua funcionando.`;
    return moduleResult({ success: false, intent: cmd.name, module: cmd.module, message: text, text, error: true });
  }
}

/** Decide se o comando precisa de confirmação (segurança). */
export function needsConfirmation(cmd, params, settings) {
  const question = cmd.confirmText ? cmd.confirmText(params) : null;
  if (cmd.permission === 'restricted' && settings.security.safeMode) return { blocked: true };
  const need = cmd.permission === 'confirm' || (cmd.permission === 'restricted' && !!question) || (settings.security.safeMode && (cmd.mutates || cmd.permission !== 'safe'));
  return need ? { question: question || `Modo seguro: confirma executar "${cmd.description || cmd.name}"?`, missingTarget: cmd.confirmText && !question } : null;
}

/** Trata uma confirmação pendente. Retorna resultado, ou null para seguir o fluxo. */
export async function handlePending(norm, ctx) {
  const { sess } = ctx;
  if (!sess.pending) return null;
  const pending = sess.pending;
  sess.pending = null;
  if (YES.test(norm.text)) return runCommand(findCommand(pending.name), pending.params, { ...ctx, confirmed: true });
  if (NO.test(norm.text)) return moduleResult({ intent: 'confirmation.cancel', module: 'SISTEMA', message: 'Cancelado. Nada foi alterado.', text: 'Cancelado. Nada foi alterado.' });
  return null; // outra frase: pendência descartada, segue o fluxo normal
}

/** Executa comando respeitando permissões. */
export async function dispatch(found, ctx) {
  const { cmd, params } = found;
  const conf = needsConfirmation(cmd, params, ctx.settings);
  if (conf?.blocked) {
    const text = 'O modo seguro está ativo: controle de dispositivos bloqueado. Diga "desativar modo seguro" para liberar.';
    return moduleResult({ success: false, intent: cmd.name, module: cmd.module, message: text, text });
  }
  if (conf?.missingTarget) {
    const text = 'Não encontrei o item correspondente.';
    return moduleResult({ success: false, intent: cmd.name, module: cmd.module, message: text, text });
  }
  if (conf) {
    ctx.sess.pending = { name: cmd.name, params, question: conf.question };
    bus.emitEvent(EVENTS.CONFIRMATION_REQUESTED, { name: cmd.name });
    return moduleResult({ intent: cmd.name, module: cmd.module, message: conf.question, text: conf.question, awaitingConfirmation: true });
  }
  return runCommand(cmd, params, ctx);
}

// ---------- 4) Resposta falada: tamanho adaptado ao tipo ----------
export function speechFrom(text, max) {
  let s = String(text || '')
    // Só a informação: fontes, horários de atualização e rodapés ficam na tela, não na fala.
    .replace(/\s*\((fontes?|via|dados d[aeo])\b[^)]*\)/gi, '')
    .replace(/^\s*via\s*:.*$/gim, '')
    .replace(/\s*[·•|]\s*(atualizad[oa] (em|às)|cache de)[^·•|\n]*/gi, '')
    .replace(/\s*[·•|]?\s*\bfontes?\s*:[^.\n]*\.?/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  if (max && s.length > max) {
    const cut = s.slice(0, max);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    s = `${end > max * 0.4 ? cut.slice(0, end + 1) : cut} O restante está na tela.`;
  }
  return s;
}

/** Limite de fala por tipo: curta para comandos simples, leitura sem limite. */
export function speechLimit(result, settings) {
  if (result.speechMode === 'reading') return 0;
  const base = settings.voice.maxSpokenChars;
  if (/^news\.(summary|brazil|world)/.test(result.intent || '')) return Math.max(base, 900);
  if (/^conversation\.(motor|engenharia)|estudo/.test(`${result.intent} ${result.tone}`)) return Math.max(base, 800);
  return base;
}
