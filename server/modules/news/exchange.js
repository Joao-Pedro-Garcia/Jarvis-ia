// CÂMBIO — fontes GRATUITAS, sem chave, em ordem:
//   A) AwesomeAPI (cotação comercial, com variação do dia)
//   B) Banco Central do Brasil — PTAX (oficial; variação vs. boletim anterior)
//   C) Banco Central Europeu via Frankfurter (taxa de referência diária)
//   D) última cotação obtida, SEMPRE rotulada como cache (nunca como atual)
// Nunca inventa valores.
import { fetchWithTimeout, cached } from '../../core/http-client.js';
import { log } from '../../core/logger.js';
import { setHealth } from '../../core/health.js';
import { load, save } from '../../core/store.js';

const LAST_FILE = 'exchange-last';

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
  // Busca os boletins dos últimos 7 dias (fins de semana/feriados não têm boletim).
  const end = new Date();
  const start = new Date(Date.now() - 7 * 86400000);
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${code}'&@dataInicial='${mmddyyyy(start)}'&@dataFinalCotacao='${mmddyyyy(end)}'&$format=json&$orderby=dataHoraCotacao%20desc&$top=20`;
  const res = await fetchWithTimeout(url, { timeout: 10000 });
  const data = await res.json();
  const rows = (data.value || []).filter((r) => r.tipoBoletim === 'Fechamento' || r.tipoBoletim === 'Fechamento PTAX');
  const row = rows[0] || data.value?.[0];
  if (!row) throw new Error('PTAX sem dados');
  // Variação: fechamento mais recente vs. fechamento do dia útil anterior.
  const prev = rows.find((r) => r.dataHoraCotacao.slice(0, 10) < row.dataHoraCotacao.slice(0, 10));
  const value = Number(row.cotacaoVenda);
  const change = prev ? value - Number(prev.cotacaoVenda) : null;
  return {
    code, ...CURRENCIES[code], value,
    change, changePct: prev ? +((change / Number(prev.cotacaoVenda)) * 100).toFixed(2) : null,
    updatedAt: new Date(row.dataHoraCotacao.replace(' ', 'T') + '-03:00').toISOString(),
    kind: `PTAX (${row.tipoBoletim}, venda)`, source: 'Banco Central do Brasil (PTAX)',
  };
}

/** Banco Central Europeu (via api.frankfurter.app, gratuito e sem chave). */
export function parseFrankfurter(json) {
  if (json?.base !== 'BRL' || !json.rates) throw new Error('resposta inesperada');
  return Object.keys(CURRENCIES).filter((c) => json.rates[c] > 0).map((code) => ({
    code, ...CURRENCIES[code], value: +(1 / json.rates[code]).toFixed(4), change: null, changePct: null,
    updatedAt: new Date(`${json.date}T16:00:00+01:00`).toISOString(),
    kind: 'Referência diária do BCE', source: 'Banco Central Europeu (api.frankfurter.app)',
  }));
}
async function frankfurter() {
  const res = await fetchWithTimeout('https://api.frankfurter.app/latest?from=BRL&to=USD,EUR,GBP', { timeout: 8000 });
  return parseFrankfurter(await res.json());
}

function ok(rates, source, note, health) {
  setHealth('cambio', health, `${source} · ${new Date().toLocaleTimeString('pt-BR')}`);
  const out = { ok: true, rates, fetchedAt: new Date().toISOString(), ...(note ? { note } : {}) };
  save(LAST_FILE, { rates, savedAt: out.fetchedAt });
  return out;
}

export async function getExchange() {
  return cached('exchange', TTL, async () => {
    try {
      const res = await fetchWithTimeout('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL', { timeout: 8000 });
      const rates = parseAwesome(await res.json());
      if (rates.length !== 3) throw new Error('resposta incompleta');
      return ok(rates, 'AwesomeAPI', null, 'ok');
    } catch (err) {
      log.warn('noticias', `AwesomeAPI falhou (${err.message}); usando PTAX do Banco Central`);
    }
    const results = await Promise.allSettled(Object.keys(CURRENCIES).map(ptax));
    const rates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (rates.length) return ok(rates, 'PTAX do Banco Central (AwesomeAPI fora)', 'Cotação comercial indisponível; exibindo PTAX do Banco Central.', 'limited');
    try {
      const ecb = await frankfurter();
      if (ecb.length) return ok(ecb, 'BCE/Frankfurter (AwesomeAPI e PTAX fora)', 'Cotação comercial e PTAX indisponíveis; exibindo a taxa de referência diária do Banco Central Europeu.', 'limited');
    } catch (err) { log.warn('noticias', `Frankfurter falhou (${err.message})`); }
    const last = load(LAST_FILE, {});
    setHealth('cambio', 'fail', `Nenhuma fonte de câmbio respondeu${last.savedAt ? ` · último valor em cache de ${last.savedAt}` : ''}`);
    return {
      ok: false, rates: [], error: 'Não consegui confirmar a cotação atual neste momento.',
      lastKnown: last.rates?.length ? { rates: last.rates, savedAt: last.savedAt } : null,
      fetchedAt: new Date().toISOString(),
    };
  });
}
