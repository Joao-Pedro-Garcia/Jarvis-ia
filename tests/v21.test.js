// Testes da versão 2.1: IA local gratuita, modo local inteligente, física/motor,
// camada INTERNET, cache identificado, novos comandos e migração segura.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupTestEnv, writeFixtureBible, mockFetch, jsonResponse, textResponse } from './helpers/setup.js';

const dir = setupTestEnv('v21');
await writeFixtureBible(dir);
const { solvePhysics, extractQuantities } = await import('../shared/physics.js');
const llm = await import('../server/brain/llm.js');
const local = await import('../server/brain/ai/local.js');
const { normalizeInput, resolveIntent } = await import('../server/brain/orchestrator.js');
const { processInput } = await import('../server/brain/brain.js');
const memory = await import('../server/modules/memory/memory.js');
const tasks = await import('../server/modules/tasks/tasks.js');
const http = await import('../server/core/http-client.js');
const { getExchange, parseFrankfurter } = await import('../server/modules/news/exchange.js');
const { fetchAll } = await import('../server/modules/news/feeds.js');
const news = await import('../server/modules/news/news.js');
const { modulesStatus } = await import('../server/core/modules-status.js');
const store = await import('../server/core/store.js');
const house = await import('../server/modules/house/house.js');
const { runSelfTest } = await import('../server/core/selftest.js');

let mock;
afterEach(() => { mock?.restore(); mock = null; http.clearHttpCache(); local.resetLocal(); for (const k of ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL', 'ANTHROPIC_API_KEY']) delete process.env[k]; });
let n = 0;
const S = () => ({ sessionId: `v21-${++n}` });
const intent = (t) => { const s = memory.session(`i-${++n}`); s.lastRaw = t; return resolveIntent(normalizeInput(t), s)?.cmd.name ?? null; };

// ------------------------------------------------------------ FÍSICA / MOTOR
test('física: distância, tempo e velocidade média com unidades', () => {
  assert.match(solvePhysics('Se eu andar a 80 km/h durante 12 minutos, quantos quilômetros percorro?').text, /= 16 km/);
  assert.match(solvePhysics('quanto tempo para 150 km a 90 km/h').text, /1 h 40 min/);
  assert.match(solvePhysics('qual a velocidade para 120 km em 1 hora e 30 minutos').text, /80 km\/h \(22,2 m\/s\)/);
  assert.match(solvePhysics('em quanto tempo percorro 5 km a 10 m/s').text, /8 min/);
});

test('física: força, peso, pressão, energia, trabalho, potência e aceleração', () => {
  assert.match(solvePhysics('qual a força para 10 kg a 9,8 m/s2').text, /98 N/);
  assert.match(solvePhysics('peso de 75 kg').text, /735 N/);
  assert.match(solvePhysics('pressão de 500 N em 2 m2').text, /250 Pa/);
  assert.match(solvePhysics('energia cinética de 1000 kg a 20 m/s').text, /200 kJ/);
  assert.match(solvePhysics('trabalho de 50 N em 10 metros').text, /500 J/);
  assert.match(solvePhysics('potência de 3600 J em 1 minuto').text, /60 W/);
  assert.match(solvePhysics('aceleração de 0 a 100 km/h em 10 segundos').text, /2,78 m\/s²/);
  assert.match(solvePhysics('consumo de um chuveiro de 5500 W em 30 minutos').text, /2,75 kWh/);
});

test('motor: autonomia, litros, custo da viagem e rpm por relação de marcha', () => {
  assert.match(solvePhysics('autonomia com 40 litros a 12 km/l').text, /480 km/);
  assert.match(solvePhysics('quantos litros para 450 km fazendo 11,5 km/l').text, /39,1 litros/);
  const c = solvePhysics('quanto gasto de combustível em 300 km com 10 km/l e gasolina a 6,20');
  assert.match(c.text, /30 L/); assert.match(c.text, /R\$ 186,00/);
  assert.match(solvePhysics('quanto custa 40 litros a 6,19 o litro').text, /R\$ 247,60/);
  const v = solvePhysics('a quantos km/h vou com marcha 0,8 diferencial 4,1 pneu 205/55 R16 a 3000 rpm');
  assert.equal(v.module, 'MOTOR'); assert.match(v.text, /632 mm/); assert.match(v.text, /109 km\/h/);
  assert.match(solvePhysics('quantos rpm a 100 km/h com marcha 0,8 diferencial 4,1 pneu 195/60 r15').text, /2\.829 rpm/);
});

test('física: pergunta sem dados pede o que falta; contas e conversões não são capturadas', () => {
  assert.match(solvePhysics('qual a velocidade?').ask, /distância e do tempo/);
  assert.equal(solvePhysics('converta 100 km/h para m/s'), null);
  assert.equal(solvePhysics('quanto é 2 mais 2'), null);
  assert.equal(solvePhysics('Bíblia'), null);
  const q = extractQuantities('1 hora e 30 minutos'); assert.equal(q.time, 5400);
});

// ------------------------------------------------------------ CÉREBRO: frases do usuário
test('cérebro: frases naturais chegam ao módulo certo', () => {
  const cases = {
    'JARVIS, abra a Bíblia.': 'bible.open', 'continue de onde parei.': 'bible.open', 'continue': 'bible.open', 'passe a página.': 'bible.next_page', 'próximo capítulo': 'bible.next_chapter',
    'o que está acontecendo no Brasil?': 'news.brazil', 'qual o preço do dólar?': 'news.exchange', 'me mostre as notícias.': 'news.summary', 'Notícias': 'news.summary', 'câmbio': 'news.exchange',
    'quanto está a gasolina?': 'news.fuel', 'me ajude a calcular.': 'calc.start', 'faça uma conta.': 'calc.start', 'faça uma revisão.': 'routine.review', 'crie uma tarefa.': 'task.ask',
    'o que eu tenho para hoje?': 'routine.day', 'qual a velocidade?': 'physics.solve', 'converta 100 km/h para m/s.': 'engineering.convert',
    'me lembre de estudar amanhã.': 'task.reminder', 'marque como concluído.': 'task.done', 'o que você lembra?': 'memory.recall', 'esqueça isso.': 'memory.forget',
    'quanto gasto de combustível em 300 km com 10 km/l e gasolina a 6,20': 'physics.solve', 'potência com 300 Nm a 4000 rpm': 'engine.calc',
  };
  for (const [phrase, want] of Object.entries(cases)) assert.equal(intent(phrase), want, phrase);
  // conversa (não são comandos)
  for (const p of ['estou mal hoje.', 'preciso conversar.', 'me explica isso.', 'me ajuda com isso.']) assert.equal(intent(p), null, p);
});

test('cérebro: modo da resposta (BÍBLIA, CÁLCULO, REVISÃO, ORDEM, DESABAFO, BRINCADEIRA)', async () => {
  const s = S();
  assert.equal((await processInput('Bíblia', s)).mode, 'BÍBLIA');
  assert.equal((await processInput('quanto é 2 mais 2', s)).mode, 'CÁLCULO');
  assert.equal((await processInput('faça uma revisão', s)).mode, 'REVISÃO');
  assert.equal((await processInput('que horas são?', s)).mode, 'ORDEM');
  assert.equal((await processInput('estou triste hoje', S())).mode, 'DESABAFO');
  assert.equal((await processInput('conta uma piada kkkk', S())).mode, 'BRINCADEIRA');
});

test('tarefa em duas etapas: "crie uma tarefa" → "qual?" → texto vira tarefa', async () => {
  const s = S();
  assert.match((await processInput('crie uma tarefa', s)).text, /Qual é a tarefa/);
  const r = await processInput('trocar o filtro de ar', s);
  assert.equal(r.intent, 'task.add'); assert.match(r.text, /Trocar o filtro de ar/);
  assert.ok(tasks.list().some((t) => t.text === 'Trocar o filtro de ar'));
  assert.match((await processInput('marque como concluído', s)).text, /Concluída: Trocar o filtro de ar/);
});

test('"avance"/"volte" continuam na Bíblia usada por último', async () => {
  const s = S();
  await processInput('Bíblia', s);
  const a = await processInput('avance', s); assert.equal(a.intent, 'bible.next_page');
  const b = await processInput('volte', s); assert.equal(b.intent, 'bible.prev_page');
});

// ------------------------------------------------------------ MODO LOCAL INTELIGENTE (sem IA)
test('sem IA: desabafo escuta com naturalidade e acompanha a conversa', async () => {
  const s = S();
  const a = await processInput('preciso conversar', s);
  assert.equal(a.intent, 'conversation.vent'); assert.match(a.text, /Estou aqui/); assert.equal(a.success, true);
  const b = await processInput('brigaram comigo no trabalho e fiquei pensando nisso o dia todo', s);
  assert.equal(b.intent, 'conversation.vent'); assert.doesNotMatch(b.text, /IA conversacional externa/);
  const c = await processInput('às vezes acho que não vejo sentido em nada', s);
  assert.match(c.text, /188/);
  const d = await processInput('obrigado, já estou melhor', s);
  assert.match(d.text, /Fico feliz/);
});

test('sem IA: explica conceitos técnicos da base local e o último cálculo', async () => {
  const s = S();
  const t = await processInput('o que é torque?', s);
  assert.equal(t.module, 'MOTOR'); assert.match(t.text, /N·m/); assert.equal(t.success, true);
  await processInput('quanto tempo para 150 km a 90 km/h', s);
  const e = await processInput('me explica isso', s);
  assert.match(e.text, /t = d \/ v/);
});

test('sem IA: cumprimento, piada e pergunta desconhecida (honesta, sem inventar)', async () => {
  assert.match((await processInput('oi jarvis', S())).text, /Em que posso ajudar/);
  assert.match((await processInput('conta uma piada', S())).text, /\?/);
  const u = await processInput('qual a capital da Mongólia?', S());
  assert.equal(u.success, false); assert.equal(u.wantsAI, true);
  assert.match(u.text, /não está configurada/); assert.match(u.text, /Ollama/);
});

// ------------------------------------------------------------ IA LOCAL GRATUITA
const TAGS = { models: [{ name: 'nomic-embed-text:latest' }, { name: 'llama3.2:3b' }] };

test('IA local: detecta Ollama, escolhe modelo de conversa e responde sem chave', async () => {
  assert.equal(llm.providerId(), 'auto');
  let sent;
  mock = mockFetch([
    ['127.0.0.1:11434/api/tags', () => jsonResponse(TAGS)],
    ['127.0.0.1:11434/api/generate', () => jsonResponse({ done: true })],
    ['127.0.0.1:11434/api/chat', (u, o) => { sent = o; return jsonResponse({ message: { role: 'assistant', content: 'Olá, sou o JARVIS local.' }, done: true }); }],
  ]);
  const st = await llm.refresh({ force: true });
  assert.equal(st.configured, true); assert.equal(st.kind, 'local'); assert.equal(st.state, 'IA LOCAL'); assert.equal(st.free, true);
  assert.equal(st.model, 'llama3.2:3b');
  const r = await processInput('qual a capital da Mongólia?', S());
  assert.equal(r.text, 'Olá, sou o JARVIS local.');
  assert.match(r.source, /IA LOCAL/);
  assert.ok(!sent.headers.Authorization);
});

test('IA local: nenhum servidor local → IA INDISPONÍVEL com motivo, resto funciona', async () => {
  mock = mockFetch([]);
  const st = await llm.refresh({ force: true });
  assert.equal(st.configured, false); assert.equal(st.state, 'IA INDISPONÍVEL');
  assert.match(st.localProbe.reason, /Ollama: não encontrado/);
  assert.equal((await processInput('quanto é 3 vezes 3', S())).text, '3 × 3 = 9');
});

test('IA local: AI_MODEL não instalado não é usado; LM Studio é detectado', async () => {
  process.env.AI_MODEL = 'mistral';
  mock = mockFetch([['127.0.0.1:11434/api/tags', () => jsonResponse(TAGS)], ['127.0.0.1:1234/v1/models', () => jsonResponse({ data: [{ id: 'mistral' }] })]]);
  const st = await llm.refresh({ force: true });
  assert.equal(st.configured, true); assert.match(st.providerName, /LM Studio/); assert.equal(st.model, 'mistral');
});

test('IA: estados distintos LOCAL / ONLINE / INDISPONÍVEL', () => {
  process.env.AI_PROVIDER = 'none';
  assert.equal(llm.status().state, 'IA INDISPONÍVEL');
  process.env.AI_PROVIDER = 'openai'; process.env.AI_API_KEY = 'k';
  assert.equal(llm.status().state, 'IA ONLINE'); assert.equal(llm.status().free, false);
  delete process.env.AI_API_KEY; process.env.AI_PROVIDER = 'ollama'; process.env.AI_MODEL = 'llama3.2';
  assert.equal(llm.status().state, 'IA LOCAL');
});

test('IA local para de responder no meio da conversa → modo local, sem quebrar', async () => {
  mock = mockFetch([['127.0.0.1:11434/api/tags', () => jsonResponse(TAGS)]]); // chat falha (sem rota)
  await llm.refresh({ force: true });
  const r = await processInput('estou triste hoje', S());
  assert.match(r.text, /Não consegui acessar a IA agora/);
  assert.match(r.text, /sinto muito/i);
});

// ------------------------------------------------------------ INTERNET + CACHE
test('internet: ONLINE, INTERNET LIMITADA e OFFLINE', async () => {
  mock = mockFetch([['gstatic', () => textResponse('')], ['1.1.1.1', () => textResponse('')], ['githubusercontent', () => textResponse('')]]);
  assert.equal((await http.internetStatus({ force: true })).state, 'online');
  mock.restore(); mock = mockFetch([['githubusercontent', () => textResponse('')]]);
  const lim = await http.internetStatus({ force: true });
  assert.equal(lim.state, 'limited'); assert.equal(lim.online, true);
  mock.restore(); mock = mockFetch([]);
  const off = await http.internetStatus({ force: true });
  assert.equal(off.state, 'offline'); assert.equal(await http.isOnline(), false);
});

test('cache: falha não fica guardada pelo TTL longo (nova tentativa logo depois)', async () => {
  let calls = 0;
  const loader = async () => { calls++; return calls === 1 ? { ok: false } : { ok: true, v: 1 }; };
  await http.cached('t1', 3600e3, loader, { failTtlMs: 0 });
  const r = await http.cached('t1', 3600e3, loader, { failTtlMs: 0 });
  assert.equal(r.ok, true); assert.equal(calls, 2);
  const again = await http.cached('t1', 3600e3, loader, { failTtlMs: 0 });
  assert.equal(again.fromCache, true); assert.equal(calls, 2);
});

test('câmbio: AwesomeAPI e PTAX fora → Banco Central Europeu (rotulado)', async () => {
  mock = mockFetch([['api.frankfurter.app', () => jsonResponse({ amount: 1, base: 'BRL', date: '2026-11-24', rates: { USD: 0.17065, EUR: 0.1561, GBP: 0.1309 } })]]);
  const ex = await getExchange();
  assert.equal(ex.ok, true); assert.match(ex.note, /Banco Central Europeu/);
  assert.equal(ex.rates[0].code, 'USD'); assert.equal(ex.rates[0].value, 5.8599); // 1 / 0,17065
  assert.throws(() => parseFrankfurter({ base: 'USD' }));
});

test('câmbio: PTAX calcula variação contra o boletim anterior', async () => {
  const PTAX = { value: [
    { cotacaoVenda: 5.80, dataHoraCotacao: '2026-11-24 13:05:22.123', tipoBoletim: 'Fechamento' },
    { cotacaoVenda: 5.75, dataHoraCotacao: '2026-11-23 13:05:00.000', tipoBoletim: 'Fechamento' },
  ] };
  mock = mockFetch([['olinda.bcb.gov.br', () => jsonResponse(PTAX)]]);
  const ex = await getExchange();
  assert.equal(ex.rates[0].changePct, 0.87);
});

test('câmbio: tudo fora → não inventa; mostra a última cotação ROTULADA como cache', async () => {
  mock = mockFetch([['awesomeapi', () => jsonResponse({ USDBRL: { bid: '5.5', pctChange: '0', timestamp: '1795622330' }, EURBRL: { bid: '6', pctChange: '0', timestamp: '1795622330' }, GBPBRL: { bid: '7', pctChange: '0', timestamp: '1795622330' } })]]);
  await getExchange();
  mock.restore(); http.clearHttpCache(); mock = mockFetch([]);
  const ex = await getExchange();
  assert.equal(ex.ok, false); assert.equal(ex.lastKnown.rates[0].value, 5.5);
  const out = news.exchangeText(ex, 'USD');
  assert.match(out.text, /^Não consegui confirmar a cotação atual neste momento\./);
  assert.match(out.text, /CACHE de .* pode não ser a atual/);
});

test('notícias: fontes fora → "NÃO CONSEGUI CONFIRMAR AS NOTÍCIAS AGORA" + cache identificado', async () => {
  const now = new Date().toUTCString();
  const rss = `<rss><channel><item><title>Governo anuncia novo programa de infraestrutura</title><link>https://ex.test/1</link><pubDate>${now}</pubDate><description>Resumo.</description></item></channel></rss>`;
  mock = mockFetch([['g1.globo.com', () => textResponse(rss)]]);
  const ok = await fetchAll(); assert.ok(ok.items.length > 0);
  mock.restore(); http.clearHttpCache(); mock = mockFetch([]);
  const sum = await news.getSummary({ parts: ['brazil', 'world'] });
  assert.match(sum.stories.error, /NÃO CONSEGUI CONFIRMAR AS NOTÍCIAS AGORA/);
  assert.ok(sum.stories.cached?.fetchedAt);
  assert.match(news.storiesSpeech(sum.stories), /não foram confirmadas agora/);
});

test('combustíveis: indisponível → "Dados indisponíveis no momento."', () => {
  assert.match(news.fuelText({ ok: false }).text, /^Dados indisponíveis no momento\./);
});

// ------------------------------------------------------------ DIAGNÓSTICO / CASA / DADOS
test('diagnóstico do servidor: estados verdadeiros (IA, internet, casa, serviços externos)', async () => {
  mock = mockFetch([['githubusercontent', () => textResponse('')]]);
  const st = await modulesStatus();
  assert.equal(st.internet.label, 'INTERNET LIMITADA');
  assert.equal(st.components.internet.status, 'limited');
  assert.equal(st.components.ia.status, 'fail'); assert.match(st.components.ia.detail, /^Não configurada/);
  assert.match(st.components.casa.detail, /AGUARDANDO CONFIGURAÇÃO/);
  assert.equal(st.modules.find((m) => m.id === 'casa').label, 'AGUARDANDO CONFIGURAÇÃO');
  // Notícias falharam no teste anterior: serviço externo indisponível (nunca OK falso).
  assert.equal(st.components.noticias.status, 'fail'); assert.match(st.components.noticias.detail, /SERVIÇO EXTERNO INDISPONÍVEL/);
  assert.notEqual(st.components.combustiveis.status, 'ok');
});

test('auto-diagnóstico: IA ausente aparece como INDISPONÍVEL (não OK)', async () => {
  mock = mockFetch([]);
  const r = await runSelfTest();
  assert.equal(r.results.ia.status, 'fail'); assert.match(r.results.ia.detail, /IA INDISPONÍVEL/);
  assert.equal(r.results.internet.status, 'fail');
  assert.equal(r.results.armazenamento.status, 'ok');
});

test('casa sem integração: AGUARDANDO CONFIGURAÇÃO, nenhuma lâmpada inventada', async () => {
  const st = await house.status();
  assert.equal(st.state, 'AGUARDANDO CONFIGURAÇÃO');
  assert.ok(st.categories.some((c) => c.id === 'door') && st.categories.some((c) => c.id === 'camera'));
  assert.ok(st.categories.every((c) => c.devices.length === 0));
});

test('migração segura: backup antes de alterar a estrutura, dados preservados', () => {
  store.save('migr-teste', { progresso: { livro: 'gn', capitulo: 4 } });
  const out = store.migrate('migr-teste', {}, 2, (d) => { d.extra = true; return d; });
  assert.equal(out._schema, 2); assert.equal(out.progresso.capitulo, 4); assert.equal(out.extra, true);
  const backups = fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.startsWith('migr-teste'));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'backups', backups[0]), 'utf8')), { progresso: { livro: 'gn', capitulo: 4 } });
  store.migrate('migr-teste', {}, 2, () => { throw new Error('não deveria migrar de novo'); });
});
