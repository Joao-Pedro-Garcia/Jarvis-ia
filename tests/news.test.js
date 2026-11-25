import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('news');
const { parseAwesome } = await import('../server/modules/news/exchange.js');
const { aggregateCsv } = await import('../server/modules/news/fuel.js');
const { parseFeed } = await import('../server/modules/news/feeds.js');
const news = await import('../server/modules/news/news.js');

test('câmbio: interpreta resposta real da AwesomeAPI', () => {
  // Amostra real obtida em 25/11/2026
  const json = { USDBRL: { code: 'USD', codein: 'BRL', high: '5.9566', low: '5.852', varBid: '-0.0468', pctChange: '-0.79248', bid: '5.8587', ask: '5.8592', timestamp: '1795622330', create_date: '2026-11-25 12:58:50' },
    EURBRL: { code: 'EUR', high: '6.5169', low: '6.4076', varBid: '-0.063', pctChange: '-0.973005', bid: '6.4118', ask: '6.4138', timestamp: '1795622208', create_date: '2026-11-25 12:56:48' },
    GBPBRL: { code: 'GBP', high: '7.77239', low: '7.63359', varBid: '-0.093097', pctChange: '-1.202443', bid: '7.64923', ask: '7.65315', timestamp: '1795622316', create_date: '2026-11-25 12:58:36' } };
  const rates = parseAwesome(json);
  assert.equal(rates.length, 3);
  assert.equal(rates[0].value, 5.8587);
  assert.equal(rates[0].kind, 'Comercial (compra)');
  assert.equal(rates[0].updatedAt, '2026-11-25T15:58:50.000Z');
  const out = news.exchangeText({ ok: true, rates }, 'USD');
  assert.match(out.text, /Dólar: R\$ 5,86/);
  assert.doesNotMatch(out.text, /Euro/);
  assert.match(out.speech, /5 reais e 86 centavos/);
  assert.match(out.text, /atualizado em/);
});

test('câmbio indisponível: nunca inventa', () => {
  assert.equal(news.exchangeText({ ok: false }).text, 'Não consegui confirmar a cotação atual neste momento.');
});

test('combustíveis: média por UF e Brasil, separando diesel S-10 e comum, semana mais recente', () => {
  const header = 'Regiao - Sigla;Estado - Sigla;Municipio;Revenda;CNPJ da Revenda;Nome da Rua;Numero Rua;Complemento;Bairro;Cep;Produto;Data da Coleta;Valor de Venda;Valor de Compra;Unidade de Medida;Bandeira';
  const row = (uf, prod, date, price) => `N;${uf};PALMAS;POSTO X;00.000.000/0001-00;RUA A;1;;CENTRO;77000-000;${prod};${date};${price};;R$ / litro;BRANCA`;
  const csv = [header,
    row('TO', 'GASOLINA', '17/11/2026', '6,50'), row('TO', 'GASOLINA', '18/11/2026', '6,70'),
    row('SP', 'GASOLINA', '18/11/2026', '6,00'), row('TO', 'GASOLINA ADITIVADA', '18/11/2026', '7,90'),
    row('TO', 'DIESEL S10', '18/11/2026', '6,20'), row('TO', 'DIESEL', '18/11/2026', '6,10'),
    row('TO', 'GASOLINA', '03/11/2026', '9,99'), // semana antiga: ignorada
    row('TO', 'ETANOL', '18/11/2026', '4,80'),
  ].join('\n');
  const { agg, period } = aggregateCsv(csv);
  assert.deepEqual(period, { from: '2026-11-17', to: '2026-11-18' });
  assert.equal(agg['TO|GASOLINA'].sum / agg['TO|GASOLINA'].n, 6.6);
  assert.ok(Math.abs(agg['BR|GASOLINA'].sum / agg['BR|GASOLINA'].n - 6.4) < 1e-9);
  assert.equal(agg['TO|DIESEL S10'].n, 1);
  assert.equal(agg['TO|DIESEL'].sum, 6.1);
});

test('RSS: parse de RSS 2.0 com CDATA e entidades', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Banco Central mantém juros &amp; sinaliza cortes]]></title><link>https://ex.com/a</link><pubDate>Wed, 25 Nov 2026 12:00:00 -0300</pubDate><description><![CDATA[<p>Decisão do <b>Copom</b>.</p>]]></description></item></channel></rss>`;
  const items = parseFeed(xml, { name: 'Teste', category: 'br', priority: 1 });
  assert.equal(items[0].title, 'Banco Central mantém juros & sinaliza cortes');
  assert.equal(items[0].description, 'Decisão do Copom .');
  assert.equal(items[0].publishedAt, '2026-11-25T15:00:00.000Z');
});

test('Atom: parse de entry com link href', () => {
  const xml = '<feed><entry><title>Nova sonda chega a Marte</title><link href="https://ex.com/m"/><updated>2026-11-25T10:00:00Z</updated><summary>Ciência.</summary></entry></feed>';
  const items = parseFeed(xml, { name: 'T', category: 'science' });
  assert.equal(items[0].link, 'https://ex.com/m');
});
