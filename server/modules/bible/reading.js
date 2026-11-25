// Plano de leitura com CONTINUIDADE.
// - Posição inicial: Gênesis 2. Cada dia: 3 capítulos (configurável).
// - "Bíblia" retoma a leitura do dia; se o dia anterior não foi concluído,
//   continua nele (nunca pula sozinho para o próximo trecho).
// - Páginas: o capítulo é dividido em páginas de N versículos (N vem da tela
//   do cliente). A posição salva é o versículo, então funciona em celular e PC.
import { load, save } from '../../core/store.js';
import { localDate, daysBetween } from '../../core/time.js';
import { bus, EVENTS } from '../../core/events.js';
import { log } from '../../core/logger.js';
import { getChapter } from './provider.js';
import { nextChapter, prevChapter, refLabel, rangeLabel, absoluteIndex, TOTAL_CHAPTERS, bookByAbbrev } from './books.js';

const STORE = 'bible-state';
export const DEFAULT_STATE = {
  position: { book: 'gn', chapter: 2 },
  chaptersPerDay: 3,
  plan: null,
  reader: { mode: 'plan', free: null },
  history: [],
  streak: 0,
  lastCompletedDate: null,
  totalChaptersRead: 0,
};

const state = () => load(STORE, DEFAULT_STATE);
const persist = (s) => save(STORE, s);

function buildPlan(start, count, date) {
  const chapters = [];
  let cur = start;
  for (let i = 0; i < count && cur; i++) { chapters.push(cur); cur = nextChapter(cur); }
  return { date, chapters, completed: chapters.map(() => false), current: 0, verse: 0, completedAt: null, label: rangeLabel(chapters) };
}

function clampPageSize(n) { return Math.max(3, Math.min(Number(n) || 8, 60)); }

/** Gera a visão (o que a interface mostra) a partir do estado. */
async function view(s, pageSize, extra = {}) {
  pageSize = clampPageSize(pageSize);
  const plan = s.plan;
  let ref, verse;
  if (s.reader.mode === 'free' && s.reader.free) {
    ref = { book: s.reader.free.book, chapter: s.reader.free.chapter }; verse = s.reader.free.verse;
  } else if (plan) {
    ref = plan.chapters[plan.current]; verse = plan.verse;
  } else {
    ref = s.position; verse = 0;
  }
  let chapterData = null, error = null;
  try { chapterData = await getChapter(ref.book, ref.chapter); } catch (err) {
    error = `Não consegui carregar o texto de ${refLabel(ref)} (${err.message}). Verifique a internet na primeira utilização; depois o texto fica salvo offline.`;
    log.error('biblia', error);
  }
  const total = chapterData?.verses.length ?? 0;
  if (total && verse >= total) verse = Math.floor((total - 1) / pageSize) * pageSize;
  const pageIndex = Math.floor(verse / pageSize);
  const pageCount = total ? Math.ceil(total / pageSize) : 0;
  const verses = chapterData ? chapterData.verses.slice(verse, verse + pageSize).map((t, i) => ({ n: verse + i + 1, text: t })) : [];
  const done = plan ? plan.completed.filter(Boolean).length : 0;
  return {
    mode: s.reader.mode,
    ref: { ...ref, label: refLabel(ref), bookName: bookByAbbrev(ref.book).name },
    translation: chapterData?.translation ?? null,
    verses, pageIndex, pageCount, totalVerses: total, pageSize,
    isLastPageOfChapter: pageIndex >= pageCount - 1,
    plan: plan && {
      date: plan.date, label: plan.label,
      chapters: plan.chapters.map((c, i) => ({ ...c, label: refLabel(c), completed: plan.completed[i], current: i === plan.current })),
      done, total: plan.chapters.length, percent: Math.round((done / plan.chapters.length) * 100),
      completedAt: plan.completedAt, isToday: plan.date === localDate(), isOverdue: !plan.completedAt && plan.date < localDate(),
    },
    position: { ...s.position, label: refLabel(s.position) },
    streak: currentStreak(s),
    totalChaptersRead: s.totalChaptersRead,
    overallPercent: +((absoluteIndex(s.position) / TOTAL_CHAPTERS) * 100).toFixed(1),
    history: s.history.slice(-7).reverse(),
    error,
    ...extra,
  };
}

/** Sequência atual: zera se passou mais de um dia sem concluir. */
function currentStreak(s, today = localDate()) {
  if (!s.lastCompletedDate) return 0;
  return daysBetween(s.lastCompletedDate, today) <= 1 ? s.streak : 0;
}

function completePlan(s, today = localDate()) {
  const plan = s.plan;
  plan.completed = plan.completed.map(() => true);
  plan.completedAt = new Date().toISOString();
  const last = plan.chapters[plan.chapters.length - 1];
  s.position = nextChapter(last) || { book: 'gn', chapter: 1 };
  if (s.lastCompletedDate === today) { /* mesma data: mantém sequência */ }
  else if (s.lastCompletedDate && daysBetween(s.lastCompletedDate, today) === 1) s.streak += 1;
  else s.streak = 1;
  s.lastCompletedDate = today;
  s.totalChaptersRead += plan.chapters.length;
  s.history.push({ date: plan.date, label: plan.label, completedAt: plan.completedAt });
  if (s.history.length > 400) s.history.shift();
  bus.emitEvent(EVENTS.BIBLE_DAY_COMPLETED, { label: plan.label });
  log.info('biblia', `Leitura concluída: ${plan.label}. Próxima posição: ${refLabel(s.position)}`);
}

/** Comando "Bíblia" / "continuar leitura". */
export async function openDaily(pageSize, today = localDate()) {
  const s = state();
  s.reader = { mode: 'plan', free: null };
  let message;
  if (s.plan && !s.plan.completedAt) {
    message = s.plan.date === today
      ? `Continuando sua leitura de hoje: ${s.plan.label}. Você está em ${refLabel(s.plan.chapters[s.plan.current])}.`
      : `Você ainda não concluiu a leitura iniciada em ${s.plan.date.split('-').reverse().join('/')}: ${s.plan.label}. Vamos continuar de ${refLabel(s.plan.chapters[s.plan.current])}.`;
  } else if (s.plan && s.plan.completedAt && s.plan.date === today) {
    persist(s);
    return view(s, pageSize, {
      message: `A leitura de hoje (${s.plan.label}) já foi concluída. Se quiser adiantar, diga "próxima leitura". Amanhã começamos em ${refLabel(s.position)}.`,
      dayAlreadyDone: true,
    });
  } else {
    s.plan = buildPlan(s.position, s.chaptersPerDay, today);
    message = `Leitura de hoje: ${s.plan.label}. Começando em ${refLabel(s.plan.chapters[0])}.`;
  }
  persist(s);
  bus.emitEvent(EVENTS.BIBLE_OPENED, { ref: s.plan.chapters[s.plan.current] });
  return view(s, pageSize, { message });
}

/** Adianta a próxima leitura sob pedido explícito do usuário. */
export async function startNextReading(pageSize, today = localDate()) {
  const s = state();
  if (s.plan && !s.plan.completedAt) {
    return view(s, pageSize, { message: `A leitura atual (${s.plan.label}) ainda não foi concluída. Termine-a ou diga "concluir leitura".` });
  }
  s.plan = buildPlan(s.position, s.chaptersPerDay, today);
  s.reader = { mode: 'plan', free: null };
  persist(s);
  return view(s, pageSize, { message: `Próxima leitura: ${s.plan.label}.` });
}

async function chapterLength(ref) {
  try { return (await getChapter(ref.book, ref.chapter)).verses.length; } catch { return 0; }
}

/** Avança/volta uma página. Mantém capítulo e progresso corretos. */
export async function turnPage(direction, pageSize, today = localDate()) {
  pageSize = clampPageSize(pageSize);
  const s = state();
  if (s.reader.mode === 'free' && s.reader.free) return turnFree(s, direction, pageSize);
  if (!s.plan) return openDaily(pageSize);
  const plan = s.plan;
  let message = null, completedNow = false;
  const ref = plan.chapters[plan.current];
  const total = await chapterLength(ref);
  if (!total) return view(s, pageSize);
  if (plan.verse >= total) plan.verse = Math.floor((total - 1) / pageSize) * pageSize;
  if (direction === 'next') {
    bus.emitEvent(EVENTS.PAGE_NEXT, { ref });
    if (plan.verse + pageSize < total) plan.verse += pageSize;
    else {
      plan.completed[plan.current] = true;
      if (plan.current < plan.chapters.length - 1) {
        plan.current += 1; plan.verse = 0;
        message = `${refLabel(ref)} concluído. Agora, ${refLabel(plan.chapters[plan.current])}.`;
      } else if (!plan.completedAt) {
        completePlan(s, today); completedNow = true;
        message = `Leitura de hoje concluída: ${plan.label}. Progresso salvo. Próxima leitura começa em ${refLabel(s.position)}.`;
      } else {
        message = `Esta leitura já foi concluída. Diga "próxima leitura" para adiantar.`;
      }
    }
  } else {
    bus.emitEvent(EVENTS.PAGE_PREVIOUS, { ref });
    if (plan.verse > 0) plan.verse = Math.max(0, plan.verse - pageSize);
    else if (plan.current > 0) {
      plan.current -= 1;
      const prevTotal = await chapterLength(plan.chapters[plan.current]);
      plan.verse = prevTotal ? Math.floor((prevTotal - 1) / pageSize) * pageSize : 0;
      message = `Voltando para ${refLabel(plan.chapters[plan.current])}.`;
    } else message = 'Você já está no início da leitura de hoje.';
  }
  persist(s);
  return view(s, pageSize, { message, completedNow });
}

async function turnFree(s, direction, pageSize) {
  const f = s.reader.free;
  const total = await chapterLength(f);
  let message = null;
  if (direction === 'next') {
    if (f.verse + pageSize < total) f.verse += pageSize;
    else { const n = nextChapter(f); if (n) { Object.assign(f, n, { verse: 0 }); message = refLabel(n); } else message = 'Fim do livro de Apocalipse.'; }
  } else if (f.verse > 0) f.verse = Math.max(0, f.verse - pageSize);
  else { const p = prevChapter(f); if (p) { const t = await chapterLength(p); Object.assign(f, p, { verse: t ? Math.floor((t - 1) / pageSize) * pageSize : 0 }); message = refLabel(p); } }
  persist(s);
  return view(s, pageSize, { message });
}

/** Próximo/anterior capítulo dentro da leitura. */
export async function changeChapter(direction, pageSize, today = localDate()) {
  const s = state();
  if (s.reader.mode === 'free' && s.reader.free) {
    const target = direction === 'next' ? nextChapter(s.reader.free) : prevChapter(s.reader.free);
    if (target) s.reader.free = { ...target, verse: 0 };
    persist(s);
    return view(s, pageSize, { message: target ? refLabel(target) : 'Não há capítulo nessa direção.' });
  }
  if (!s.plan) return openDaily(pageSize);
  const plan = s.plan;
  let message, completedNow = false;
  if (direction === 'next') {
    plan.completed[plan.current] = true;
    if (plan.current < plan.chapters.length - 1) { plan.current += 1; plan.verse = 0; message = `Indo para ${refLabel(plan.chapters[plan.current])}.`; }
    else if (!plan.completedAt) { completePlan(s, today); completedNow = true; message = `Leitura de hoje concluída: ${plan.label}. Progresso salvo.`; }
    else message = 'Esta leitura já foi concluída. Diga "próxima leitura" para adiantar.';
  } else if (plan.current > 0) { plan.current -= 1; plan.verse = 0; message = `Voltando para ${refLabel(plan.chapters[plan.current])}.`; }
  else message = `Este é o primeiro capítulo da leitura de hoje (${refLabel(plan.chapters[0])}).`;
  persist(s);
  return view(s, pageSize, { message, completedNow });
}

/** Marca a leitura inteira como concluída (pedido explícito). */
export async function completeToday(pageSize, today = localDate()) {
  const s = state();
  if (!s.plan || s.plan.completedAt) return view(s, pageSize, { message: 'Não há leitura pendente para concluir.' });
  completePlan(s, today);
  persist(s);
  return view(s, pageSize, { message: `Leitura concluída: ${s.plan.label}. Próxima começa em ${refLabel(s.position)}.`, completedNow: true });
}

/** Abre uma referência livre (ex.: "abra João 3") sem mexer no plano. */
export async function openReference(ref, pageSize) {
  const s = state();
  s.reader = { mode: 'free', free: { book: ref.book, chapter: ref.chapter, verse: 0 } };
  persist(s);
  bus.emitEvent(EVENTS.BIBLE_OPENED, { ref, free: true });
  return view(s, pageSize, { message: `Abrindo ${refLabel(ref)}. (Leitura livre — seu plano diário continua salvo.)` });
}

export async function current(pageSize) { return view(state(), pageSize); }

export function whereAmI() {
  const s = state();
  if (s.reader.mode === 'free' && s.reader.free) {
    return `Você está lendo ${refLabel(s.reader.free)} em leitura livre. No plano diário, ${s.plan && !s.plan.completedAt ? `a leitura pendente é ${s.plan.label}, em ${refLabel(s.plan.chapters[s.plan.current])}` : `a próxima leitura começa em ${refLabel(s.position)}`}.`;
  }
  if (s.plan && !s.plan.completedAt) {
    const done = s.plan.completed.filter(Boolean).length;
    return `Você está em ${refLabel(s.plan.chapters[s.plan.current])}, na leitura ${s.plan.label}. ${done} de ${s.plan.chapters.length} capítulos concluídos.`;
  }
  if (s.plan?.completedAt) return `Sua última leitura concluída foi ${s.plan.label}. A próxima começa em ${refLabel(s.position)}.`;
  return `Você ainda não começou. A primeira leitura será ${rangeLabel(buildPlan(s.position, s.chaptersPerDay, localDate()).chapters)}.`;
}

export function getSettings() { const s = state(); return { chaptersPerDay: s.chaptersPerDay, position: s.position }; }

export function updateSettings({ chaptersPerDay, position }) {
  const s = state();
  if (chaptersPerDay) s.chaptersPerDay = Math.max(1, Math.min(20, Number(chaptersPerDay)));
  if (position && bookByAbbrev(position.book)) {
    const b = bookByAbbrev(position.book);
    s.position = { book: b.abbrev, chapter: Math.max(1, Math.min(b.chapters, Number(position.chapter) || 1)) };
    if (s.plan && !s.plan.completedAt) s.plan = null; // plano pendente é descartado ao redefinir posição
  }
  persist(s);
  return getSettings();
}

export function plainState() { return state(); }
