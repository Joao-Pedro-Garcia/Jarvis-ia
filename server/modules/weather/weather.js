// CLIMA — Open-Meteo (https://open-meteo.com): gratuito, sem chave, sem cadastro.
// Cidade padrão: Araguaína-TO (troque em JARVIS_WEATHER_LAT/LON/CITY no .env).
// Regra: nunca inventar. Sem dados → diz que não conseguiu; cache antigo → avisa o horário.
import { fetchWithTimeout, cached } from '../../core/http-client.js';
import { log } from '../../core/logger.js';

export const CITY = () => ({
  name: process.env.JARVIS_WEATHER_CITY || 'Araguaína-TO',
  lat: Number(process.env.JARVIS_WEATHER_LAT || -7.1911),
  lon: Number(process.env.JARVIS_WEATHER_LON || -48.2072),
  tz: process.env.JARVIS_WEATHER_TZ || 'America/Araguaina',
});
const TTL = 15 * 60000;
const BASE = () => process.env.JARVIS_WEATHER_URL || 'https://api.open-meteo.com/v1/forecast';
let lastGood = null; // última leitura boa (para responder sem internet, com o horário)

// Códigos WMO → português
const WMO = {
  0: 'céu limpo', 1: 'poucas nuvens', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'neblina', 48: 'neblina com geada',
  51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte', 56: 'garoa congelante', 57: 'garoa congelante forte',
  61: 'chuva fraca', 63: 'chuva moderada', 65: 'chuva forte', 66: 'chuva congelante', 67: 'chuva congelante forte',
  71: 'neve fraca', 73: 'neve', 75: 'neve forte', 77: 'granizo fino',
  80: 'pancadas de chuva fracas', 81: 'pancadas de chuva', 82: 'pancadas de chuva fortes',
  85: 'pancadas de neve', 86: 'pancadas de neve fortes',
  95: 'trovoadas', 96: 'trovoadas com granizo', 99: 'trovoadas fortes com granizo',
};
export const describe = (code) => WMO[code] ?? 'tempo indefinido';
const r0 = (n) => Math.round(Number(n));

export function parse(data, city = CITY()) {
  const c = data?.current;
  const d = data?.daily;
  if (!c || !d?.time?.length) throw new Error('resposta do serviço de clima incompleta');
  const days = d.time.map((date, i) => ({
    date,
    code: d.weather_code?.[i],
    desc: describe(d.weather_code?.[i]),
    max: r0(d.temperature_2m_max?.[i]),
    min: r0(d.temperature_2m_min?.[i]),
    rainChance: d.precipitation_probability_max?.[i] ?? null,
    rainMm: d.precipitation_sum?.[i] ?? null,
    uv: d.uv_index_max?.[i] ?? null,
    sunrise: d.sunrise?.[i]?.slice(11, 16) || null,
    sunset: d.sunset?.[i]?.slice(11, 16) || null,
  }));
  // Próximas horas com mais chance de chuva (hoje)
  let rainHours = [];
  const h = data.hourly;
  if (h?.time) {
    const nowIso = c.time;
    rainHours = h.time.map((t, i) => ({ t, p: h.precipitation_probability?.[i] ?? 0 }))
      .filter((x) => x.t >= nowIso && x.t.slice(0, 10) === nowIso.slice(0, 10) && x.p >= 40)
      .map((x) => `${Number(x.t.slice(11, 13))}h`);
  }
  return {
    ok: true,
    city: city.name,
    fetchedAt: new Date().toISOString(),
    now: {
      time: c.time,
      temp: r0(c.temperature_2m),
      feels: r0(c.apparent_temperature),
      humidity: r0(c.relative_humidity_2m),
      wind: r0(c.wind_speed_10m),
      code: c.weather_code,
      desc: describe(c.weather_code),
    },
    days,
    rainHours,
  };
}

/** Clima atual + 3 dias. Nunca lança: { ok:false, error } quando não há dados. */
export async function getWeather() {
  const city = CITY();
  return cached(`weather:${city.lat},${city.lon}`, TTL, async () => {
    const q = new URLSearchParams({
      latitude: String(city.lat), longitude: String(city.lon), timezone: city.tz, forecast_days: '3',
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      hourly: 'precipitation_probability',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset',
    });
    try {
      const res = await fetchWithTimeout(`${BASE()}?${q}`, { timeout: 6000 });
      const out = parse(await res.json(), city);
      lastGood = out;
      return out;
    } catch (err) {
      log.warn('api', `Clima indisponível: ${err.message}`);
      if (lastGood) return { ...lastGood, stale: true, failed: true, error: err.message };
      return { ok: false, error: err.message, city: city.name };
    }
  });
}

/** Responde em até `ms` (o resto continua em segundo plano e entra no cache). */
export function weatherFast(ms = Number(process.env.JARVIS_DATA_BUDGET_MS || 3000)) {
  return Promise.race([
    getWeather(),
    new Promise((r) => setTimeout(() => r({ ok: false, pending: true, error: 'o serviço de clima está demorando', city: CITY().name }), ms).unref?.()),
  ]);
}
export const lastWeather = () => lastGood;

const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: CITY().tz });
const uvText = (uv) => (uv == null ? '' : uv >= 11 ? 'extremo' : uv >= 8 ? 'muito alto' : uv >= 6 ? 'alto' : uv >= 3 ? 'moderado' : 'baixo');

function dayLine(d, label) {
  const rain = d.rainChance != null ? `, ${d.rainChance}% de chance de chuva` : '';
  return `${label}: ${d.desc}, mínima de ${d.min} e máxima de ${d.max} graus${rain}.`;
}

/**
 * Texto do clima. which: 'today' (agora + hoje), 'tomorrow', 'week' (3 dias), 'rain' (vai chover?).
 */
export function weatherText(w, which = 'today') {
  if (!w?.ok) {
    return w?.pending
      ? `O serviço de clima está demorando para responder. Pergunte de novo em alguns segundos.`
      : `NÃO CONSEGUI CONFIRMAR O CLIMA AGORA. Não consegui acessar o serviço de previsão${w?.error ? ` (${w.error})` : ''}.`;
  }
  const [today, tomorrow] = w.days;
  const staleNote = w.stale ? ` (dados das ${hhmm(w.fetchedAt)}; não consegui atualizar agora)` : '';
  const now = `Agora em ${w.city}: ${w.now.temp} graus, ${w.now.desc}, sensação de ${w.now.feels}, umidade de ${w.now.humidity}%${staleNote}.`;
  if (which === 'tomorrow' && tomorrow) return dayLine(tomorrow, `Amanhã em ${w.city}`);
  if (which === 'week') return [now, ...w.days.map((d, i) => dayLine(d, i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' })))].join('\n');
  if (which === 'rain') {
    const p = today.rainChance ?? 0;
    const verdict = p >= 60 ? 'Sim, há boa chance de chuva hoje' : p >= 30 ? 'Pode chover hoje' : 'Chuva é pouco provável hoje';
    return `${verdict} em ${w.city}: ${p}% de chance${w.rainHours.length ? `, principalmente por volta de ${w.rainHours.slice(0, 4).join(', ')}` : ''}.${tomorrow ? ` Amanhã: ${tomorrow.rainChance ?? 0}%.` : ''}`;
  }
  const uv = today.uv != null && today.uv >= 6 ? ` Índice UV ${uvText(today.uv)} — use protetor solar.` : '';
  const rainHint = w.rainHours.length ? ` Possível chuva por volta de ${w.rainHours.slice(0, 3).join(', ')}.` : '';
  return `${now}\n${dayLine(today, 'Hoje')}${rainHint}${uv}`;
}

/** Uma frase curta para o bom-dia (só com dado real; senão vazio). */
export function weatherHook(w) {
  if (!w?.ok || w.stale) return '';
  const t = w.days[0];
  const rain = t.rainChance != null && t.rainChance >= 50 ? ` e ${t.rainChance}% de chance de chuva` : '';
  return `Lá fora, em ${w.city.split('-')[0]}, faz ${w.now.temp} graus com ${w.now.desc}; máxima de ${t.max}${rain}.`;
}
