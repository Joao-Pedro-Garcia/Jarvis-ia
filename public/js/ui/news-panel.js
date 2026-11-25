// Painel NOTÍCIAS: cards de câmbio, combustíveis, Brasil, Mundo e Curiosidade.
import { esc, safeUrl, brl, fmtDateTime, fmtDate, relTime } from './dom.js';
import { openSheet, currentSheet } from './sheet.js';

const prevValues = {};
let lastSummary = {};

function fxCard(ex) {
  if (!ex) return '';
  if (!ex.ok) return `<section class="news-card"><h3>💰 CÂMBIO</h3><div class="err-box">${esc(ex.error || 'Não consegui confirmar a cotação atual neste momento.')}</div></section>`;
  const cells = ex.rates.map((r) => {
    const changed = prevValues[r.code] !== undefined && prevValues[r.code] !== r.value;
    prevValues[r.code] = r.value;
    const dir = r.changePct == null ? '' : r.changePct >= 0 ? `<span class="up">▲ ${brl(Math.abs(r.changePct))}%</span>` : `<span class="down">▼ ${brl(Math.abs(r.changePct))}%</span>`;
    return `<div class="fx"><span class="fx-name">${r.flag} ${esc(r.name.toUpperCase())}</span><b class="fx-val ${changed ? 'flash' : ''}">R$ ${brl(r.value)}</b>${dir}</div>`;
  }).join('');
  const r0 = ex.rates[0];
  return `<section class="news-card"><h3>💰 CÂMBIO</h3><div class="fx-row">${cells}</div>
    <p class="source-note">${esc(r0.kind)} · atualizado em ${fmtDateTime(r0.updatedAt)} · variação vs. fechamento anterior · ${esc(r0.source)}${ex.note ? `<br>${esc(ex.note)}` : ''}${ex.fromCache ? ' · (cache < 1 min)' : ''}</p></section>`;
}

function fuelCard(f) {
  if (!f) return '';
  if (!f.ok) return `<section class="news-card"><h3>⛽ COMBUSTÍVEIS</h3><div class="err-box">${esc(f.error || 'Pesquisa da ANP indisponível agora.')}</div></section>`;
  const rows = (arr) => arr.map((p) => `<tr><td>${esc(p.product)}</td><td class="v">R$ ${brl(p.average)}/L</td></tr>`).join('');
  return `<section class="news-card"><h3>⛽ COMBUSTÍVEIS</h3>
    <table class="fuel-table"><tr><th>TOCANTINS</th><th></th></tr>${rows(f.state.prices)}<tr><th>BRASIL</th><th></th></tr>${rows(f.brazil.prices)}</table>
    <p class="source-note">${esc(f.method)} · semana ${fmtDate(f.period.from)} a ${fmtDate(f.period.to)} · ${esc(f.source)}${f.partial ? ' · dados parciais' : ''}</p></section>`;
}

function storyHtml(s, i) {
  const url = safeUrl(s.link);
  return `<div class="story">
    <h4><span class="num">${i + 1}.</span>${esc(s.title)}${s.repeated ? '<span class="badge">CONTINUA EM DESTAQUE</span>' : ''}${s.developing ? '<span class="badge warn">EM DESENVOLVIMENTO</span>' : ''}</h4>
    ${s.repeated && s.update ? `<p><b>Atualização:</b> ${esc(s.update)}</p>` : s.summary ? `<p>${esc(s.summary)}</p>` : ''}
    ${s.why ? `<p class="why">Por que importa: ${esc(s.why)}</p>` : ''}
    <div class="meta">${esc(s.sources.join(' · '))} · ${s.publishedAt ? `${fmtDateTime(s.publishedAt)} (${relTime(s.publishedAt)})` : ''}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">abrir fonte</a>` : ''}</div>
  </div>`;
}

function storiesCards(st, parts) {
  if (!st) return '';
  if (st.error) return `<section class="news-card wide"><div class="err-box">${esc(st.error)}</div></section>`;
  let html = '';
  if (parts.includes('brazil')) html += `<section class="news-card"><h3>🇧🇷 BRASIL</h3>${st.brazil.length ? st.brazil.map(storyHtml).join('') : '<p class="muted">Sem notícias recentes disponíveis.</p>'}</section>`;
  if (parts.includes('world')) html += `<section class="news-card"><h3>🌎 MUNDO</h3>${st.world.length ? st.world.map(storyHtml).join('') : '<p class="muted">Sem notícias recentes disponíveis.</p>'}</section>`;
  if (parts.includes('curiosity')) html += `<section class="news-card wide"><h3>🧠 INTERESSANTE</h3>${st.curiosity ? storyHtml(st.curiosity, 0).replace('<span class="num">1.</span>', '') : '<p class="muted">Nada curioso o bastante hoje.</p>'}</section>`;
  html += `<p class="source-note" style="grid-column:1/-1">${esc(st.method || '')} Fontes acessadas: ${st.sourcesOk}/${st.sourcesTotal}${st.failedSources?.length ? ` (indisponíveis: ${esc(st.failedSources.join(', '))})` : ''} · consultado em ${fmtDateTime(st.fetchedAt)} · apenas matérias das últimas 36 h.</p>`;
  return html;
}

export function showNews(summary) {
  lastSummary = summary;
  const parts = summary.parts || ['exchange', 'fuel', 'brazil', 'world', 'curiosity'];
  const render = (body) => {
    body.innerHTML = `<div class="news-grid">${fxCard(summary.exchange)}${fuelCard(summary.fuel)}${storiesCards(summary.stories, parts)}</div>
      <p class="hint">Diga “detalhe a segunda notícia” para aprofundar. Valores e notícias nunca são exibidos sem data de atualização.</p>`;
  };
  if (currentSheet() === 'news') render(document.getElementById('sheet-body'));
  else openSheet('news', 'NOTÍCIAS', render);
}

export function showStory(story) {
  openSheet('news', 'NOTÍCIA', (body) => { body.innerHTML = `<div class="news-card wide">${storyHtml(story, 0).replace('<span class="num">1.</span>', '')}</div>`; });
}
export const getLastNews = () => lastSummary;
