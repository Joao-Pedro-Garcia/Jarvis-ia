// Interpretação de datas/horas em português para lembretes.
// "às 19h", "amanhã", "amanhã às 8 da manhã", "daqui a 20 minutos", "sexta",
// "dia 12", "hoje à noite", "meio-dia". Fuso: JARVIS_TIMEZONE.
import { TZ } from './time.js';

/** Partes da data/hora atual no fuso do usuário. */
export function zonedParts(date = new Date(), tz = TZ()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
  const g = (t) => p.find((x) => x.type === t).value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
  return { y: +g('year'), m: +g('month'), d: +g('day'), h: +g('hour'), mi: +g('minute'), wd };
}

/** Converte data/hora "de parede" no fuso para um instante UTC. */
export function zonedToDate(y, m, d, h, mi, tz = TZ()) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = zonedParts(new Date(guess), tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  return new Date(guess - (asUtc - guess));
}

const WEEKDAYS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const PERIOD_DEFAULT = { manha: 9, tarde: 15, noite: 20 };

/**
 * @returns {{ date: Date, hasTime: boolean, rest: string, label: string } | null}
 * `rest` é o texto sem a expressão de tempo.
 */
export function parseWhen(t, now = new Date(), tz = TZ()) {
  let s = ` ${t} `;
  const cur = zonedParts(now, tz);
  let y = cur.y, m = cur.m, d = cur.d, h = null, mi = 0, dayExplicit = false, matched = false;
  const take = (re, fn) => { const mm = s.match(re); if (mm) { fn(mm); s = s.replace(re, ' '); matched = true; } return !!mm; };

  // relativo: "daqui a 20 minutos", "em 2 horas", "daqui uma hora"
  if (take(/\b(?:daqui a|daqui|em|dentro de)\s+(\d+|uma?|meia)\s+(minutos?|horas?|hora)\b/, (mm) => {
    const n = mm[1] === 'meia' ? 0.5 : /^uma?$/.test(mm[1]) ? 1 : Number(mm[1]);
    const ms = /min/.test(mm[2]) ? n * 60000 : n * 3600000;
    const at = new Date(now.getTime() + ms);
    const p = zonedParts(at, tz); y = p.y; m = p.m; d = p.d; h = p.h; mi = p.mi; dayExplicit = true;
  })) return finalize();

  // dia
  if (take(/\bdepois de amanha\b/, () => { addDays(2); dayExplicit = true; })) { /* ok */ }
  else if (take(/\bamanha\b/, () => { addDays(1); dayExplicit = true; })) { /* ok */ }
  else if (take(/\bhoje\b/, () => { dayExplicit = true; })) { /* ok */ }
  else if (take(/\b(?:na |no |nessa |nesse |proxima |proximo )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:[ -]feira)?\b/, (mm) => {
    let diff = (WEEKDAYS[mm[1]] - cur.wd + 7) % 7; if (diff === 0) diff = 7; addDays(diff); dayExplicit = true;
  })) { /* ok */ }
  else take(/\bdia (\d{1,2})(?:\/(\d{1,2}))?\b/, (mm) => {
    const dd = Number(mm[1]); let mmn = mm[2] ? Number(mm[2]) : cur.m;
    if (!mm[2] && dd < cur.d) mmn += 1;
    if (mmn > 12) { mmn = 1; y += 1; }
    m = mmn; d = dd; dayExplicit = true;
  });

  // hora
  const hm = s.match(/\b(?:(?:as|a|para as|pras|pelas)\s+)?(\d{1,2})(?:[:h](\d{2}))?\s*(h|horas?|hrs?)?\s*(?:da |de )?(manha|tarde|noite|madrugada)?(?=\s|$)/g)
    ?.map((x) => x.trim()).find((x) => /^(as|a|para as|pras|pelas)\s+\d|\d\s*(h|:|horas|hrs)|\d\s+(da |de )?(manha|tarde|noite|madrugada)/.test(x));
  if (hm) {
    const mm = hm.match(/(\d{1,2})(?:[:h](\d{2}))?.*?(manha|tarde|noite|madrugada)?$/);
    h = Number(mm[1]); mi = mm[2] ? Number(mm[2]) : 0;
    if ((mm[3] === 'tarde' || mm[3] === 'noite') && h < 12) h += 12;
    if (h > 23 || mi > 59) h = null;
    else { s = s.replace(hm, ' '); matched = true; }
  }
  if (h == null) {
    take(/\bmeio[ -]dia\b/, () => { h = 12; }) || take(/\bmeia[ -]noite\b/, () => { h = 0; })
      || take(/\b(?:de|pela|a|à|hoje a) (manha|tarde|noite)\b/, (mm) => { h = PERIOD_DEFAULT[mm[1]]; });
  }

  if (!matched) return null;
  return finalize();

  function addDays(n) { const p = zonedParts(new Date(zonedToDate(y, m, d, 12, 0, tz).getTime() + n * 86400000), tz); y = p.y; m = p.m; d = p.d; }
  function finalize() {
    const hasTime = h != null;
    let date = zonedToDate(y, m, d, hasTime ? h : 9, hasTime ? mi : 0, tz);
    // "às 7h" já passou hoje e o dia não foi dito → amanhã
    if (!dayExplicit && date <= now) { addDays(1); date = zonedToDate(y, m, d, hasTime ? h : 9, mi, tz); }
    const rest = s.replace(/\s+/g, ' ').trim();
    return { date, hasTime, rest, label: formatWhen(date, now, tz, hasTime) };
  }
}

export function formatWhen(date, now = new Date(), tz = TZ(), hasTime = true) {
  const a = zonedParts(date, tz), b = zonedParts(now, tz);
  const dayDiff = Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
  const day = dayDiff === 0 ? 'hoje' : dayDiff === 1 ? 'amanhã' : dayDiff === 2 ? 'depois de amanhã'
    : new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'numeric' }).format(date);
  return hasTime ? `${day} às ${String(a.h).padStart(2, '0')}h${String(a.mi).padStart(2, '0')}` : day;
}
