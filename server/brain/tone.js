// Identifica o TOM da conversa: SÉRIO, NORMAL, RESENHA, TÉCNICO, ESTUDO,
// DESABAFO ou URGENTE. Comandos diretos usam NORMAL.
import { normalize } from '../core/text.js';

export const TONES = ['serio', 'normal', 'resenha', 'tecnico', 'estudo', 'desabafo', 'urgente'];

const RULES = [
  { mode: 'urgente', w: 6, re: /\b(socorro|emergencia|urgente|urgencia|acidente|incendio|pegando fogo|desmaiou|desmaiado|infarto|avc|convulsao|sangrando muito|nao consegue respirar|nao respira|passando mal|me ajuda rapido|envenenad\w+|afogand\w+|assalto|tiroteio|vazamento de gas|cheiro de gas|choque eletrico)\b/ },
  { mode: 'urgente', w: 6, re: /\b(quero (me )?matar|tirar minha vida|suicid\w+|nao quero mais viver|acabar com tudo)\b/ },
  { mode: 'desabafo', w: 3, re: /\b(estou|to|tou|me sinto|ando|fiquei|sentindo)\b.{0,25}\b(cansad[oa]|triste|ansios[oa]|desanimad[oa]|sozinh[oa]|mal|chatead[oa]|estressad[oa]|preocupad[oa]|esgotad[oa]|frustrad[oa]|deprimid[oa]|magoad[oa]|perdid[oa]|sem vontade|com medo|pra baixo|para baixo|nervos[oa]|angustiad[oa])\b/ },
  { mode: 'desabafo', w: 3, re: /\b(desabafar|desabafo|nao aguento|nao to bem|nao estou bem|dia dificil|dia pesado|semana dificil|ninguem me entende|briguei|terminei|terminou comigo|perdi meu|perdi minha|saudade|chorando|chorei|preocupacao|me preocupa)\b/ },
  { mode: 'resenha', w: 3, re: /(k{3,}|\bhaha+\b|\bhehe+\b|\brs(rs)*\b|\bzoeira\b|\bpiada\b|\bresenha\b|\bbrincadeira\b|\bta doido\b|\bconta uma piada\b|\bme zoa\b|\btira onda\b|\bfala ai\b|\bbeleza mano\b)/ },
  { mode: 'estudo', w: 2, re: /\b(explique|explica|me ensina|ensine|estudando|estudar|prova|exercicio|materia|aula|vestibular|enem|resumo de|questao|o que significa|qual a diferenca)\b/ },
  { mode: 'tecnico', w: 2, re: /\b(calcul\w*|fisica|eletronica|resistor|tensao|corrente|potencia|torque|motor|engrenagem|viga|estrutura|programacao|codigo|algoritmo|equacao|derivada|integral|circuito|mecanica|injecao|embreagem|transmissao|rpm|cilindrada|oleo|alternador|freio|arrefecimento|radiador|lubrificacao)\b/ },
  { mode: 'serio', w: 1, re: /\b(saude|medico|remedio|doenca|contrato|lei|juridic\w*|imposto|financiamento|divida|investimento|seguranca|processo|demissao)\b/ },
];

export function detectTone(text, { isCommand = false } = {}) {
  const t = normalize(text);
  const urgent = RULES.slice(0, 2).some((r) => r.re.test(t));
  if (urgent) return { mode: 'urgente', confidence: 0.95 };
  if (isCommand) return { mode: 'normal', confidence: 0.9 };
  const scores = {};
  for (const r of RULES) if (r.re.test(t)) scores[r.mode] = (scores[r.mode] || 0) + r.w;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best) return { mode: best[0], confidence: Math.min(0.95, 0.5 + best[1] * 0.12) };
  if (/\?$/.test(String(text).trim()) || /^(qual|quais|quando|onde|por que|porque|quanto|quem|como|o que)\b/.test(t)) return { mode: 'serio', confidence: 0.45 };
  return { mode: 'normal', confidence: 0.4 };
}

/** Tema técnico para o módulo especializado. */
export function detectDomain(text) {
  const t = normalize(text);
  if (/\b(motor|carro|moto|caminhao|veiculo|injecao|embreagem|cambio (do carro|automatico|manual)|marcha|transmissao|vela|bobina|alternador|radiador|arrefecimento|oleo do motor|troca de oleo|lubrificacao|turbo|cilindrada|rpm|freio|suspensao|bateria do carro|motor de partida|cabecote|virabrequim|biela|pistao|correia|combustao|catalisador|sonda lambda|tbi|ecu|injetor|bomba de combustivel|superaquec\w+)\b/.test(t)) return 'motor';
  if (/\b(calcul\w*|fisica|eletronica|resistor|capacitor|indutor|tensao|corrente|ohm|watts?|circuito|arduino|esp32|programa\w*|codigo|javascript|python|algoritmo|equacao|derivada|integral|matriz|viga|estrutura|concreto|aco|momento fletor|engrenagem|mecanica|termodinamica|hidraulica|pressao|vazao|projeto)\b/.test(t)) return 'engenharia';
  return null;
}

/** Resposta local para emergências (funciona sem IA e sem internet). */
export function emergencyText(text) {
  const t = normalize(text);
  if (/\b(quero (me )?matar|tirar minha vida|suicid\w+|nao quero mais viver|acabar com tudo)\b/.test(t)) {
    return 'Eu me importo com você e quero que você fique em segurança agora. Ligue para o CVV no 188 (24 horas, gratuito) ou para o SAMU no 192. Se estiver em perigo imediato, procure alguém por perto agora. Estou aqui para conversar enquanto isso.';
  }
  const parts = ['Emergência: ligue já para'];
  if (/incendio|fogo|gas|afogand|choque/.test(t)) parts.push('Bombeiros 193');
  if (/assalto|tiroteio|violencia/.test(t)) parts.push('Polícia 190');
  parts.push('SAMU 192');
  return `${parts[0]} ${parts.slice(1).join(', ')}. Mantenha a calma, fique em local seguro e siga as orientações do atendente.${/gas/.test(t) ? ' Não acione interruptores nem acenda chamas; abra portas e janelas e saia do local.' : ''}`;
}
