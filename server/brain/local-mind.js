// MODO LOCAL INTELIGENTE — conversa sem IA (sem internet, sem custo).
// Usado quando nenhuma IA local/online está disponível, ou quando ela falha.
// Não finge ser uma IA: entende pedidos comuns, acolhe desabafos com
// naturalidade, explica conceitos técnicos de uma base local revisada, faz
// brincadeiras leves e, quando não sabe, diz isso com honestidade.
import { normalize } from '../core/text.js';
import { formatTimeSpoken } from '../core/time.js';

// ------------------------------------------------------------------ utilidades
const pick = (arr, n) => arr[Math.abs(n) % arr.length];
const counter = (sess, key) => { sess.context[key] = (sess.context[key] || 0) + 1; return sess.context[key]; };
const MODE_TTL = 15 * 60 * 1000;
export function setMode(sess, mode) { sess.context.mode = mode; sess.context.modeAt = Date.now(); }
export function getMode(sess) { return sess.context.mode && Date.now() - (sess.context.modeAt || 0) < MODE_TTL ? sess.context.mode : null; }
export function clearMode(sess) { sess.context.mode = null; }

// ------------------------------------------------------------------ base técnica local
// Conceitos de MOTOR e ENGENHARIA (definições padrão de livros técnicos).
export const KNOWLEDGE = [
  { keys: ['torque', 'binario'], module: 'MOTOR', text: 'Torque é a força de giro que o motor aplica no virabrequim, medida em N·m (ou kgf·m). É o que você sente como "força" nas retomadas. Potência é torque vezes rotação: P[kW] = T[N·m] × rpm ÷ 9549.' },
  { keys: ['potencia do motor', 'potencia', 'cavalo vapor', 'cv', 'hp'], module: 'MOTOR', text: 'Potência é a taxa com que o motor realiza trabalho. Unidades: kW (SI), cv (1 cv = 735,5 W) e hp (1 hp = 745,7 W). Ela depende do torque e da rotação: P[kW] = T[N·m] × rpm ÷ 9549. Por isso a potência máxima costuma aparecer em rotações altas.' },
  { keys: ['rpm', 'rotacao', 'giro do motor'], module: 'MOTOR', text: 'RPM são rotações por minuto do virabrequim. Com a marcha engatada, a rotação se relaciona com a velocidade pela relação de marcha, a relação do diferencial e o diâmetro do pneu.' },
  { keys: ['cilindrada'], module: 'MOTOR', text: 'Cilindrada é o volume total deslocado pelos pistões: V = π/4 × diâmetro² × curso × número de cilindros. Um motor 1.0 desloca cerca de 1.000 cm³ por ciclo completo de todos os cilindros.' },
  { keys: ['taxa de compressao'], module: 'MOTOR', text: 'Taxa de compressão é a razão entre o volume do cilindro com o pistão embaixo e o volume com o pistão em cima. Taxas maiores aumentam a eficiência, mas exigem combustível com maior resistência à detonação (octanagem).' },
  { keys: ['relacao de marcha', 'relacao de transmissao', 'diferencial', 'reducao'], module: 'MOTOR', text: 'Relação de marcha é quantas voltas o motor dá para cada volta do eixo de saída do câmbio. Multiplicada pela relação do diferencial, dá a relação total até as rodas. Relações altas (marchas baixas) multiplicam o torque; relações baixas favorecem velocidade e economia.' },
  { keys: ['injecao eletronica', 'injecao'], module: 'MOTOR', text: 'A injeção eletrônica dosa o combustível com base em sensores (rotação, pressão ou fluxo de ar, temperatura, posição da borboleta e sonda lambda). A central (ECU) calcula o tempo de abertura dos bicos injetores para manter a mistura correta.' },
  { keys: ['sonda lambda', 'sensor de oxigenio'], module: 'MOTOR', text: 'A sonda lambda mede o oxigênio no escapamento. Com ela, a central corrige a mistura ar-combustível para ficar perto da estequiométrica (cerca de 14,7:1 para gasolina pura). Sonda com defeito costuma aumentar o consumo e acender a luz da injeção.' },
  { keys: ['turbo', 'turbina', 'turbocompressor'], module: 'MOTOR', text: 'O turbo usa a energia dos gases de escape para girar uma turbina ligada a um compressor, que empurra mais ar para o motor. Com mais ar, dá para queimar mais combustível e gerar mais potência com a mesma cilindrada.' },
  { keys: ['arrefecimento', 'radiador', 'superaquecimento'], module: 'MOTOR', text: 'O sistema de arrefecimento circula líquido entre o motor e o radiador para manter a temperatura de trabalho (em geral perto de 90 °C). Superaquecimento pode empenar o cabeçote: se o ponteiro subir, pare em local seguro e desligue o motor. Nunca abra o reservatório quente.' },
  { keys: ['viscosidade', 'oleo do motor', '5w30', '5w40', '15w40', 'oleo'], module: 'MOTOR', text: 'No óleo "5W30", o número antes do W indica a fluidez a frio (menor = flui melhor na partida) e o depois, a viscosidade a quente. Use sempre a especificação do manual do veículo.' },
  { keys: ['embreagem'], module: 'MOTOR', text: 'A embreagem acopla e desacopla o motor do câmbio. Sinais de desgaste: pedal alto, cheiro de queimado e o motor subindo de giro sem o carro acelerar (patinando).' },
  { keys: ['abs', 'freio abs'], module: 'MOTOR', text: 'O ABS evita o travamento das rodas na frenagem forte, aliviando a pressão em pulsos rápidos. Assim você mantém o controle da direção. Em frenagem de emergência com ABS, pise firme e não bombeie o pedal.' },
  { keys: ['alternador'], module: 'MOTOR', text: 'O alternador gera energia elétrica com o motor ligado e recarrega a bateria. Com o motor funcionando, a tensão na bateria costuma ficar entre 13,8 e 14,4 V; abaixo de 13 V pode indicar problema de carga.' },
  { keys: ['velocidade media'], module: 'ENGENHARIA', text: 'Velocidade média é a distância total dividida pelo tempo total: v = d / t. Exemplo: 120 km em 1 h 30 min dão 80 km/h. Para converter km/h em m/s, divida por 3,6.' },
  { keys: ['aceleracao'], module: 'ENGENHARIA', text: 'Aceleração é a variação da velocidade por unidade de tempo: a = Δv / Δt, em m/s². A gravidade na Terra vale cerca de 9,81 m/s² (1 g).' },
  { keys: ['forca', 'newton', 'segunda lei'], module: 'ENGENHARIA', text: 'Pela segunda lei de Newton, força é massa vezes aceleração: F = m × a. A unidade é o newton (N): 1 N acelera 1 kg a 1 m/s². O peso é a força da gravidade: P = m × 9,81.' },
  { keys: ['pressao', 'pascal'], module: 'ENGENHARIA', text: 'Pressão é força dividida pela área: P = F / A. A unidade SI é o pascal (1 Pa = 1 N/m²). Outras: 1 bar = 100 kPa ≈ 14,5 psi; 1 atm = 101,3 kPa.' },
  { keys: ['energia', 'joule', 'kwh'], module: 'ENGENHARIA', text: 'Energia é a capacidade de realizar trabalho, medida em joules (J). Na conta de luz usamos kWh: 1 kWh = 3,6 milhões de joules. Energia cinética: ½ m v². Energia potencial: m g h.' },
  { keys: ['trabalho'], module: 'ENGENHARIA', text: 'Trabalho é força vezes deslocamento na direção da força: W = F × d, em joules. Se a força é perpendicular ao movimento, ela não realiza trabalho.' },
  { keys: ['lei de ohm', 'ohm', 'resistencia eletrica'], module: 'ENGENHARIA', text: 'Lei de Ohm: V = R × I (tensão = resistência × corrente). Daí I = V/R e R = V/I. A potência elétrica é P = V × I = R × I².' },
  { keys: ['tensao', 'corrente', 'voltagem', 'amperagem'], module: 'ENGENHARIA', text: 'Tensão (volts) é a "pressão" elétrica entre dois pontos; corrente (ampères) é o fluxo de carga; resistência (ohms) é a oposição a esse fluxo. Relação: V = R × I.' },
  { keys: ['potencia eletrica', 'watt'], module: 'ENGENHARIA', text: 'Potência elétrica é P = V × I, em watts. O consumo de energia é potência vezes tempo: um aparelho de 1.000 W ligado por 1 hora consome 1 kWh.' },
  { keys: ['consumo de combustivel', 'km por litro', 'autonomia'], module: 'MOTOR', text: 'Consumo em km/L é a distância dividida pelos litros gastos. Autonomia = litros no tanque × km/L. Custo da viagem = (distância ÷ km/L) × preço do litro. Posso fazer essas contas: diga, por exemplo, "quanto gasto em 300 km com 10 km/l e gasolina a 6,20?".' },
];

export function findKnowledge(text) {
  const t = normalize(text);
  if (!/\b(o que (e|sao|significa)|explic\w*|me ensina|como funciona|para que serve|defin\w*|conceito|diferenca)\b/.test(t)) return null;
  let best = null;
  for (const k of KNOWLEDGE) for (const key of k.keys) {
    if (new RegExp(`\\b${key}\\b`).test(t) && (!best || key.length > best.len)) best = { ...k, len: key.length };
  }
  return best;
}

// ------------------------------------------------------------------ respostas
const VENT_OPEN = [
  'Poxa, sinto muito que hoje esteja pesado. Quer me contar o que aconteceu? Estou aqui para ouvir, sem pressa.',
  'Poxa, sinto muito que você esteja assim. Que bom que falou. O que está te deixando desse jeito?',
  'Poxa, sinto muito. Estou aqui com você. Se quiser desabafar, pode falar do jeito que vier.',
];
const LIMIT_NOTE = ' (Só para você saber: a IA conversacional não está configurada agora, então minhas respostas são mais simples. Mas estou te ouvindo.)';
const VENT_LISTEN = [
  'Entendo. Isso parece ter pesado bastante. Como você está se sentindo agora com isso?',
  'Faz sentido você se sentir assim. Quer me contar um pouco mais?',
  'Obrigado por confiar isso a mim. O que mais tem passado pela sua cabeça?',
  'Imagino que não esteja fácil. Tem alguma parte disso que incomoda mais?',
  'Estou ouvindo. Às vezes só colocar para fora já alivia um pouco. Continua, se quiser.',
];
const HEAVY = /\b(nao aguento|sem saida|deprimid\w|desesper\w+|vontade de sumir|ninguem se importa|sozinh\w+ demais|nao vejo sentido)\b/;
const CVV = ' Se o peso estiver grande demais, conversar com alguém de confiança ou ligar para o CVV no 188 (gratuito, 24 horas) pode ajudar.';

const JOKES = [
  'Por que o livro de matemática ficou triste? Porque tinha problemas demais.',
  'O que o motor disse para o mecânico? "Hoje eu não estou com pique, estou com giro baixo."',
  'Sabe por que o computador foi ao médico? Porque estava com vírus.',
  'Qual é o carro favorito do elétron? O que tem carga positiva no porta-malas.',
  'Por que o físico não confia nos átomos? Porque eles inventam tudo.',
  'O que a impressora falou para a outra? "Essa folha é sua ou é impressão minha?"',
  'Qual é o cúmulo da paciência? Esperar o Wi-Fi do vizinho voltar.',
  'Por que a vela não conversa com a lâmpada? Porque ela acha a lâmpada muito brilhante.',
];

export const CAPABILITIES = 'Posso abrir a Bíblia de onde você parou, trazer notícias, câmbio e combustíveis, criar tarefas e lembretes, guardar memórias, fazer contas, conversões e cálculos de motor e de física, revisar o seu dia e explicar conceitos de motor e engenharia.';
export const NO_AI_HINT = 'Para conversar livremente sobre qualquer assunto, de graça e sem internet, instale uma IA local como o Ollama (veja "IA local gratuita" no README).';

/**
 * Respostas sociais INSTANTÂNEAS (cumprimento, agradecimento, "tudo bem?"), usadas
 * mesmo com IA ligada: não faz sentido esperar a IA do celular para um "boa noite".
 * Só reconhece a frase curta e inteira; "boa noite, me explica X" segue para a IA.
 */
export function socialReply(text, { nome } = {}) {
  // Vírgulas, "jarvis" e pontuação não importam: "Bom dia, Jarvis, tudo bem?" = "bom dia tudo bem".
  const t = normalize(text).replace(/[,.!?]+/g, ' ').replace(/\bjarvis\b/g, ' ').replace(/^(ei|ok)\s+/, '').replace(/\s+/g, ' ').trim();
  const r = (txt, intent) => ({ text: txt, intent, module: 'CÉREBRO', mode: 'CONVERSA' });
  const who = nome ? `, ${nome}` : '';
  const GREET = '(oi|ola|e ai|eai|bom dia|boa tarde|boa noite|fala|salve|opa|hey|alo)';
  const HOW = '(tudo bem|tudo bom|tudo certo|como (voce )?(esta|vai|ta)|como vai voce|beleza|suave|de boa|blz)( (com voce|e voce|contigo|ai))?';
  const m = t.match(new RegExp(`^${GREET}( ${HOW})?$`));
  if (m) {
    const h = formatTimeSpoken().h;
    const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    return m[2] ? r(`${g}${who}! Tudo em ordem por aqui. E com você, tudo bem?`, 'conversation.greeting') : r(`${g}${who}! Em que posso ajudar?`, 'conversation.greeting');
  }
  if (new RegExp(`^${HOW}$`).test(t)) return r('Tudo em ordem por aqui, sistemas funcionando. E com você, como estão as coisas?', 'conversation.smalltalk');
  if (/^(tudo (bem|otimo|certo|tranquilo)|estou bem|to bem|bem|tranquilo|de boa)( (e voce|e contigo|gracas a deus))?$/.test(t)) return r(/\be (voce|contigo)$/.test(t) ? 'Que bom! Por aqui também, tudo em ordem. Em que posso ajudar?' : 'Que bom! Em que posso ajudar?', 'conversation.smalltalk');
  if (/^(muito )?(obrigad[oa]|valeu|vlw|agradeco|brigad[oa])( (mesmo|demais|ai))?$/.test(t)) return r('Por nada. Estou por aqui.', 'conversation.thanks');
  if (/^(tchau|ate mais|ate logo|ate amanha|falou|fui|boa noite e ate amanha)$/.test(t)) return r(`Até mais${who}. Quando precisar, é só chamar.`, 'conversation.bye');
  return null;
}

/**
 * Resposta local. Sempre devolve algo honesto.
 * @returns {{ text:string, intent:string, module:string, mode?:string, speech?:string }}
 */
export function localReply(text, { sess, tone }) {
  const t = normalize(text).replace(/^(ei |ok )?jarvis[,\s]*/, '').replace(/[.!?]+$/, '').trim();
  const mode = getMode(sess);
  const r = (txt, intent, module = 'CÉREBRO', extra = {}) => ({ text: txt, intent, module, ...extra });

  // Saída do modo desabafo
  if (mode === 'desabafo' && /\b(obrigad\w|valeu|ja (estou|to) melhor|melhorou|era so isso|pode parar)\b/.test(t)) {
    clearMode(sess);
    return r('Fico feliz de ter ajudado de algum jeito. Quando quiser conversar de novo, é só chamar.', 'conversation.vent', 'CÉREBRO', { mode: 'DESABAFO' });
  }

  // Desabafo: começa ou continua ouvindo
  if (tone.mode === 'desabafo' || /\b(preciso (conversar|falar|desabafar)|quero (conversar|desabafar)|posso desabafar|to precisando conversar)\b/.test(t) || mode === 'desabafo') {
    const first = mode !== 'desabafo';
    setMode(sess, 'desabafo');
    const n = counter(sess, 'ventCount');
    let txt = first
      ? (/\b(preciso|quero|posso) (conversar|falar|desabafar)\b/.test(t) ? 'Claro. Estou aqui e com tempo. Pode falar do jeito que vier.' : pick(VENT_OPEN, n))
      : pick(VENT_LISTEN, n);
    if (HEAVY.test(t)) txt += CVV;
    if (!sess.context.ventNoted) { sess.context.ventNoted = true; txt += LIMIT_NOTE; }
    return r(txt, 'conversation.vent', 'CÉREBRO', { mode: 'DESABAFO' });
  }

  // Cumprimentos e conversa social
  if (/^(oi|ola|e ai|eai|bom dia|boa tarde|boa noite|fala|salve|opa|hey)\b/.test(t)) {
    const h = formatTimeSpoken().h;
    const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    return r(`${g}! Em que posso ajudar? Se quiser ideias: "Bíblia", "notícias", "meu dia" ou uma conta.`, 'conversation.greeting', 'CÉREBRO', { mode: 'CONVERSA' });
  }
  if (/\b(tudo bem|como (voce )?(esta|vai)|tudo certo|beleza)\b/.test(t) && t.split(' ').length <= 6) {
    return r('Tudo em ordem por aqui, sistemas funcionando. E com você, como estão as coisas?', 'conversation.smalltalk', 'CÉREBRO', { mode: 'CONVERSA' });
  }
  if (/\b(obrigad\w|valeu|vlw|agradeco)\b/.test(t)) return r('Por nada. Estou por aqui.', 'conversation.thanks', 'CÉREBRO', { mode: 'CONVERSA' });
  if (/\b(quem e voce|seu nome|o que voce e|voce e uma ia|voce e um robo)\b/.test(t)) {
    return r(`Sou o JARVIS, seu assistente pessoal. Neste momento estou no modo local, sem IA conversacional. ${CAPABILITIES}`, 'conversation.identity', 'CÉREBRO', { mode: 'CONVERSA' });
  }

  // Brincadeira / resenha
  if (tone.mode === 'resenha' || /\b(piada|me faz rir|conta (uma )?coisa engracada)\b/.test(t)) {
    if (/\b(piada|engracad\w|rir)\b/.test(t)) return r(pick(JOKES, counter(sess, 'jokeCount')), 'conversation.joke', 'CÉREBRO', { mode: 'BRINCADEIRA' });
    return r(pick(['Hahaha, essa foi boa.', 'Kkkk, você não presta.', 'Rapaz… essa eu não esperava.'], counter(sess, 'laughCount')) + ' Quer uma piada?', 'conversation.banter', 'CÉREBRO', { mode: 'BRINCADEIRA' });
  }

  // Ajuda genérica
  if (/^(me ajuda|me ajude|ajuda aqui|preciso de ajuda|pode me ajudar)( com isso| com uma coisa| aqui| ai)?$/.test(t)) {
    const last = sess.context.lastResult;
    const ctx = last?.formula ? ` Se for sobre o último cálculo (${last.formula}), posso explicar: diga "me explica isso".` : '';
    return r(`Claro. Com o quê exatamente?${ctx} ${CAPABILITIES}`, 'conversation.help', 'CÉREBRO', { mode: 'AJUDA' });
  }

  // Explicação: base local ou contexto da última resposta
  const k = findKnowledge(t);
  if (k) return r(k.text, `conversation.explain`, k.module, { mode: tone.mode === 'estudo' ? 'ESTUDO' : 'TÉCNICO' });
  if (/^(me )?(explica|explique|explicar)( isso| melhor| de novo| como foi| essa conta| esse calculo)?$|^como (voce )?(chegou|calculou)( nisso| nesse resultado)?$/.test(t)) {
    const last = sess.context.lastResult;
    if (last?.formula) return r(`Usei a fórmula ${last.formula}. Substituí os valores que você informou, mantendo as unidades no SI, e arredondei para 3 algarismos significativos. Resultado: ${last.text}`, 'conversation.explain', last.module || 'ENGENHARIA', { mode: 'ESTUDO' });
    if (last?.module === 'BÍBLIA') return r('Você está no plano de leitura diário. Diga "onde parei?" para ver livro, capítulo e versículo, ou "passe a página" para continuar.', 'conversation.explain', 'BÍBLIA', { mode: 'AJUDA' });
    return r('Explicar o quê, exatamente? Me diga o assunto, por exemplo: "o que é torque?" ou "explica a lei de Ohm".', 'conversation.explain', 'CÉREBRO', { mode: 'ESTUDO' });
  }

  // Comandos de navegação fora de contexto
  if (/^(avanc\w+|proxima|proximo|volt\w+|anterior|continu\w+|pass\w+)$/.test(t)) {
    return r('Avançar ou voltar em quê? Diga "Bíblia" para abrir a leitura de onde você parou.', 'conversation.clarify', 'CÉREBRO', { mode: 'AJUDA' });
  }

  // Não sabe: honestidade, sem fingir
  const tech = tone.mode === 'tecnico' || tone.mode === 'estudo';
  return r(`${tech ? 'Essa pergunta precisa de uma IA conversacional, mas a IA conversacional externa não está configurada e nenhuma IA local foi encontrada. Na base local tenho conceitos como torque, potência, relação de marcha, pressão, energia e lei de Ohm, e faço cálculos com os seus números.' : 'A IA conversacional externa não está configurada (e nenhuma IA local foi encontrada), então não consigo responder isso livremente.'} ${NO_AI_HINT}`,
    'conversation.local', 'CÉREBRO', { mode: tech ? 'TÉCNICO' : 'CONVERSA', unanswered: true });
}
