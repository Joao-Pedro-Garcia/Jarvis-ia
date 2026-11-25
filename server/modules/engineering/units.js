// Conversões de unidades (fatores exatos ou normativos — SI).
const U = {
  // comprimento (m)
  length: { m: 1, metro: 1, metros: 1, km: 1000, quilometro: 1000, quilometros: 1000, cm: 0.01, centimetro: 0.01, centimetros: 0.01,
    mm: 0.001, milimetro: 0.001, milimetros: 0.001, pol: 0.0254, polegada: 0.0254, polegadas: 0.0254, pe: 0.3048, pes: 0.3048,
    jarda: 0.9144, jardas: 0.9144, milha: 1609.344, milhas: 1609.344, 'milha nautica': 1852, 'milhas nauticas': 1852 },
  // massa (kg)
  mass: { kg: 1, quilo: 1, quilos: 1, quilograma: 1, quilogramas: 1, g: 0.001, grama: 0.001, gramas: 0.001, mg: 1e-6,
    t: 1000, tonelada: 1000, toneladas: 1000, lb: 0.45359237, libra: 0.45359237, libras: 0.45359237, oz: 0.028349523125, onca: 0.028349523125, oncas: 0.028349523125 },
  // velocidade (m/s)
  speed: { 'm/s': 1, 'km/h': 1 / 3.6, kmh: 1 / 3.6, 'quilometros por hora': 1 / 3.6, mph: 0.44704, 'milhas por hora': 0.44704, no: 0.514444, nos: 0.514444 },
  // pressão (Pa)
  pressure: { pa: 1, pascal: 1, kpa: 1000, mpa: 1e6, bar: 1e5, psi: 6894.757293168, atm: 101325, atmosfera: 101325, atmosferas: 101325,
    mmhg: 133.322387415, 'kgf/cm2': 98066.5, kgfcm2: 98066.5 },
  // potência (W)
  power: { w: 1, watt: 1, watts: 1, kw: 1000, quilowatt: 1000, quilowatts: 1000, hp: 745.69987158227, cv: 735.49875, 'cavalo vapor': 735.49875, 'cavalos': 735.49875, btuh: 0.29307107 },
  // torque (N·m)
  torque: { nm: 1, 'n.m': 1, 'newton metro': 1, kgfm: 9.80665, 'kgf.m': 9.80665, mkgf: 9.80665, lbft: 1.3558179483314, 'lb.ft': 1.3558179483314, 'libra pe': 1.3558179483314 },
  // volume (m³)
  volume: { l: 0.001, litro: 0.001, litros: 0.001, ml: 1e-6, mililitro: 1e-6, mililitros: 1e-6, m3: 1, 'metro cubico': 1, 'metros cubicos': 1,
    cm3: 1e-6, cc: 1e-6, galao: 0.003785411784, galoes: 0.003785411784, gal: 0.003785411784 },
  // energia (J)
  energy: { j: 1, joule: 1, joules: 1, kj: 1000, cal: 4.184, caloria: 4.184, calorias: 4.184, kcal: 4184, kwh: 3.6e6, wh: 3600, btu: 1055.05585262 },
  // área (m²)
  area: { m2: 1, 'metro quadrado': 1, 'metros quadrados': 1, km2: 1e6, ha: 1e4, hectare: 1e4, hectares: 1e4, alqueire: 48400, alqueires: 48400, cm2: 1e-4 },
};
const TEMP = { c: 'C', celsius: 'C', 'graus celsius': 'C', f: 'F', fahrenheit: 'F', k: 'K', kelvin: 'K' };

function findUnit(token) {
  const t = token.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/²/g, '2').replace(/³/g, '3');
  if (TEMP[t]) return { dim: 'temperature', key: TEMP[t] };
  for (const [dim, table] of Object.entries(U)) if (t in table) return { dim, key: t, factor: table[t] };
  return null;
}

function convertTemp(v, from, to) {
  const c = from === 'C' ? v : from === 'F' ? ((v - 32) * 5) / 9 : v - 273.15;
  return to === 'C' ? c : to === 'F' ? (c * 9) / 5 + 32 : c + 273.15;
}

export function convert(value, fromUnit, toUnit) {
  const a = findUnit(fromUnit), b = findUnit(toUnit);
  if (!a || !b) throw new Error(`Unidade desconhecida: ${!a ? fromUnit : toUnit}`);
  if (a.dim !== b.dim) throw new Error(`Não é possível converter ${fromUnit} em ${toUnit} (grandezas diferentes)`);
  if (a.dim === 'temperature') return convertTemp(value, a.key, b.key);
  return (value * a.factor) / b.factor;
}

/** Reconhece "converter 10 km em milhas", "quanto é 100 psi em bar", "30 graus celsius em fahrenheit". */
export function tryConvert(normText) {
  const s = normText.replace(/(\d),(\d)/g, '$1.$2');
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*(?:graus\s+)?([a-z/.0-9 ]+?)\s+(?:em|para|pra|to)\s+(?:graus\s+)?([a-z/.0-9 ]+?)\s*\??$/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const from = m[2].trim(), to = m[3].trim();
  if (!findUnit(from) || !findUnit(to)) return null;
  try { return { value, from, to, result: convert(value, from, to) }; } catch (err) { return { error: err.message }; }
}
