import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('nlu');
const { detect } = await import('../server/brain/commands.js');
const { stripWake } = await import('../server/core/text.js');
const { detectTone, detectDomain } = await import('../server/brain/tone.js');

const sess = (active = null) => ({ context: { activeModule: active }, history: [], lastRaw: '' });
const intent = (text, s = sess()) => { s.lastRaw = text; return detect(stripWake(text), s)?.cmd.name ?? null; };

const CASES = {
  'bible.open': ['Bíblia', 'JARVIS, abra a Bíblia.', 'Quero ler a Bíblia', 'Vamos continuar minha leitura', 'Continue de onde parei', 'JARVIS, continuar Bíblia.', 'bora ler a bíblia'],
  'bible.where': ['JARVIS, onde parei?', 'Qual capítulo?', 'qual é a leitura de hoje?'],
  'bible.next_page': ['Passe a página.', 'Próxima página', 'Vai para a próxima página', 'jarvis passa a página por favor'],
  'bible.prev_page': ['Volta a página.', 'Página anterior', 'voltar uma página'],
  'bible.next_chapter': ['JARVIS, próximo capítulo.', 'avança para o próximo capítulo'],
  'bible.prev_chapter': ['JARVIS, voltar capítulo.', 'capítulo anterior'],
  'bible.open_ref': ['abra João 3', 'quero ler salmo 23', 'abrir primeira coríntios 13'],
  'news.summary': ['Notícias', 'Notícias de hoje', 'Me atualiza', 'O que aconteceu hoje?', 'Me atualiza rapidamente.'],
  'news.exchange': ['Como está o dólar?', 'Quanto está o euro?', 'Quanto está a libra?', 'cotação do dólar hoje'],
  'news.fuel': ['Quanto está a gasolina?', 'Quanto está o diesel?', 'Como está o combustível no Tocantins?', 'Como está o combustível?'],
  'news.brazil': ['Me conte as principais notícias do Brasil.'],
  'news.world': ['Me conte as principais notícias do mundo.'],
  'news.curiosity': ['Tem alguma coisa interessante acontecendo?'],
  'system.time': ['Que horas são?', 'jarvis que horas são'],
  'system.date': ['que dia é hoje?'],
  'system.stop': ['Para', 'silêncio', 'pare de falar'],
  'memory.remember': ['JARVIS, lembre que eu moro em Palmas.', 'lembre disso', 'memorize que meu carro é um Gol 2014'],
  'memory.forget': ['JARVIS, esqueça isso.', 'esqueça que eu moro em Palmas'],
  'memory.recall': ['JARVIS, o que você lembra sobre isso?', 'o que você sabe sobre mim?'],
  'task.add': ['adicione uma tarefa trocar o óleo do carro'],
  'task.list': ['quais são minhas tarefas?'],
  'engineering.math': ['quanto é 15% de 230?', 'raiz quadrada de 144', 'JARVIS, faça uma conta: 2 mais 3 vezes 4'],
  'engineering.convert': ['converter 10 km em milhas', 'quanto é 32 psi em bar?'],
  'engineering.ohm': ['qual a corrente com 12 volts e 4 ohms?'],
  'engine.calc': ['qual a potência com 300 Nm a 4000 rpm?'],
  'house.control': ['ligar a luz da sala', 'desliga a TV'],
  'ui.open': ['abrir configurações', 'mostrar diagnóstico'],
};

for (const [expected, phrases] of Object.entries(CASES)) {
  for (const phrase of phrases) {
    test(`"${phrase}" → ${expected}`, () => assert.equal(intent(phrase), expected));
  }
}

test('comandos curtos dependem do CONTEXTO (Bíblia aberta)', () => {
  assert.equal(intent('Avança', sess('bible')), 'bible.next_page');
  assert.equal(intent('Próxima', sess('bible')), 'bible.next_page');
  assert.equal(intent('Volta.', sess('bible')), 'bible.prev_page');
  assert.equal(intent('Voltar', sess('bible')), 'bible.prev_page');
  // Sem a Bíblia aberta, "volta" não deve virar comando de página
  assert.equal(intent('Volta'), null);
  assert.equal(intent('próxima'), null);
});

test('conversa normal não vira comando', () => {
  for (const p of ['JARVIS, estou cansado hoje.', 'JARVIS, quero conversar.', 'JARVIS, explique esse assunto.', 'como funciona um motor a combustão?', 'meu carro está fazendo barulho no câmbio', 'quero conversar sobre o meu dia']) {
    assert.equal(intent(p), null, p);
  }
});

test('detecção de tom', () => {
  assert.equal(detectTone('JARVIS, estou cansado hoje.').mode, 'desabafo');
  assert.equal(detectTone('hoje foi um dia difícil, preciso desabafar').mode, 'desabafo');
  assert.equal(detectTone('kkkkk conta uma piada').mode, 'resenha');
  assert.equal(detectTone('me explica o que é derivada, tenho prova amanhã').mode, 'estudo');
  assert.equal(detectTone('me ajuda com uma planilha').mode, 'normal');
  assert.equal(detectTone('abra a bíblia', { isCommand: true }).mode, 'normal');
  assert.equal(detectTone('socorro, meu pai está passando mal').mode, 'urgente');
  assert.equal(detectTone('sinto cheiro de gás na cozinha, é urgente').mode, 'urgente');
  assert.equal(detectTone('estou preocupado com a prova').mode, 'desabafo');
  assert.equal(detectTone('me ajuda com esse motor que está superaquecendo').mode, 'tecnico');
  assert.equal(detectDomain('meu carro está falhando quando esquenta o motor'), 'motor');
  assert.equal(detectDomain('calcule a corrente desse circuito'), 'engenharia');
});
