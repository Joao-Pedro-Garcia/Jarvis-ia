// Identifica o TIPO de conversa para ajustar o tom do JARVIS.
import { normalize } from '../core/text.js';

const RULES = [
  { mode: 'desabafo', w: 3, re: /\b(estou|to|tou|me sinto|ando|fiquei|sentindo)\b.{0,25}\b(cansad[oa]|triste|ansios[oa]|desanimad[oa]|sozinh[oa]|mal|chatead[oa]|estressad[oa]|preocupad[oa]|esgotad[oa]|frustrad[oa]|deprimid[oa]|magoad[oa]|perdid[oa]|sem vontade|com medo|pra baixo|para baixo)\b/ },
  { mode: 'desabafo', w: 3, re: /\b(desabafar|desabafo|nao aguento|nao to bem|nao estou bem|dia dificil|dia pesado|semana dificil|ninguem me entende|briguei|terminei|terminou comigo|perdi meu|perdi minha|saudade|chorando|chorei)\b/ },
  { mode: 'brincadeira', w: 3, re: /(k{3,}|\bhaha+\b|\bhehe+\b|\brs(rs)*\b|\bzoeira\b|\bpiada\b|\bresenha\b|\bbrincadeira\b|\bta doido\b|\bconta uma piada\b|\bme zoa\b|\btira onda\b)/ },
  { mode: 'estudo', w: 2, re: /\b(explique|explica|me ensina|ensine|estudando|estudar|prova|exercicio|materia|aula|vestibular|enem|resumo de|questao|o que significa|qual a diferenca)\b/ },
  { mode: 'ajuda', w: 2, re: /\b(me ajuda|me ajude|ajuda com|preciso de ajuda|consegue me ajudar|como (eu )?faco|como faz|o que eu faco|da uma forca)\b/ },
  { mode: 'tecnico', w: 2, re: /\b(calcul\w*|fisica|eletronica|resistor|tensao|corrente|potencia|torque|motor|engrenagem|viga|estrutura|programacao|codigo|algoritmo|equacao|derivada|integral|circuito|mecanica|injecao|embreagem|cambio do carro|transmissao|rpm|cilindrada|oleo do motor|alternador|freio)\b/ },
  { mode: 'serio', w: 1, re: /\b(saude|medico|remedio|doenca|contrato|lei|juridic\w*|imposto|financiamento|divida|investimento|seguranca|emergencia|acidente)\b/ },
];

export function detectTone(text, { isCommand = false } = {}) {
  const t = normalize(text);
  if (isCommand) return { mode: 'ordem', confidence: 0.9 };
  const scores = {};
  for (const r of RULES) if (r.re.test(t)) scores[r.mode] = (scores[r.mode] || 0) + r.w;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best) return { mode: best[0], confidence: Math.min(0.95, 0.5 + best[1] * 0.12) };
  if (/\?$/.test(String(text).trim()) || /^(qual|quais|quando|onde|por que|porque|quanto|quem|como|o que)\b/.test(t)) return { mode: 'serio', confidence: 0.45 };
  return { mode: 'conversa', confidence: 0.4 };
}

/** Tema técnico para o módulo especializado. */
export function detectDomain(text) {
  const t = normalize(text);
  if (/\b(motor|carro|moto|caminhao|veiculo|injecao|embreagem|cambio (do carro|automatico|manual)|marcha|transmissao|vela|bobina|alternador|radiador|arrefecimento|oleo do motor|troca de oleo|turbo|cilindrada|rpm|freio|suspensao|bateria do carro|motor de partida|cabecote|virabrequim|biela|pistao|correia|diesel do motor|combustao|catalisador|sonda lambda|tbi|ecu|injetor|bomba de combustivel)\b/.test(t)) return 'motor';
  if (/\b(calcul\w*|fisica|eletronica|resistor|capacitor|indutor|tensao|corrente|ohm|watts?|circuito|arduino|esp32|programa\w*|codigo|javascript|python|algoritmo|equacao|derivada|integral|matriz|viga|estrutura|concreto|aco|momento fletor|engrenagem|mecanica|termodinamica|hidraulica|pressao|vazao|projeto)\b/.test(t)) return 'engenharia';
  return null;
}
