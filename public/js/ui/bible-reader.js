// Leitor da Bíblia: texto confortável, virada de página animada, gestos.
import { $, esc, fmtDate } from './dom.js';
import { openSheet, currentSheet } from './sheet.js';
import { api } from '../core/api.js';
import { bus, EVENTS } from '../core/bus.js';
import { getSettings } from '../core/settings.js';

let lastView = null;
export const getBibleView = () => lastView;

export function pageSize() {
  const override = getSettings()?.bible?.pageSizeOverride;
  if (override > 0) return override;
  const mobile = window.innerWidth <= 820;
  const avail = window.innerHeight * (mobile ? 0.5 : 0.48);
  return Math.max(4, Math.min(14, Math.floor(avail / (mobile ? 78 : 64))));
}

function bar(percent, width = 10) {
  const n = Math.round((percent / 100) * width);
  return `${'█'.repeat(n)}${'░'.repeat(width - n)}`;
}

export function renderBibleMini(v) {
  const el = $('#bible-mini');
  if (!v || !v.plan) {
    el.innerHTML = `<p class="muted">Próxima leitura começa em <b>${esc(v?.position?.label || 'Gênesis 2')}</b>. Diga “Bíblia”.</p>`;
    return;
  }
  el.innerHTML = `
    <p class="bm-title">📖 ${esc(v.plan.label)}</p>
    <div class="progress"><i style="width:${v.plan.percent}%"></i></div>
    <div class="bm-row"><span>📚 Capítulos</span><b>${v.plan.done}/${v.plan.total}</b></div>
    <div class="bm-row"><span>📍 Posição</span><b>${esc(v.plan.completedAt ? v.position.label : v.ref.label)}</b></div>
    <div class="bm-row"><span>🔥 Sequência</span><b>${v.streak} dia${v.streak === 1 ? '' : 's'}</b></div>
    <div class="bm-row"><span>📊 Bíblia toda</span><b>${String(v.overallPercent).replace('.', ',')}%</b></div>`;
}

async function act(path) {
  const v = await api.post(`/api/bible/${path}?pageSize=${pageSize()}`);
  showBible(v, path === 'next' || path === 'next-chapter' ? 'next' : path === 'prev' || path === 'prev-chapter' ? 'prev' : null);
  if (v.message && (v.completedNow || /concluíd|Voltando|Agora|Indo/.test(v.message))) bus.emit('bible:message', v.message);
  bus.emit(path.startsWith('next') ? EVENTS.PAGE_NEXT : EVENTS.PAGE_PREVIOUS, v);
  return v;
}

export const bibleActions = {
  next: () => act('next'), prev: () => act('prev'), nextChapter: () => act('next-chapter'), prevChapter: () => act('prev-chapter'), nextReading: () => act('next-reading'),
};

function renderPage(page, v) {
  if (v.error) { page.innerHTML = `<div class="err-box">${esc(v.error)}</div>`; return; }
  page.innerHTML = `
    <h3>${esc(v.ref.label)}</h3>
    <div class="page-meta">${v.mode === 'free' ? 'LEITURA LIVRE' : `PLANO ${esc(v.plan?.label || '')} · ${v.plan?.done ?? 0}/${v.plan?.total ?? 0}`} · ${esc(v.translation || '')}</div>
    ${v.verses.map((x) => `<p class="verse"><sup>${x.n}</sup>${esc(x.text)}</p>`).join('')}
    <div class="page-foot"><span>Página ${v.pageIndex + 1} de ${v.pageCount}</span><span>${v.isLastPageOfChapter ? 'fim do capítulo ›' : 'deslize ou diga “passe a página”'}</span></div>`;
}

export function showBible(v, animate = null) {
  lastView = v;
  renderBibleMini(v);
  bus.emit(EVENTS.BIBLE_OPENED, v);
  if (currentSheet() !== 'bible') {
    openSheet('bible', 'BÍBLIA', (body) => build(body, v), { onClose: () => bus.emit('bible:closed') });
    return;
  }
  update(v, animate);
}

function build(body, v) {
  body.innerHTML = `
    <div class="reader">
      <div>
        <div id="done-banner"></div>
        <div class="page-stage"><article class="page" id="bible-page" tabindex="0" aria-live="polite"></article></div>
        <div class="reader-nav">
          <button data-b="prevChapter" title="Capítulo anterior">⏮ Cap.</button>
          <button data-b="prev" title="Página anterior (←)">‹ Voltar</button>
          <button data-b="next" title="Próxima página (→)">Avançar ›</button>
          <button data-b="nextChapter" title="Próximo capítulo">Cap. ⏭</button>
        </div>
      </div>
      <aside class="reader-side" id="reader-side"></aside>
    </div>`;
  body.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => bibleActions[b.dataset.b]()));
  // Gestos (celular): deslizar para os lados vira a página.
  const page = $('#bible-page', body);
  let sx = 0, sy = 0, st = 0;
  page.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }, { passive: true });
  page.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 700) (dx < 0 ? bibleActions.next : bibleActions.prev)();
  }, { passive: true });
  update(v, null);
}

function update(v, animate) {
  const page = $('#bible-page');
  if (!page) return;
  if (animate) {
    page.classList.remove('turn-next', 'turn-prev'); void page.offsetWidth;
    page.classList.add(animate === 'next' ? 'turn-next' : 'turn-prev');
    setTimeout(() => renderPage(page, v), 200);
  } else renderPage(page, v);
  const banner = $('#done-banner');
  banner.innerHTML = v.completedNow || v.dayAlreadyDone ? `<div class="done-banner">✅ Leitura de hoje concluída. ${v.dayAlreadyDone ? '' : 'Posição salva.'} Próxima: <b>${esc(v.position.label)}</b>.
    <button class="btn small" id="adv-btn">Adiantar próxima leitura</button></div>` : '';
  $('#adv-btn')?.addEventListener('click', () => bibleActions.nextReading());
  const side = $('#reader-side');
  const p = v.plan;
  side.innerHTML = p ? `
    <h4>📖 LEITURA DE HOJE</h4>
    <p style="margin:0 0 6px;font-size:16px">${esc(p.label)}</p>
    <div class="bar-text">${bar(p.percent)} ${p.percent}%</div>
    <p class="hint">Iniciada em ${fmtDate(p.date)}${p.isOverdue ? ' · pendente' : ''}</p>
    <ul class="plan-list">${p.chapters.map((c) => `<li class="${c.completed ? 'done' : ''} ${c.current && v.mode === 'plan' ? 'current' : ''}"><span class="ck">${c.completed ? '✓' : ''}</span>${esc(c.label)}</li>`).join('')}</ul>
    <div class="stat-grid">
      <div class="stat"><b>${p.done}/${p.total}</b><span>📚 CAPÍTULOS</span></div>
      <div class="stat"><b>${v.streak}</b><span>🔥 SEQUÊNCIA</span></div>
      <div class="stat"><b>${esc(v.mode === 'plan' && !p.completedAt ? v.ref.label : v.position.label)}</b><span>📍 ${v.mode === 'plan' && !p.completedAt ? 'POSIÇÃO ATUAL' : 'PRÓXIMA LEITURA'}</span></div>
      <div class="stat"><b>${String(v.overallPercent).replace('.', ',')}%</b><span>📊 BÍBLIA TODA</span></div>
    </div>
    ${v.mode === 'free' ? '<button class="btn" id="back-plan">Voltar ao plano diário</button>' : ''}
  ` : '<p class="muted">Sem plano ativo.</p>';
  $('#back-plan')?.addEventListener('click', async () => showBible(await api.post(`/api/bible/open?pageSize=${pageSize()}`)));
}
