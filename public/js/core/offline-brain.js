// Fallback LOCAL no navegador, usado só quando o SERVIDOR do JARVIS está
// inacessível. Usa os mesmos módulos puros do servidor (shared/).
import { tryMath, formatNumber } from '/shared/math.js';
import { tryConvert } from '/shared/units.js';
import { solvePhysics } from '/shared/physics.js';

const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(ei |ok )?jarvis[,\s]*/, '').replace(/[?!.]+$/, '').trim();

export function offlineAnswer(text) {
  const t = norm(text);
  const now = new Date();
  if (/\b(que horas sao|que hora e|horas agora)\b/.test(t)) return `Agora são ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
  if (/\b(que dia (e|eh) hoje|qual (e )?a data|data de hoje)\b/.test(t)) return `Hoje é ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;
  const phys = solvePhysics(t);
  if (phys) return phys.ask || `${phys.text} Fórmula: ${phys.formula}.`;
  const conv = tryConvert(t.replace(/^(converte|converter|converta|quanto e|quantos|quantas)\s+/, ''));
  if (conv && !conv.error) return `${formatNumber(conv.value)} ${conv.from} = ${formatNumber(conv.result, 4)} ${conv.to}.`;
  const m = tryMath(t);
  if (m) return `${m.expression.replace(/\*/g, '×')} = ${formatNumber(m.value)}`;
  return null;
}

export const OFFLINE_NOTICE = 'Servidor do JARVIS inacessível. Neste aparelho continuam funcionando: hora, data, contas, conversões e cálculos de motor e física. Bíblia, memória, tarefas e notícias voltam quando o servidor estiver acessível.';
