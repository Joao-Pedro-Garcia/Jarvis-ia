// COMBUSTÍVEIS — Levantamento de Preços de Combustíveis da ANP (dados abertos
// oficiais, últimas 4 semanas, por posto). O JARVIS calcula a MÉDIA SIMPLES das
// coletas da semana mais recente, separando Gasolina comum, Diesel S-10 e
// Diesel comum, para o Tocantins e para o Brasil.
import { fetchWithTimeout, cached } from '../../core/http-client.js';
import { log } from '../../core/logger.js';
import { normalize } from '../../core/text.js';
import { load, save } from '../../core/store.js';
import { setHealth } from '../../core/health.js';

const BASE = 'https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/qus';
const GAS_URL = () => process.env.FUEL_GASOLINE_CSV || `${BASE}/ultimas-4-semanas-gasolina-etanol.csv`;
const DIESEL_URL = () => process.env.FUEL_DIESEL_CSV || `${BASE}/ultimas-4-semanas-diesel-gnv.csv`;
const TTL = 6 * 60 * 60 * 1000; // pesquisa é semanal
const PRODUCTS = { GASOLINA: 'Gasolina comum', DIESEL: 'Diesel comum', 'DIESEL S10': 'Diesel S-10' };

function decode(buf) {
  const utf = new TextDecoder('utf-8').decode(buf);
  return utf.includes('�') ? new TextDecoder('latin1').decode(buf) : utf;
}

function splitLine(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseDate(s) {
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Processa o CSV e acumula preços por produto/UF da semana mais recente. */
export function aggregateCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV vazio');
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = splitLine(lines[0], sep).map((h) => normalize(h));
  const col = (...names) => header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iUF = col('estado - sigla', 'estado', 'uf');
  const iProd = col('produto');
  const iDate = col('data da coleta');
  const iPrice = col('valor de venda');
  if ([iUF, iProd, iDate, iPrice].some((i) => i < 0)) throw new Error(`Colunas não reconhecidas: ${header.join(' | ')}`);
  const rows = [];
  let maxDate = '0000-00-00';
  for (let k = 1; k < lines.length; k++) {
    const c = splitLine(lines[k], sep);
    const prod = String(c[iProd] || '').trim().toUpperCase().replace(/-/g, '');
    const key = prod === 'GASOLINA' ? 'GASOLINA' : prod === 'DIESEL S10' || prod === 'DIESEL S 10' ? 'DIESEL S10' : prod === 'DIESEL' ? 'DIESEL' : null;
    if (!key) continue;
    const date = parseDate(c[iDate]);
    const price = parseFloat(String(c[iPrice]).replace(/\./g, '').replace(',', '.'));
    if (!date || !Number.isFinite(price) || price <= 0) continue;
    rows.push({ uf: String(c[iUF]).trim().toUpperCase(), key, date, price });
    if (date > maxDate) maxDate = date;
  }
  // Semana mais recente: coletas até 6 dias antes da data máxima.
  const minDate = new Date(Date.parse(maxDate) - 6 * 86400000).toISOString().slice(0, 10);
  const week = rows.filter((r) => r.date >= minDate);
  const realMin = week.reduce((m, r) => (r.date < m ? r.date : m), maxDate);
  const agg = {};
  for (const r of week) {
    for (const scope of ['BR', r.uf]) {
      const k = `${scope}|${r.key}`;
      agg[k] ??= { sum: 0, n: 0 };
      agg[k].sum += r.price; agg[k].n += 1;
    }
  }
  return { agg, period: { from: realMin, to: maxDate } };
}

function pick(agg, scope, key) {
  const a = agg[`${scope}|${key}`];
  return a ? { product: PRODUCTS[key], average: +(a.sum / a.n).toFixed(3), samples: a.n } : null;
}

const ORDER = ['GASOLINA', 'DIESEL', 'DIESEL S10'];
const OPEN_DATA_PAGE = 'https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/serie-historica-de-precos-de-combustiveis';
const LAST_FILE = 'fuel-last';
const OUTDATED_DAYS = 14;

async function fetchCsvPair(urls, label) {
  const results = await Promise.allSettled(urls.map(async (url) => {
    const res = await fetchWithTimeout(url, { timeout: 45000 });
    return aggregateCsv(decode(new Uint8Array(await res.arrayBuffer())));
  }));
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  if (!ok.length) throw new Error(`${label}: ${errors.join('; ')}`);
  return { agg: Object.assign({}, ...ok.map((o) => o.agg)), period: ok.map((o) => o.period).sort((x, y) => y.to.localeCompare(x.to))[0], partial: errors.length > 0, label };
}

/** Descobre na página de dados abertos da ANP os CSVs mensais mais recentes (fonte reserva). */
export function parseMonthlyLinks(html) {
  const links = [...html.matchAll(/href="(https:\/\/www\.gov\.br\/anp\/[^"]*\/shpc\/dsan\/(\d{4})\/[^"]*)"/g)].map((m) => ({ url: m[1], year: Number(m[2]) }));
  const latest = (kind) => links.filter((l) => l.url.includes(kind))
    .map((l) => ({ ...l, month: Number((l.url.match(/\/(\d{2})-|-(\d{2})\.csv$/) || []).slice(1).find(Boolean) || 0) }))
    .sort((x, y) => y.year - x.year || y.month - x.month)[0]?.url;
  return [latest('gasolina-etanol'), latest('diesel-gnv')].filter(Boolean);
}

async function discoverMonthly() {
  const res = await fetchWithTimeout(OPEN_DATA_PAGE, { timeout: 20000 });
  const urls = parseMonthlyLinks(await res.text());
  if (!urls.length) throw new Error('nenhum CSV mensal encontrado no portal');
  return urls;
}

function build(data, uf) {
  const prices = (scope) => ORDER.map((k) => pick(data.agg, scope, k)).filter(Boolean);
  const ageDays = Math.round((Date.now() - Date.parse(`${data.period.to}T12:00:00-03:00`)) / 86400000);
  return {
    ok: true,
    state: { uf, name: uf === 'TO' ? 'Tocantins' : uf, prices: prices(uf) },
    brazil: { prices: prices('BR') },
    period: data.period,
    method: 'Preço médio (média simples das coletas do período mais recente da pesquisa)',
    source: `ANP — Levantamento de Preços de Combustíveis (${data.label})`,
    partial: data.partial,
    outdated: ageDays > OUTDATED_DAYS,
    ageDays,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Preços médios. Fontes, em ordem: (1) pesquisa semanal da ANP, (2) série
 * mensal da ANP (descoberta na página de dados abertos). Se nada responder,
 * NÃO apresenta dado antigo como atual: devolve ok:false e, separadamente,
 * a última pesquisa obtida (`lastKnown`) com período e data da consulta.
 */
export async function getFuel(uf = 'TO') {
  return cached(`fuel-${uf}`, TTL, async () => {
    const attempts = [
      () => fetchCsvPair([GAS_URL(), DIESEL_URL()], 'semanal, últimas 4 semanas'),
      async () => fetchCsvPair(await discoverMonthly(), 'série mensal'),
    ];
    const errors = [];
    for (const attempt of attempts) {
      try {
        const out = build(await attempt(), uf);
        save(LAST_FILE, { ...out, savedAt: new Date().toISOString() });
        setHealth('combustiveis', out.outdated || out.partial || /mensal/.test(out.source) ? 'limited' : 'ok', `${out.source} · até ${out.period.to}`);
        if (out.outdated) log.warn('noticias', `ANP: pesquisa mais recente obtida termina em ${out.period.to}`);
        return out;
      } catch (err) { errors.push(err.message); log.warn('noticias', `Combustíveis: ${err.message}`); }
    }
    setHealth('combustiveis', 'fail', `Nenhuma fonte da ANP respondeu: ${errors.join(' | ')}`);
    const last = load(LAST_FILE, {});
    return {
      ok: false,
      error: 'Não consegui confirmar os preços atuais.',
      reasons: errors,
      lastKnown: last.ok ? { period: last.period, savedAt: last.savedAt, state: last.state, brazil: last.brazil, source: last.source } : null,
      fetchedAt: new Date().toISOString(),
    };
  });
}
