// NOTÍCIAS — resumo curto e atual: câmbio, combustíveis, Brasil, Mundo e
// uma curiosidade. Seleção por IA (quando configurada) restrita às matérias
// REAIS obtidas dos feeds; sem IA, usa seleção automática por relevância.
import { load, save } from '../../core/store.js';
import { similarity } from '../../core/text.js';
import { log } from '../../core/logger.js';
import { bus, EVENTS } from '../../core/events.js';
import { formatDateTime } from '../../core/time.js';
import * as llm from '../../brain/llm.js';
import { getExchange } from './exchange.js';
import { getFuel } from './fuel.js';
import { fetchAll } from './feeds.js';

const HISTORY = 'news-history';
const HISTORY_DAYS = 4;

function history() {
  const h = load(HISTORY, { shown: [] });
  const cutoff = Date.now() - HISTORY_DAYS * 86400000;
  h.shown = h.shown.filter((x) => Date.parse(x.at) >= cutoff);
  return h;
}

function remember(stories) {
  const h = history();
  for (const s of stories) h.shown.push({ title: s.title, at: new Date().toISOString() });
  if (h.shown.length > 300) h.shown = h.shown.slice(-300);
  save(HISTORY, h);
}

function seenBefore(title, h) {
  return h.shown.find((x) => similarity(x.title, title) >= 0.45);
}

/** Agrupa matérias semelhantes de fontes diferentes (mesmo fato). */
function cluster(items) {
  const clusters = [];
  for (const it of items) {
    const c = clusters.find((cl) => similarity(cl.items[0].title, it.title) >= 0.35);
    if (c) c.items.push(it); else clusters.push({ items: [it] });
  }
  for (const c of clusters) {
    const sources = new Set(c.items.map((i) => i.source));
    const newest = Math.max(...c.items.map((i) => Date.parse(i.publishedAt)));
    const bestPriority = Math.min(...c.items.map((i) => i.priority));
    const ageH = (Date.now() - newest) / 3600e3;
    c.score = sources.size * 2 + (4 - bestPriority) + Math.max(0, 3 - ageH / 8) + (c.items.some((i) => i.official) ? 0.5 : 0);
    c.lead = c.items.sort((a, b) => a.priority - b.priority || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
    c.sources = [...sources];
  }
  return clusters.sort((a, b) => b.score - a.score);
}

const SOFT = /\b(bbb|novela|horoscopo|signo|celebridade|famosa|famoso|reality|fofoca|influenciador|loteria|mega-sena|quina|lotofacil|receita de)\b/i;

function heuristicSelect(items, h) {
  const pick = (category, n) => cluster(items.filter((i) => i.category === category && !SOFT.test(i.title)))
    .slice(0, n * 3)
    .map((c) => {
      const prev = seenBefore(c.lead.title, h);
      return { title: c.lead.title, summary: c.lead.description || '', why: '', sources: c.sources, link: c.lead.link,
        publishedAt: c.lead.publishedAt, repeated: !!prev, multiSource: c.sources.length > 1 };
    })
    // notícias repetidas só voltam se forem cobertas por várias fontes (continuam em destaque)
    .filter((s) => !s.repeated || s.multiSource)
    .slice(0, n);
  const curiosity = pick('science', 1)[0] || null;
  return { brazil: pick('br', 4), world: pick('world', 4), curiosity, method: 'Seleção automática (sem IA): prioriza fatos cobertos por várias fontes, recência e fontes oficiais.' };
}

const STORY = {
  type: 'object', additionalProperties: false,
  required: ['ids', 'title', 'summary', 'why', 'repeated', 'update', 'developing'],
  properties: {
    ids: { type: 'array', items: { type: 'integer' } },
    title: { type: 'string' }, summary: { type: 'string' }, why: { type: 'string' },
    repeated: { type: 'boolean' }, update: { type: 'string' }, developing: { type: 'boolean' },
  },
};
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brazil', 'world', 'curiosity'],
  properties: {
    brazil: { type: 'array', items: STORY },
    world: { type: 'array', items: STORY },
    curiosity: { anyOf: [STORY, { type: 'null' }] },
  },
};

async function aiSelect(items, h) {
  const list = items
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 140)
    .map((it, id) => ({ id, ...it }));
  const compact = list.map((it) => `#${it.id} [${it.category}] (${it.source}, ${formatDateTime(new Date(it.publishedAt))}) ${it.title} — ${it.description.slice(0, 220)}`).join('\n');
  const prev = h.shown.slice(-60).map((x) => `- ${x.title}`).join('\n') || '(nenhuma)';
  const result = await llm.completeJSON({
    system: 'Você é o editor do módulo NOTÍCIAS do assistente JARVIS. Selecione e resuma SOMENTE a partir das matérias fornecidas, sem acrescentar fatos que não estejam nelas. Escreva em português do Brasil, frases curtas.',
    messages: [{
      role: 'user',
      content: `Matérias das últimas horas (id, categoria, fonte, data):\n${compact}\n\nJá mostradas ao usuário nos últimos dias:\n${prev}\n\nTarefa:\n- brazil: 3 a 5 fatos mais importantes do Brasil (impacto real: economia, política, segurança, tecnologia, clima, decisões, grandes eventos).\n- world: 3 a 5 fatos internacionais importantes (economia mundial, decisões de grandes governos, ciência, tecnologia, conflitos só quando relevantes, o que pode afetar o Brasil).\n- curiosity: UMA matéria curiosa/interessante que valha a pena (ciência, inovação, descoberta) — ou null.\nRegras: evite sensacionalismo e fofoca; agrupe matérias do mesmo fato em 'ids'; 'summary' com 1–3 frases; 'why' = por que importa (1 frase); se o fato já foi mostrado, marque repeated=true e escreva em 'update' apenas o que há de novo (ou deixe vazio e não inclua se nada mudou); developing=true se ainda estiver em desenvolvimento; se houver versões conflitantes entre fontes, diga isso no summary.`,
    }],
    json: SCHEMA,
    maxTokens: 4000,
    effort: 'low',
    timeoutMs: 60000,
  });
  const enrich = (s) => {
    if (!s) return null;
    const refs = s.ids.map((i) => list[i]).filter(Boolean);
    if (!refs.length) return null; // nada inventado: precisa apontar para matéria real
    return { title: s.title, summary: s.summary, why: s.why, repeated: s.repeated, update: s.update, developing: s.developing,
      sources: [...new Set(refs.map((r) => r.source))], link: refs[0].link,
      publishedAt: refs.map((r) => r.publishedAt).sort().pop() };
  };
  return {
    brazil: result.brazil.map(enrich).filter(Boolean).slice(0, 5),
    world: result.world.map(enrich).filter(Boolean).slice(0, 5),
    curiosity: enrich(result.curiosity),
    method: 'Seleção e resumo por IA a partir das matérias dos feeds (sem fatos externos).',
  };
}

let lastSummary = null;
export const getLastSummary = () => lastSummary;

/** Resumo completo — usado pelo comando "Notícias". */
export async function getSummary({ parts = ['exchange', 'fuel', 'brazil', 'world', 'curiosity'] } = {}) {
  const wantStories = parts.some((p) => ['brazil', 'world', 'curiosity'].includes(p));
  const [exchange, fuel, feeds] = await Promise.all([
    parts.includes('exchange') ? getExchange().catch((e) => ({ ok: false, error: e.message })) : null,
    parts.includes('fuel') ? getFuel('TO').catch((e) => ({ ok: false, error: e.message })) : null,
    wantStories ? fetchAll().catch((e) => ({ items: [], failed: ['todas'], error: e.message })) : null,
  ]);
  let stories = null;
  if (wantStories) {
    const h = history();
    if (!feeds.items.length) {
      stories = { brazil: [], world: [], curiosity: null, error: 'Não consegui acessar as fontes de notícias neste momento.' };
    } else {
      try {
        stories = llm.available() ? await aiSelect(feeds.items, h) : heuristicSelect(feeds.items, h);
      } catch (err) {
        log.warn('noticias', `Seleção por IA falhou (${err.message}); usando seleção automática`);
        stories = heuristicSelect(feeds.items, h);
      }
      remember([...stories.brazil, ...stories.world, ...(stories.curiosity ? [stories.curiosity] : [])]);
    }
    stories.sourcesOk = feeds.okSources; stories.sourcesTotal = feeds.totalSources; stories.failedSources = feeds.failed;
    stories.fetchedAt = feeds.fetchedAt;
  }
  const summary = { exchange, fuel, stories, parts, generatedAt: new Date().toISOString() };
  if (wantStories) lastSummary = summary;
  bus.emitEvent(EVENTS.NEWS_FETCHED, { parts });
  return summary;
}

// ---------- Texto para fala (sem URLs, natural) ----------
const brl = (v, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function spokenMoney(v) {
  const reais = Math.floor(v);
  const cents = Math.round((v - reais) * 100);
  return `${reais} ${reais === 1 ? 'real' : 'reais'}${cents ? ` e ${cents} centavos` : ''}`;
}

export function exchangeText(ex, only) {
  if (!ex?.ok) return { text: 'Não consegui confirmar a cotação atual neste momento.', speech: 'Não consegui confirmar a cotação atual neste momento.' };
  const rates = only ? ex.rates.filter((r) => r.code === only) : ex.rates;
  if (!rates.length) return { text: 'Não consegui confirmar essa cotação agora.', speech: 'Não consegui confirmar essa cotação agora.' };
  const when = formatDateTime(new Date(rates[0].updatedAt));
  const text = rates.map((r) => `${r.flag} ${r.name}: R$ ${brl(r.value)}${r.changePct != null ? ` (${r.changePct >= 0 ? '▲' : '▼'} ${brl(Math.abs(r.changePct))}%)` : ''}`).join('\n')
    + `\n${rates[0].kind} · atualizado em ${when} · ${rates[0].source}`;
  const speech = rates.map((r) => `${r.name === 'Libra' ? 'a libra' : `o ${r.name.toLowerCase()}`} está em ${spokenMoney(r.value)}${r.changePct != null && Math.abs(r.changePct) >= 0.05 ? `, ${r.changePct > 0 ? 'alta' : 'queda'} de ${brl(Math.abs(r.changePct), 1)} por cento` : ''}`).join('; ');
  return { text, speech: `${speech.charAt(0).toUpperCase()}${speech.slice(1)}. Cotação ${rates[0].kind.toLowerCase()}, atualizada às ${when.split(' ')[1]}.` };
}

export function fuelText(f, which) {
  if (!f?.ok) {
    const lk = f?.lastKnown;
    const last = lk ? ` A última pesquisa que obtive é de ${lk.period.from.split('-').reverse().join('/')} a ${lk.period.to.split('-').reverse().join('/')} (consultada em ${formatDateTime(new Date(lk.savedAt))}) — pode não refletir os preços atuais.` : '';
    return { text: `Não consegui confirmar os preços atuais.${last}`, speech: `Não consegui confirmar os preços atuais dos combustíveis.${lk ? ' Mostrei na tela a última pesquisa que obtive, com a data.' : ''}` };
  }
  const filt = (arr) => arr.filter((p) => !which || (which === 'gasolina' ? /Gasolina/.test(p.product) : /Diesel/.test(p.product)));
  const line = (p) => `${p.product}: R$ ${brl(p.average)}/L`;
  const period = `${f.period.from.split('-').reverse().join('/')} a ${f.period.to.split('-').reverse().join('/')}`;
  const text = `Tocantins\n${filt(f.state.prices).map(line).join('\n')}\n\nBrasil\n${filt(f.brazil.prices).map(line).join('\n')}\n\n${f.method}. Semana ${period}. Fonte: ${f.source}.`;
  const sp = (arr) => filt(arr).map((p) => `${p.product.toLowerCase()} a ${spokenMoney(p.average)}`).join(', ');
  const warn = f.outdated ? ` Atenção: a pesquisa mais recente disponível termina em ${f.period.to.split('-').reverse().join('/')}.` : '';
  return { text: `${text}${warn}`, speech: `No Tocantins, preço médio de ${sp(f.state.prices)}. Na média nacional, ${sp(f.brazil.prices)}. Pesquisa da ANP de ${period}.${warn}` };
}

export function storiesSpeech(st) {
  if (!st) return '';
  if (st.error) return st.error;
  const say = (arr) => arr.slice(0, 3).map((s) => (s.repeated && s.update ? `Continua em destaque: ${s.title}. ${s.update}` : `${s.title}.`)).join(' ');
  let out = '';
  if (st.brazil.length) out += ` No Brasil: ${say(st.brazil)}`;
  if (st.world.length) out += ` No mundo: ${say(st.world)}`;
  if (st.curiosity) out += ` E uma curiosidade: ${st.curiosity.title}.`;
  return out.trim();
}

/** Encontra a n-ésima notícia do último resumo ("detalhe a segunda notícia"). */
export function findStory(n, section) {
  if (!lastSummary?.stories) return null;
  const st = lastSummary.stories;
  if (section === 'curiosity') return st.curiosity;
  const arr = section === 'world' ? st.world : section === 'brazil' ? st.brazil : [...st.brazil, ...st.world];
  return arr[n - 1] || null;
}
