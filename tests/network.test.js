import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, mockFetch, jsonResponse, textResponse } from './helpers/setup.js';

setupTestEnv('network');
const { clearHttpCache, fetchWithTimeout } = await import('../server/core/http-client.js');
const { getExchange } = await import('../server/modules/news/exchange.js');
const { getFuel, parseMonthlyLinks } = await import('../server/modules/news/fuel.js');
const { fetchAll } = await import('../server/modules/news/feeds.js');
const news = await import('../server/modules/news/news.js');
const { processInput } = await import('../server/brain/brain.js');
let mock;
afterEach(() => { mock?.restore(); clearHttpCache(); });

const AWESOME = { USDBRL: { bid: '5.8587', pctChange: '-0.79', varBid: '-0.04', timestamp: '1795622330', create_date: '2026-11-25 12:58:50' }, EURBRL: { bid: '6.41', pctChange: '0.1', timestamp: '1795622330' }, GBPBRL: { bid: '7.64', pctChange: '0.2', timestamp: '1795622330' } };
const PTAX = { value: [{ cotacaoCompra: 5.80, cotacaoVenda: 5.81, dataHoraCotacao: '2026-11-24 13:05:22.123', tipoBoletim: 'Fechamento' }] };

test('timeout: requisição lenta é abortada (internet lenta)', async () => {
  mock = mockFetch([['lento.test', (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))]]);
  await assert.rejects(fetchWithTimeout('https://lento.test/x', { timeout: 40 }), /timeout/);
});

test('câmbio: AwesomeAPI fora do ar → PTAX do Banco Central (rotulada)', async () => {
  mock = mockFetch([['awesomeapi', () => textResponse('erro', 503)], ['olinda.bcb.gov.br', () => jsonResponse(PTAX)]]);
  const ex = await getExchange();
  assert.equal(ex.ok, true);
  assert.equal(ex.rates.length, 3);
  assert.match(ex.rates[0].kind, /PTAX/);
  assert.match(ex.note, /PTAX/);
});

test('câmbio: resposta inválida da AwesomeAPI também cai para PTAX', async () => {
  mock = mockFetch([['awesomeapi', () => textResponse('<html>manutenção</html>')], ['olinda.bcb.gov.br', () => jsonResponse(PTAX)]]);
  assert.match((await getExchange()).rates[0].source, /Banco Central/);
});

test('câmbio: todas as fontes fora → nunca inventa valor', async () => {
  mock = mockFetch([]);
  const ex = await getExchange();
  assert.equal(ex.ok, false);
  assert.equal(ex.error, 'Não consegui confirmar a cotação atual neste momento.');
  const r = await processInput('quanto está o dólar?', { sessionId: 'n1' });
  assert.match(r.text, /Não consegui confirmar a cotação atual/);
});

test('câmbio: cache curto (1 min) evita requisições repetidas', async () => {
  mock = mockFetch([['awesomeapi', () => jsonResponse(AWESOME)]]);
  await getExchange(); const second = await getExchange();
  assert.equal(second.fromCache, true);
  assert.equal(mock.calls.filter((c) => c.includes('awesomeapi')).length, 1);
});

const CSV_HEADER = 'Regiao - Sigla;Estado - Sigla;Municipio;Revenda;CNPJ da Revenda;Nome da Rua;Numero Rua;Complemento;Bairro;Cep;Produto;Data da Coleta;Valor de Venda;Valor de Compra;Unidade de Medida;Bandeira';
const row = (uf, prod, date, price) => `N;${uf};X;P;0;R;1;;B;0;${prod};${date};${price};;R$ / litro;B`;
const today = new Date();
const dd = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const recent = dd(new Date(today.getTime() - 2 * 86400000));
const GAS = [CSV_HEADER, row('TO', 'GASOLINA', recent, '6,50'), row('SP', 'GASOLINA', recent, '6,10')].join('\n');
const DIESEL = [CSV_HEADER, row('TO', 'DIESEL', recent, '6,00'), row('TO', 'DIESEL S10', recent, '6,20')].join('\n');

test('combustíveis: semanal ok → ordem Gasolina, Diesel comum, Diesel S-10 (sem misturar)', async () => {
  mock = mockFetch([['ultimas-4-semanas-gasolina', () => textResponse(GAS)], ['ultimas-4-semanas-diesel', () => textResponse(DIESEL)]]);
  const f = await getFuel('TO');
  assert.equal(f.ok, true);
  assert.deepEqual(f.state.prices.map((p) => p.product), ['Gasolina comum', 'Diesel comum', 'Diesel S-10']);
  assert.equal(f.state.prices[1].average, 6);
  assert.equal(f.state.prices[2].average, 6.2);
  assert.equal(f.outdated, false);
  assert.match(f.source, /semanal/);
});

test('combustíveis: semanal bloqueado → série mensal descoberta no portal da ANP', async () => {
  const page = '<a href="https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan/2026/10-gasolina-etanol.csv">x</a><a href="https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan/2026/09-dados-abertos-precos-2026-09-gasolina-etanol.csv">y</a><a href="https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsan/2026/10-diesel-gnv.csv">z</a>';
  mock = mockFetch([['ultimas-4-semanas', () => textResponse('Forbidden', 403)], ['serie-historica-de-precos', () => textResponse(page)], ['dsan/2026/10-gasolina', () => textResponse(GAS)], ['dsan/2026/10-diesel', () => textResponse(DIESEL)]]);
  const f = await getFuel('TO');
  assert.equal(f.ok, true);
  assert.match(f.source, /série mensal/);
});

test('parseMonthlyLinks escolhe o mês mais recente de cada produto', () => {
  const html = ['2026/09-dados-abertos-precos-2026-09-diesel-gnv.csv', '2026/10-diesel-gnv.csv', '2025/precos-diesel-gnv-12.csv', '2026/10-gasolina-etanol.csv']
    .map((p) => `<a href="https://www.gov.br/anp/x/shpc/dsan/${p}">`).join('');
  const [gas, diesel] = parseMonthlyLinks(html);
  assert.match(gas, /2026\/10-gasolina/); assert.match(diesel, /2026\/10-diesel/);
});

test('combustíveis: tudo fora → "Não consegui confirmar os preços atuais" + última pesquisa rotulada', async () => {
  mock = mockFetch([['ultimas-4-semanas-gasolina', () => textResponse(GAS)], ['ultimas-4-semanas-diesel', () => textResponse(DIESEL)]]);
  await getFuel('TO'); // salva a "última pesquisa"
  mock.restore(); clearHttpCache();
  mock = mockFetch([]);
  const f = await getFuel('TO');
  assert.equal(f.ok, false);
  assert.equal(f.error, 'Não consegui confirmar os preços atuais.');
  assert.ok(f.lastKnown?.period?.to);
  const txt = news.fuelText(f);
  assert.match(txt.text, /Não consegui confirmar os preços atuais\. A última pesquisa que obtive é de/);
  assert.match(txt.text, /pode não refletir os preços atuais/);
});

test('combustíveis: pesquisa antiga é marcada como desatualizada', async () => {
  const old = dd(new Date(today.getTime() - 40 * 86400000));
  mock = mockFetch([['ultimas-4-semanas-gasolina', () => textResponse([CSV_HEADER, row('TO', 'GASOLINA', old, '6,00')].join('\n'))], ['ultimas-4-semanas-diesel', () => textResponse('x', 500)]]);
  const f = await getFuel('TO');
  assert.equal(f.outdated, true);
  assert.equal(f.partial, true);
  assert.match(news.fuelText(f).text, /Atenção: a pesquisa mais recente disponível termina em/);
});

test('notícias: uma fonte fora não derruba; matérias antigas/sem data são descartadas', async () => {
  const now = new Date().toUTCString();
  const old = new Date(Date.now() - 5 * 86400000).toUTCString();
  const rss = `<rss><channel><item><title>Fato recente importante</title><pubDate>${now}</pubDate><link>https://a.test/1</link></item><item><title>Fato antigo</title><pubDate>${old}</pubDate></item><item><title>Sem data</title></item></channel></rss>`;
  mock = mockFetch([['agenciabrasil', () => textResponse(rss)]]);
  const fe = await fetchAll();
  assert.equal(fe.okSources, 1);
  assert.ok(fe.failed.length > 5);
  assert.deepEqual(fe.items.map((i) => i.title), ['Fato recente importante']);
});

test('notícias: tudo fora → resumo informa indisponibilidade sem quebrar; Bíblia/contas seguem funcionando', async () => {
  mock = mockFetch([]);
  const r = await processInput('Notícias', { sessionId: 'n2' });
  assert.equal(r.intent, 'news.summary');
  assert.match(r.text, /Não consegui confirmar a cotação atual/);
  assert.match(r.text, /Não consegui acessar as fontes de notícias/);
  const c = await processInput('quanto é 7 vezes 8?', { sessionId: 'n2' });
  assert.equal(c.text, '7 × 8 = 56');
});
