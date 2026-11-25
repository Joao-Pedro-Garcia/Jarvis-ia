// CÂMBIO — cotação comercial (AwesomeAPI, agrega dados de mercado) com
// reserva na PTAX do Banco Central (API Olinda/BCB). Nunca inventa valores.
import { fetchWithTimeout, cached } from '../../core/http-client.js';
import { log } from '../../core/logger.js';
import { setHealth } from '../../core/health.js';

const CURRENCIES = { USD: { name: 'Dólar', flag: '🇺🇸' }, EUR: { name: 'Euro', flag: '🇪🇺' }, GBP: { name: 'Libra', flag: '🇬🇧' } };
const TTL = 60 * 1000; // 1 minuto: câmbio é muito sensível ao tempo

export function parseAwesome(json) {
  return Object.keys(CURRENCIES).map((code) => {
    const q = json[`${code}BRL`];
    if (!q) return null;
    const ts = q.timestamp ? new Date(Number(q.timestamp) * 1000) : new Date(q.create_date.replace(' ', 'T') + '-03:00');
    return {
      code, ...CURRENCIES[code],
      value: Number(q.bid), ask: Number(q.ask), high: Number(q.high), low: Number(q.low),
      changePct: Number(q.pctChange), change: Number(q.varBid),
      updatedAt: ts.toISOString(),
      kind: 'Comercial (compra)', source: 'AwesomeAPI (economia.awesomeapi.com.br)',
    };
  }).filter(Boolean);
}

function mmddyyyy(d) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('month')}-${g('day')}-${g('year')}`;
}

async function ptax(code) {
  // Busca a PTAX mais recente nos últimos 7 dias (fins de semana/feriados não têm boletim).
  const end = new Date();
  const start = new Date(Date.now() - 7 * 86400000);
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${code}'&@dataInicial='${mmddyyyy(start)}'&@dataFinalCotacao='${mmddyyyy(end)}'&$format=json&$orderby=dataHoraCotacao%20desc&$top=10`;
  const res = await fetchWithTimeout(url, { timeout: 10000 });
  const data = await res.json();
  const rows = (data.value || []).filter((r) => r.tipoBoletim === 'Fechamento' || r.tipoBoletim === 'Fechamento PTAX');
  const row = rows[0] || data.value?.[0];
  if (!row) throw new Error('PTAX sem dados');
  return {
    code, ...CURRENCIES[code], value: Number(row.cotacaoVenda), changePct: null, change: null,
    updatedAt: new Date(row.dataHoraCotacao.replace(' ', 'T') + '-03:00').toISOString(),
    kind: `PTAX (${row.tipoBoletim}, venda)`, source: 'Banco Central do Brasil (PTAX)',
  };
}

export async function getExchange() {
  return cached('exchange', TTL, async () => {
    try {
      const res = await fetchWithTimeout('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL', { timeout: 8000 });
      const rates = parseAwesome(await res.json());
      if (rates.length !== 3) throw new Error('resposta incompleta');
      setHealth('cambio', 'ok', `AwesomeAPI · ${new Date().toLocaleTimeString('pt-BR')}`);
      return { ok: true, rates, fetchedAt: new Date().toISOString() };
    } catch (err) {
      log.warn('noticias', `AwesomeAPI falhou (${err.message}); usando PTAX do Banco Central`);
      const results = await Promise.allSettled(Object.keys(CURRENCIES).map(ptax));
      const rates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      setHealth('cambio', rates.length ? 'limited' : 'fail', rates.length ? 'AwesomeAPI fora; usando PTAX do Banco Central' : 'Nenhuma fonte de câmbio respondeu');
      if (!rates.length) return { ok: false, rates: [], error: 'Não consegui confirmar a cotação atual neste momento.', fetchedAt: new Date().toISOString() };
      return { ok: true, rates, fetchedAt: new Date().toISOString(), note: 'Cotação comercial indisponível; exibindo PTAX do Banco Central.' };
    }
  });
}
