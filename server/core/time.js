// Datas no fuso do usuário (padrão: Tocantins, America/Araguaina, UTC-3).
export const TZ = () => process.env.JARVIS_TIMEZONE || 'America/Araguaina';

/** Data local AAAA-MM-DD. Aceita `now` para testes. */
export function localDate(now = new Date(), tz = TZ()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function daysBetween(a, b) {
  const da = Date.UTC(...a.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const db = Date.UTC(...b.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((db - da) / 86400000);
}

export function formatDateTime(d = new Date(), tz = TZ()) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export function formatTimeSpoken(d = new Date(), tz = TZ()) {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return { h, m, text: m === 0 ? `${h} ${h === 1 ? 'hora' : 'horas'} em ponto` : `${h}h${String(m).padStart(2, '0')}` };
}

export function formatDateLong(d = new Date(), tz = TZ()) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}
