import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupTestEnv, writeFixtureBible } from './helpers/setup.js';

const dir = setupTestEnv('phase2');
await writeFixtureBible(dir);
const { processInput } = await import('../server/brain/brain.js');
const { detect } = await import('../server/brain/commands.js');
const { normalizeInput } = await import('../server/brain/orchestrator.js');
const { loadCustomCommands } = await import('../server/commands/loader.js');
const memory = await import('../server/modules/memory/memory.js');
const tasks = await import('../server/modules/tasks/tasks.js');
const { bus } = await import('../server/core/events.js');
const { getSettings, updateSettings } = await import('../server/core/settings.js');
await loadCustomCommands();

let n = 0;
const S = () => ({ sessionId: `p2-${++n}`, pageSize: 10 });
const intent = (text, active = null) => {
  const sess = { context: { activeModule: active }, history: [], lastRaw: text };
  return detect(normalizeInput(text).text, sess)?.cmd.name ?? null;
};

test('resultado estruturado do orquestrador', async () => {
  const r = await processInput('quanto é 2 mais 2?', S());
  for (const k of ['success', 'intent', 'module', 'data', 'message', 'source', 'timestamp', 'text', 'speech']) assert.ok(k in r, `faltou ${k}`);
  assert.equal(r.success, true);
  assert.equal(r.intent, 'engineering.math');
  assert.equal(r.source, 'local');
  assert.ok(!Number.isNaN(Date.parse(r.timestamp)));
});

const PHRASES = {
  'system.help': ['JARVIS, ajuda.', 'ajuda', 'o que você consegue fazer?'],
  'system.status': ['JARVIS, status.', 'status do sistema'],
  'system.silent_on': ['JARVIS, fique silencioso.', 'modo silencioso', 'ativar modo silencioso'],
  'system.silent_off': ['JARVIS, volte a falar.', 'pode falar'],
  'system.selftest': ['JARVIS, faça um diagnóstico.', 'diagnóstico completo', 'rode um autodiagnóstico'],
  'routine.day': ['JARVIS, meu dia.', 'o que eu tenho pra hoje?', 'como está meu dia'],
  'task.reminder': ['Me lembra de estudar às 19h.', 'me lembra disso amanhã', 'me avisa daqui a 20 minutos pra tirar o bolo', 'lembre-me de pagar a conta sexta'],
  'task.list': ['Quais são minhas tarefas?', 'meus lembretes'],
  'task.done': ['Concluí essa.', 'já fiz', 'concluí a tarefa 2'],
  'task.cancel': ['cancela essa tarefa', 'cancela o lembrete 2'],
  'task.postpone': ['adia para amanhã', 'adia a tarefa 1 para as 20h'],
  'voice.pause': ['pausa'],
  'voice.resume': ['continua a falar'],
  'news.summary': ['notisias', 'me atualiza'],
  'news.fuel': ['quanto tá a gazolina?', 'quanto está a gasolina?'],
  'news.exchange': ['quanto está o dólar?'],
  'bible.open': ['continue minha leitura', 'quero ler a Bíblia'],
  'bible.where': ['onde parei?'],
  'custom.coin': ['cara ou coroa'],
  'memory.remember': ['lembre que meu tipo sanguíneo é O+'],
};
for (const [expected, list] of Object.entries(PHRASES)) {
  for (const p of list) test(`"${p}" → ${expected}`, () => assert.equal(intent(p), expected));
}

test('contexto real: "avance"/"volta uma"/"leia" só mexem na Bíblia com o leitor aberto', () => {
  assert.equal(intent('avance', 'bible'), 'bible.next_page');
  assert.equal(intent('volta uma', 'bible'), 'bible.prev_page');
  assert.equal(intent('avance'), null);
  assert.equal(intent('volta uma'), null);
  assert.equal(intent('leia'), 'bible.read_aloud');
});

test('conversas vão para a IA (não viram comando)', () => {
  for (const p of ['me ajuda com esse motor', 'me explica isso', 'estou preocupado', 'lembra o que eu falei ontem?']) assert.equal(intent(p), null, p);
});

test('sem IA: conversa livre diz claramente que a IA externa não está configurada', async () => {
  const r = await processInput('me explica como funciona a fotossíntese', S());
  assert.equal(r.intent, 'conversation.local');
  assert.equal(r.success, false);
  assert.match(r.text, /IA conversacional externa não está configurada/);
});

test('urgência: resposta local com números de emergência, mesmo sem IA', async () => {
  const r = await processInput('socorro, meu pai está passando mal', S());
  assert.equal(r.tone, 'urgente');
  assert.match(r.text, /SAMU 192/);
  const g = await processInput('estou sentindo cheiro de gás na cozinha, é urgente', S());
  assert.match(g.text, /Bombeiros 193/);
  assert.match(g.text, /Não acione interruptores/);
});

test('lembretes: criar com hora, listar, "concluí essa"', async () => {
  const s = S();
  let r = await processInput('Me lembra de estudar às 19h', s);
  assert.equal(r.intent, 'task.reminder');
  const task = r.data.task;
  assert.equal(task.text, 'Estudar');
  assert.ok(task.dueAt);
  assert.equal(new Date(task.dueAt).getUTCMinutes(), 0);
  r = await processInput('quais são minhas tarefas?', s);
  assert.match(r.text, /Estudar/);
  r = await processInput('concluí essa', s);
  assert.match(r.text, /Concluída: Estudar/);
  assert.equal(tasks.get(task.id).status, 'done');
});

test('"me lembra disso amanhã" usa a frase anterior', async () => {
  const s = S();
  await processInput('preciso levar o carro na oficina', s);
  const r = await processInput('me lembra disso amanhã', s);
  assert.match(r.text, /Lembrete criado: Preciso levar o carro na oficina, amanhã/);
});

test('adiar e cancelar (com confirmação)', async () => {
  const s = S();
  await processInput('me lembra de pagar o boleto amanhã às 10h', s);
  let r = await processInput('adia para depois de amanhã às 11h', s);
  assert.match(r.text, /Adiado: Pagar o boleto, agora depois de amanhã às 11h00/);
  r = await processInput('cancela essa tarefa', s);
  assert.equal(r.awaitingConfirmation, true);
  r = await processInput('sim', s);
  assert.match(r.text, /Tarefa cancelada/);
  assert.ok(!tasks.list().some((t) => t.text === 'Pagar o boleto'));
});

test('agendador dispara lembrete vencido uma única vez (evento REMINDER_DUE)', () => {
  const t = tasks.add('Tomar remédio', { dueAt: new Date(Date.now() - 1000), hasTime: true });
  const fired = [];
  const off = (e) => fired.push(e.payload.id);
  bus.on('REMINDER_DUE', off);
  tasks.checkDue();
  tasks.checkDue();
  bus.off('REMINDER_DUE', off);
  assert.deepEqual(fired.filter((id) => id === t.id), [t.id]);
});

test('modo silencioso: não fala, mas responde na tela; "volte a falar" reativa', async () => {
  const s = S();
  let r = await processInput('fique silencioso', s);
  assert.equal(getSettings().voice.silent, true);
  r = await processInput('que horas são?', s);
  assert.match(r.text, /Agora são/);
  assert.equal(r.speech, '');
  assert.equal(r.silent, true);
  r = await processInput('volte a falar', s);
  assert.equal(getSettings().voice.silent, false);
  assert.match(r.speech, /Voltei a falar/);
});

test('dados sensíveis: criptografados no disco, mascarados e revelados só com confirmação', async () => {
  const s = S();
  let r = await processInput('lembre que a senha do wifi é Xyz98765', s);
  assert.equal(r.awaitingConfirmation, true);
  r = await processInput('sim', s);
  assert.match(r.text, /protegida/);
  const raw = fs.readFileSync(path.join(dir, 'memory.json'), 'utf8');
  assert.ok(!raw.includes('Xyz98765'), 'segredo em texto aberto no disco!');
  const listed = memory.list('facts').find((m) => m.protected);
  assert.ok(listed && !listed.text.includes('Xyz98765'));
  r = await processInput('o que você lembra sobre a senha do wifi?', s);
  assert.equal(r.awaitingConfirmation, true);
  assert.doesNotMatch(r.text, /Xyz98765/);
  r = await processInput('sim', s);
  assert.match(r.text, /Xyz98765/);
  assert.equal(r.speech, 'Mostrei a informação na tela.');
  assert.ok(!memory.contextSnippet().includes('Xyz98765'), 'segredo não pode ir para a IA');
});

test('"esqueça isso" apaga a memória referida na conversa, não a mais recente', async () => {
  const s = S();
  await processInput('lembre que meu time é o Flamengo', s);
  await processInput('lembre que eu moro em Palmas', s);
  await processInput('o que você lembra sobre meu time?', s);
  let r = await processInput('esqueça isso', s);
  assert.match(r.text, /Flamengo/);
  r = await processInput('sim', s);
  assert.ok(memory.list('facts').some((m) => /Palmas/.test(m.text)));
  assert.ok(!memory.list('facts').some((m) => /Flamengo/.test(m.text)));
});

test('status, ajuda e meu dia', async () => {
  const s = S();
  let r = await processInput('status', { ...s, client: { mic: 'denied', hearing: true, voice: true } });
  assert.match(r.text, /IA: não configurada/);
  assert.match(r.text, /Microfone: sem permissão/);
  assert.match(r.text, /Tarefas: \d+ pendente/);
  r = await processInput('ajuda', s);
  assert.match(r.text, /Bíblia/); assert.match(r.text, /Notícias/); assert.match(r.text, /Silêncio/);
  await processInput('me lembra de ligar para o mecânico hoje às 23h59', s);
  r = await processInput('meu dia', s);
  assert.match(r.text, /Ligar para o mecânico/);
  assert.match(r.text, /Bíblia/);
});

test('Bíblia: "onde parei?" informa livro, capítulo, versículo e página; "leia" lê a página inteira', async () => {
  const s = S();
  await processInput('Bíblia', s);
  await processInput('passe a página', s);
  let r = await processInput('onde parei?', s);
  assert.match(r.text, /Gênesis 2, versículo 11, página 2/);
  r = await processInput('leia', s);
  assert.equal(r.speechMode, 'reading');
  assert.match(r.speech, /^Gênesis 2\. 11\./);
  for (let v = 11; v <= 20; v++) assert.ok(r.speech.includes(`2:${v} texto`), `faltou o versículo ${v}`);
  assert.doesNotMatch(r.speech, /restante está na tela/);
});

test('comando personalizado carregado automaticamente de server/commands/custom', async () => {
  const r = await processInput('cara ou coroa', S());
  assert.match(r.text, /^Deu (cara|coroa)\.$/);
  assert.equal(r.module, 'PERSONALIZADO');
});

test('modo seguro também protege tarefas', async () => {
  updateSettings({ security: { safeMode: true } });
  const s = S();
  const r = await processInput('me lembra de beber água às 15h', s);
  assert.equal(r.awaitingConfirmation, true);
  await processInput('não', s);
  updateSettings({ security: { safeMode: false } });
});

test('personalidade: os 7 tons têm instrução e o humor é proibido nos sérios', async () => {
  const { TONES } = await import('../server/brain/tone.js');
  const { getPersonality, systemPrompt } = await import('../server/brain/personality.js');
  const p = getPersonality();
  assert.deepEqual(TONES.sort(), Object.keys(p.modos).sort());
  const prompt = systemPrompt(p, { tone: { mode: 'desabafo' }, domain: null, memory: '', context: '', now: 'agora' });
  assert.match(prompt, /Tom detectado agora: DESABAFO/);
  assert.match(prompt, /COMPREENDA/);
  assert.match(prompt, /nunca em SÉRIO, DESABAFO, URGENTE/);
});
