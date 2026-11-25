// FÍSICA, MOTOR E VIAGEM — resolvedor local de problemas em linguagem natural.
// Compartilhado entre servidor e navegador (funciona offline, sem IA).
// Reconhece grandezas com unidade no texto ("80 km/h", "12 minutos", "40 litros",
// "205/55 R16"...), identifica a pergunta e aplica a fórmula correspondente.
// Mostra fórmula, substituição e resultado com unidades. Precisão: 3 algarismos
// significativos (não inventa precisão que os dados não têm).
import { formatNumber } from './math.js';

const G = 9.80665;

// unidade → [grandeza, fator para o SI]
const UNITS = [
  // aceleração (antes de velocidade)
  ['metros por segundo ao quadrado', 'accel', 1], ['m/s2', 'accel', 1], ['m/s²', 'accel', 1], ['m/s^2', 'accel', 1],
  // velocidade
  ['quilometros por hora', 'speed', 1 / 3.6], ['km por hora', 'speed', 1 / 3.6], ['km/h', 'speed', 1 / 3.6], ['kmh', 'speed', 1 / 3.6], ['kph', 'speed', 1 / 3.6],
  ['metros por segundo', 'speed', 1], ['m/s', 'speed', 1], ['milhas por hora', 'speed', 0.44704], ['mph', 'speed', 0.44704],
  // consumo (km/L)
  ['quilometros por litro', 'consumption', 1], ['km por litro', 'consumption', 1], ['km/litro', 'consumption', 1], ['km/l', 'consumption', 1], ['kml', 'consumption', 1],
  // rotação
  ['rpm', 'rpm', 1], ['giros', 'rpm', 1],
  // pressão
  ['kgf/cm2', 'pressure', 98066.5], ['kpa', 'pressure', 1e3], ['mpa', 'pressure', 1e6], ['pascal', 'pressure', 1], ['pa', 'pressure', 1], ['bar', 'pressure', 1e5], ['psi', 'pressure', 6894.757], ['atm', 'pressure', 101325],
  // área
  ['metros quadrados', 'area', 1], ['metro quadrado', 'area', 1], ['m2', 'area', 1], ['m²', 'area', 1], ['cm2', 'area', 1e-4], ['cm²', 'area', 1e-4], ['mm2', 'area', 1e-6], ['mm²', 'area', 1e-6],
  // energia
  ['kwh', 'energy', 3.6e6], ['kj', 'energy', 1e3], ['joules', 'energy', 1], ['joule', 'energy', 1], ['kcal', 'energy', 4184], ['j', 'energy', 1],
  // potência
  ['quilowatts', 'power', 1e3], ['kw', 'power', 1e3], ['watts', 'power', 1], ['watt', 'power', 1], ['cv', 'power', 735.49875], ['hp', 'power', 745.69987], ['w', 'power', 1],
  // força
  ['kgf', 'force', G], ['kn', 'force', 1e3], ['newtons', 'force', 1], ['newton', 'force', 1], ['n', 'force', 1],
  // massa
  ['toneladas', 'mass', 1000], ['tonelada', 'mass', 1000], ['quilogramas', 'mass', 1], ['quilograma', 'mass', 1], ['quilos', 'mass', 1], ['quilo', 'mass', 1], ['kg', 'mass', 1], ['gramas', 'mass', 1e-3], ['g', 'mass', 1e-3], ['t', 'mass', 1000],
  // volume
  ['litros', 'volume', 1], ['litro', 'volume', 1], ['l', 'volume', 1],
  // distância
  ['quilometros', 'distance', 1000], ['quilometro', 'distance', 1000], ['km', 'distance', 1000], ['milhas', 'distance', 1609.344], ['milha', 'distance', 1609.344],
  ['metros', 'distance', 1], ['metro', 'distance', 1], ['cm', 'distance', 0.01], ['mm', 'distance', 0.001], ['m', 'distance', 1],
  // tempo
  ['horas', 'time', 3600], ['hora', 'time', 3600], ['hrs', 'time', 3600], ['h', 'time', 3600], ['minutos', 'time', 60], ['minuto', 'time', 60], ['min', 'time', 60],
  ['segundos', 'time', 1], ['segundo', 'time', 1], ['seg', 'time', 1], ['s', 'time', 1],
];
const esc = (u) => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const UNIT_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS.map(([u]) => esc(u)).sort((a, b) => b.length - a.length).join('|')})(?![a-z0-9²])`, 'g');
const UNIT_MAP = new Map(UNITS.map(([u, dim, f]) => [u, { dim, f }]));

export function prepare(text) {
  return ` ${String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `
    .replace(/r\$\s*/g, 'reais ')
    .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\b(\d+(?:\.\d+)?) e meia hora\b/g, (m, n) => `${+n + 0.5} horas`)
    .replace(/\bmeia hora\b/g, '30 minutos')
    .replace(/\s+/g, ' ');
}

/** Extrai grandezas (SI). Tempos repetidos somam ("1 hora e 30 minutos"). */
export function extractQuantities(raw) {
  const t = prepare(raw);
  const q = { all: [] };
  // pneu "205/55 r16" → diâmetro (m); retirado antes para não virar outras grandezas
  let s = t.replace(/\b(\d{3})\s*\/\s*(\d{2})\s*(?:r|aro)\s*(\d{2})\b/g, (m, w, a, r) => { q.tire = { width: +w, aspect: +a, rim: +r, diameter: (+r * 25.4 + 2 * +w * (+a / 100)) / 1000 }; return ' '; });
  // relação de marcha / diferencial: "relacao 3,5", "marcha 0.8", "diferencial 4,1", "3,5:1"
  s = s.replace(/\b(diferencial|relacao final|final)\s*(?:de\s*)?(\d+(?:\.\d+)?)(?::1)?/g, (m, k, n) => { q.diff = +n; return ' '; });
  s = s.replace(/\b(?:relacao(?: de marcha)?|marcha)\s*(?:de\s*)?(\d+(?:\.\d+)?)(?::1)?/g, (m, n) => { q.gear = +n; return ' '; });
  // preço: "reais 6.20", "6.20 reais", "a 6.20 o litro", "litro a 6.20"
  const price = s.match(/\breais (\d+(?:\.\d+)?)\b|\b(\d+(?:\.\d+)?) reais\b|\blitro (?:a|por|custa|custando) (\d+(?:\.\d+)?)\b|\b(?:a|por) (\d+(?:\.\d+)?) (?:o|cada|por) litro\b|\b(?:gasolina|diesel|etanol|alcool|combustivel) (?:a|por) (\d+(?:\.\d+)?)\b|\bpreco (?:de |do litro de |do litro )?(\d+(?:\.\d+)?)\b/);
  if (price) { q.price = +price.slice(1).find(Boolean); s = s.replace(price[0], ' '); }
  for (const m of s.matchAll(UNIT_RE)) {
    const u = UNIT_MAP.get(m[2]);
    const value = +m[1] * u.f;
    q.all.push({ dim: u.dim, value, raw: m[0].trim(), index: m.index });
    if (u.dim === 'time') q.time = (q.time || 0) + value;
    else if (u.dim === 'distance') (q.distances ||= []).push({ value, index: m.index });
    else if (!(u.dim in q)) q[u.dim] = value;
  }
  if (q.distances) q.distance = q.distances[0].value;
  q.text = t;
  return q;
}

// ---------------------------------------------------------------- formatação
export function sig(v, n = 3) {
  if (!Number.isFinite(v)) return v;
  if (v === 0) return 0;
  return +v.toPrecision(Math.max(n, Math.min(6, Math.floor(Math.log10(Math.abs(v))) + 1)));
}
const f = (v, n = 3) => formatNumber(sig(v, n));
export function fmtTime(sec) {
  if (sec < 60) return `${f(sec)} s`;
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}
const fmtDist = (m) => (m >= 1000 ? `${f(m / 1000)} km` : `${f(m)} m`);
const fmtSpeed = (ms) => `${f(ms * 3.6)} km/h (${f(ms)} m/s)`;
const fmtForce = (n) => (Math.abs(n) >= 1e4 ? `${f(n / 1000)} kN` : `${f(n)} N`);
const fmtPressure = (p) => (p >= 1e5 ? `${f(p / 1e5)} bar (${f(p / 1000)} kPa)` : p >= 1000 ? `${f(p / 1000)} kPa (${f(p / 6894.757)} psi)` : `${f(p)} Pa`);
const fmtEnergy = (j) => (j >= 1e6 ? `${f(j / 1e6)} MJ (${f(j / 3.6e6)} kWh)` : j >= 1e3 ? `${f(j / 1e3)} kJ` : `${f(j)} J`);
const fmtPower = (w) => (w >= 1e3 ? `${f(w / 1e3)} kW (${f(w / 735.49875)} cv)` : `${f(w)} W`);
const money = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const has = (t, re) => re.test(t);
const out = (module, text, formula, extra = {}) => ({ module, text, formula, ...extra });

/**
 * Resolve o problema. Devolve { module, text, formula } ou null (não é um
 * problema de física/motor reconhecível). Quando a pergunta é reconhecida mas
 * faltam dados, devolve { module, ask } explicando o que falta.
 */
export function solvePhysics(input) {
  const q = extractQuantities(input);
  const t = q.text;
  const driving = /\b(carro|moto|caminhao|viagem|andar|ando|andei|rodar|rodo|dirig\w*|estrada|percorr\w*|chegar|chego)\b/.test(t);

  // ---------------- MOTOR: relação de marcha, pneu e rpm
  if (q.tire && q.gear && q.diff) {
    const circ = Math.PI * q.tire.diameter;
    const total = q.gear * q.diff;
    const formula = 'v[km/h] = rpm × π × D[m] × 60 / (marcha × diferencial × 1000)';
    if (q.rpm && !(q.speed && has(t, /\b(qual|quanto|que)\b.{0,15}\b(rotacao|rpm|giro)/))) {
      const v = (q.rpm * circ * 60) / (total * 1000);
      return out('MOTOR', `Pneu ${q.tire.width}/${q.tire.aspect} R${q.tire.rim}: diâmetro ≈ ${f(q.tire.diameter * 1000)} mm. Relação total = ${f(q.gear)} × ${f(q.diff)} = ${f(total)}. A ${f(q.rpm)} rpm, a velocidade é ≈ ${f(v)} km/h (sem considerar patinação nem deformação do pneu).`, formula);
    }
    if (q.speed) {
      const rpm = (q.speed * 3.6 * total * 1000) / (circ * 60);
      return out('MOTOR', `Relação total = ${f(q.gear)} × ${f(q.diff)} = ${f(total)}. A ${f(q.speed * 3.6)} km/h, com pneu ${q.tire.width}/${q.tire.aspect} R${q.tire.rim} (diâmetro ≈ ${f(q.tire.diameter * 1000)} mm), o motor gira a ≈ ${f(rpm)} rpm.`, 'rpm = v[km/h] × marcha × diferencial × 1000 / (π × D[m] × 60)');
    }
  }
  if (q.tire && has(t, /\b(diametro|circunferencia|tamanho)\b/) && !q.gear) {
    return out('MOTOR', `Pneu ${q.tire.width}/${q.tire.aspect} R${q.tire.rim}: diâmetro ≈ ${f(q.tire.diameter * 1000)} mm, circunferência ≈ ${f(Math.PI * q.tire.diameter * 1000)} mm.`, 'D = aro × 25,4 + 2 × largura × perfil/100');
  }

  // ---------------- COMBUSTÍVEL / AUTONOMIA / CUSTO
  if (q.consumption) {
    if (q.volume && has(t, /\b(autonomia|quantos (km|quilometros)|ate onde|quanto (eu )?(rodo|ando|faco|consigo))\b/)) {
      const km = q.volume * q.consumption;
      return out('MOTOR', `Autonomia = ${f(q.volume)} L × ${f(q.consumption)} km/L = ${f(km)} km.`, 'autonomia = litros × consumo (km/L)');
    }
    if (q.distance) {
      const liters = q.distance / 1000 / q.consumption;
      if (q.price) {
        return out('MOTOR', `Combustível: ${fmtDist(q.distance)} ÷ ${f(q.consumption)} km/L = ${f(liters)} L. Custo: ${f(liters)} L × ${money(q.price)} = ${money(liters * q.price)}.`, 'litros = distância / consumo; custo = litros × preço');
      }
      if (has(t, /\b(quantos litros|quanto (de )?combustivel|quanto (eu )?gasto|gasto|consumo|vou gastar|preciso)\b/)) {
        return out('MOTOR', `Para ${fmtDist(q.distance)} com ${f(q.consumption)} km/L: ${f(liters)} litros. Informe o preço do litro para eu calcular o custo.`, 'litros = distância / consumo');
      }
    }
  }
  if (q.volume && q.price && has(t, /\b(quanto|custo|custa|gasto|pago|pagar)\b/) && !q.consumption) {
    return out('MOTOR', `${f(q.volume)} L × ${money(q.price)} = ${money(q.volume * q.price)}.`, 'custo = litros × preço');
  }

  // ---------------- VELOCIDADE / DISTÂNCIA / TEMPO
  const askDist = has(t, /\b(quantos? (quilometros|km|metros)|que distancia|qual (e )?a distancia|distancia percorrida|percorr\w+|ando|andaria|anda|chego a quantos)\b/);
  const askTime = has(t, /\b(quanto tempo|em quanto tempo|quantas horas|quantos minutos|demor\w+|levo|leva|levaria|chego em)\b/);
  const askSpeed = has(t, /\b(velocidade|que velocidade|qual velocidade|a quantos km\/h|quantos km\/h)\b/);
  const mod = driving || q.speed ? 'MOTOR' : 'ENGENHARIA';
  const askAccel = has(t, /\baceleracao\b/);
  if (!askAccel && q.speed && q.time && (askDist || (!askTime && !askSpeed && !q.distance))) {
    const d = q.speed * q.time;
    return out(mod, `Distância = velocidade × tempo = ${f(q.speed * 3.6)} km/h × ${fmtTime(q.time)} = ${fmtDist(d)}.`, 'd = v × t');
  }
  if (q.distance && q.speed && (askTime || !q.time) && !askSpeed) {
    const time = q.distance / q.speed;
    return out(mod, `Tempo = distância ÷ velocidade = ${fmtDist(q.distance)} ÷ ${f(q.speed * 3.6)} km/h = ${fmtTime(time)}, mantendo velocidade constante.`, 't = d / v');
  }
  if (q.distance && q.time && (askSpeed || !q.speed) && !q.accel && !q.force) {
    const v = q.distance / q.time;
    return out(mod, `Velocidade média = distância ÷ tempo = ${fmtDist(q.distance)} ÷ ${fmtTime(q.time)} = ${fmtSpeed(v)}.`, 'v = d / t');
  }
  if (askSpeed && !q.all.length && !q.tire && /^\s*(qual|me diz|me fala|calcul\w*)?\s*(a |e a )?velocidade\s*\??\s*$/.test(t.replace(/\bjarvis\b/, '').trim())) {
    return { module: 'MOTOR', ask: 'Para calcular a velocidade, preciso da distância e do tempo. Exemplo: "qual a velocidade para 120 km em 1 hora e 30 minutos?". Também calculo distância (velocidade e tempo) e tempo de viagem (distância e velocidade).' };
  }

  // ---------------- DINÂMICA / ENERGIA
  if (has(t, /\bforca\b/)) {
    if (q.mass && q.accel) return out('ENGENHARIA', `Força = massa × aceleração = ${f(q.mass)} kg × ${f(q.accel)} m/s² = ${fmtForce(q.mass * q.accel)}.`, 'F = m × a');
    if (q.pressure && q.area) return out('ENGENHARIA', `Força = pressão × área = ${fmtPressure(q.pressure)} × ${f(q.area)} m² = ${fmtForce(q.pressure * q.area)}.`, 'F = P × A');
    if (q.mass) return out('ENGENHARIA', `Força peso = massa × g = ${f(q.mass)} kg × 9,81 m/s² = ${fmtForce(q.mass * G)}.`, 'P = m × g');
  }
  if (has(t, /\bpeso\b/) && q.mass && !q.area) return out('ENGENHARIA', `Peso = ${f(q.mass)} kg × 9,81 m/s² = ${fmtForce(q.mass * G)}.`, 'P = m × g');
  if (has(t, /\bpressao\b/) && q.area && (q.force || q.mass)) {
    const F = q.force ?? q.mass * G;
    return out('ENGENHARIA', `Pressão = força ÷ área = ${fmtForce(F)} ÷ ${f(q.area)} m² = ${fmtPressure(F / q.area)}.`, 'P = F / A');
  }
  if (has(t, /\benergia cinetica\b/) && q.mass && q.speed) {
    return out('ENGENHARIA', `Energia cinética = ½ × ${f(q.mass)} kg × (${f(q.speed)} m/s)² = ${fmtEnergy(0.5 * q.mass * q.speed ** 2)}.`, 'Ec = ½ × m × v²');
  }
  if (has(t, /\benergia potencial\b/) && q.mass && q.distance) {
    return out('ENGENHARIA', `Energia potencial = ${f(q.mass)} kg × 9,81 m/s² × ${f(q.distance)} m = ${fmtEnergy(q.mass * G * q.distance)}.`, 'Ep = m × g × h');
  }
  if (has(t, /\btrabalho\b/) && q.force && q.distance) {
    return out('ENGENHARIA', `Trabalho = força × deslocamento = ${fmtForce(q.force)} × ${f(q.distance)} m = ${fmtEnergy(q.force * q.distance)}.`, 'W = F × d');
  }
  if (has(t, /\bpotencia\b/) && !q.rpm) {
    if (q.energy && q.time) return out('ENGENHARIA', `Potência = energia ÷ tempo = ${fmtEnergy(q.energy)} ÷ ${fmtTime(q.time)} = ${fmtPower(q.energy / q.time)}.`, 'P = E / t');
    if (q.force && q.speed) return out('ENGENHARIA', `Potência = força × velocidade = ${fmtForce(q.force)} × ${f(q.speed)} m/s = ${fmtPower(q.force * q.speed)}.`, 'P = F × v');
  }
  if (has(t, /\benergia\b|\bconsumo\b|\bquanto gasta\b/) && q.power && q.time && !q.consumption) {
    return out('ENGENHARIA', `Energia = potência × tempo = ${fmtPower(q.power)} × ${fmtTime(q.time)} = ${fmtEnergy(q.power * q.time)}.`, 'E = P × t');
  }
  if (has(t, /\baceleracao\b/)) {
    if (q.force && q.mass) return out('ENGENHARIA', `Aceleração = força ÷ massa = ${fmtForce(q.force)} ÷ ${f(q.mass)} kg = ${f(q.force / q.mass)} m/s².`, 'a = F / m');
    if (q.speed && q.time) return out(mod, `Aceleração média = ${f(q.speed)} m/s ÷ ${fmtTime(q.time)} = ${f(q.speed / q.time)} m/s² (${f(q.speed / q.time / G)} g), partindo do repouso.`, 'a = Δv / Δt');
  }
  return null;
}
