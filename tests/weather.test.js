// Clima (Open-Meteo simulado) + bom dia ao acordar.
import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('weather');
const realFetch = globalThis.fetch;
let meteo = 'ok';
let groq = null;
let calls = [];
const today = new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const DATA = () => ({
  current: { time: `${today}T09:00`, temperature_2m: 30.6, apparent_temperature: 33.2, relative_humidity_2m: 58, weather_code: 2, wind_speed_10m: 7.4 },
  hourly: { time: [`${today}T08:00`, `${today}T15:00`, `${today}T16:00`, `${plus(1)}T15:00`], precipitation_probability: [10, 70, 55, 90] },
  daily: {
    time: [today, plus(1), plus(2)], weather_code: [81, 61, 0],
    temperature_2m_max: [34.4, 31, 35], temperature_2m_min: [22.6, 23, 21],
    precipitation_probability_max: [70, 85, 5], precipitation_sum: [6.2, 12, 0], uv_index_max: [10.5, 8, 11],
    sunrise: [`${today}T06:01`, `${plus(1)}T06:01`, `${plus(2)}T06:02`], sunset: [`${today}T18:20`, `${plus(1)}T18:20`, `${plus(2)}T18:21`],
  },
});
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push(u);
  if (u.includes('api.open-meteo.com')) {
    if (meteo === 'fail') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(DATA()), { headers: { 'content-type': 'application/json' } });
  }
  if (u.includes('api.groq.com') && groq) return groq(u, opts);
  throw new TypeError('fetch failed');
};
after(() => { globalThis.fetch = realFetch; });

const weather = await import('../server/modules/weather/weather.js');
const { processInput } = await import('../server/brain/brain.js');
const greeting = await import('../server/brain/greeting.js');
afterEach(() => { meteo = 'ok'; groq = null; calls = []; });

test('Open-Meteo: Araguaína-TO, sem chave, fuso de Araguaína, 3 dias', async () => {
  const w = await weather.getWeather();
  assert.equal(w.ok, true);
  assert.equal(w.city, 'Araguaína-TO');
  const u = new URL(calls.find((c) => c.includes('open-meteo')));
  assert.equal(u.searchParams.get('latitude'), '-7.1911');
  assert.equal(u.searchParams.get('timezone'), 'America/Araguaina');
  assert.equal(w.now.temp, 31);
  assert.equal(w.days[0].desc, 'pancadas de chuva');
  assert.deepEqual(w.rainHours, ['15h', '16h']);
});

for (const [q, re] of [
  ['como o dia está hoje', /Agora em Araguaína-TO: 31 graus, parcialmente nublado.*\n.*Hoje: pancadas de chuva, mínima de 23 e máxima de 34 graus, 70% de chance de chuva/s],
  ['como está o tempo?', /Agora em Araguaína-TO/],
  ['qual a temperatura agora', /31 graus/],
  ['vai chover hoje?', /Sim, há boa chance de chuva hoje em Araguaína-TO: 70% de chance, principalmente por volta de 15h, 16h/],
  ['previsão para amanhã', /Amanhã em Araguaína-TO: chuva fraca, mínima de 23 e máxima de 31 graus, 85% de chance de chuva/],
  ['vai chover amanhã?', /Amanhã em Araguaína-TO/],
  ['previsão da semana', /Hoje:.*\nAmanhã:.*\n\w/],
]) {
  test(`"${q}" → clima real`, async () => {
    const r = await processInput(q, { sessionId: `w-${q}` });
    assert.match(r.intent, /^weather\./, `${q} → ${r.intent}`);
    assert.match(r.text, re);
  });
}

test('UV alto avisa protetor; "meu dia" inclui o clima', async () => {
  const r = await processInput('como está o clima', { sessionId: 'w-uv' });
  assert.match(r.text, /Índice UV muito alto — use protetor solar/);
  const d = await processInput('meu dia', { sessionId: 'w-day' });
  assert.match(d.text, /🌤 Clima em Araguaína-TO: 31 °C agora/);
});

test('sem internet e sem dados: diz que não conseguiu (não inventa)', () => {
  const t = weather.weatherText({ ok: false, error: 'fetch failed' });
  assert.match(t, /NÃO CONSEGUI CONFIRMAR O CLIMA AGORA/);
  assert.equal(weather.weatherHook({ ok: false }), '');
  const stale = weather.weatherText({ ...weather.parse(DATA()), stale: true, fetchedAt: new Date().toISOString() });
  assert.match(stale, /não consegui atualizar agora/);
});

test('bom dia ao acordar (sem IA online): saudação + frase própria + clima real + ajuda', async () => {
  const g = await greeting.wakeGreeting();
  assert.match(g.text, /^(Bom dia|Boa tarde|Boa noite)/);
  assert.match(g.text, /Lá fora, em Araguaína, faz 31 graus com parcialmente nublado; máxima de 34 e 70% de chance de chuva\./);
  assert.match(g.text, /Como posso ajudar\?$/);
  assert.equal(g.source, 'local');
  assert.ok(!/\{n\}/.test(g.text));
});

test('frases próprias não se repetem duas vezes seguidas', () => {
  for (let i = 0; i < 30; i++) assert.notEqual(greeting.localLine('manha', 'Lucas'), greeting.localLine('manha', 'Lucas'));
  assert.ok(!/\{n\}|, \?|, \./.test(greeting.localLine('tarde', '')));
});

test('com IA online (Groq): frase criativa da IA no bom dia', async () => {
  const llm = await import('../server/brain/llm.js');
  const groqMod = await import('../server/brain/ai/groq.js');
  const { save } = await import('../server/core/store.js');
  const { encrypt } = await import('../server/core/secrets.js');
  save('ai-online', { groq: { key: encrypt('gsk_teste1234567890abcdefghijKLMN'), model: 'llama-3.1-8b-instant' } });
  groq = () => new Response(JSON.stringify({ choices: [{ message: { content: '"Hoje os reatores estão em potência máxima, Lucas."' } }] }), { headers: { 'content-type': 'application/json' } });
  await llm.refresh({ force: true });
  assert.equal(llm.kind(), 'online');
  const g = await greeting.wakeGreeting();
  assert.equal(g.source, 'ia');
  assert.match(g.text, /Hoje os reatores estão em potência máxima, Lucas\. Lá fora/);
  groqMod.removeKey();
  await llm.refresh({ force: true });
});
