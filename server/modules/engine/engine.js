// MOTOR — cálculos automotivos locais (fórmulas padrão) + base para o cérebro.
import { formatNumber } from '../engineering/math.js';

/** Potência (kW) = Torque (N·m) × rpm / 9549,3 */
export const powerFromTorque = (torqueNm, rpm) => (torqueNm * rpm) / 9549.2966;
export const torqueFromPower = (powerKw, rpm) => (powerKw * 9549.2966) / rpm;
/** Cilindrada (cm³) = π/4 × D² × curso × nº cilindros (D e curso em mm). */
export const displacementCc = (boreMm, strokeMm, cylinders) => (Math.PI / 4) * (boreMm / 10) ** 2 * (strokeMm / 10) * cylinders;
export const kmPerLiter = (km, liters) => km / liters;

function num(s) { return parseFloat(String(s).replace(',', '.')); }

/** Tenta resolver um cálculo automotivo a partir do texto normalizado. */
export function tryEngineCalc(t) {
  let m;
  // torque + rpm -> potência:  "potencia com 300 nm a 4000 rpm"
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(nm|n m|newton metro|kgfm|kgf m)\b.*?(\d{3,5})\s*rpm/))) {
    let torque = num(m[1]);
    if (/kgf/.test(m[2])) torque *= 9.80665;
    const rpm = num(m[3]);
    const kw = powerFromTorque(torque, rpm);
    return {
      text: `Com ${formatNumber(torque, 1)} N·m a ${formatNumber(rpm, 0)} rpm, a potência é ${formatNumber(kw, 1)} kW (≈ ${formatNumber(kw / 0.73549875, 1)} cv ou ${formatNumber(kw / 0.74569987, 1)} hp).`,
      formula: 'P[kW] = T[N·m] × rpm / 9549,3',
    };
  }
  // potência + rpm -> torque: "torque de 150 cv a 6000 rpm"
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(cv|hp|kw)\b.*?(\d{3,5})\s*rpm/))) {
    const p = num(m[1]);
    const kw = m[2] === 'kw' ? p : m[2] === 'cv' ? p * 0.73549875 : p * 0.74569987;
    const rpm = num(m[3]);
    const tq = torqueFromPower(kw, rpm);
    return { text: `${formatNumber(p, 1)} ${m[2]} a ${formatNumber(rpm, 0)} rpm correspondem a um torque de ${formatNumber(tq, 1)} N·m (${formatNumber(tq / 9.80665, 2)} kgf·m).`, formula: 'T[N·m] = P[kW] × 9549,3 / rpm' };
  }
  // cilindrada: "diametro 86 mm curso 86 mm 4 cilindros"
  if ((m = t.match(/diametro\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*mm.*?curso\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*mm.*?(\d{1,2})\s*cilindros?/))) {
    const cc = displacementCc(num(m[1]), num(m[2]), num(m[3]));
    return { text: `Cilindrada ≈ ${formatNumber(cc, 0)} cm³ (${formatNumber(cc / 1000, 2)} L).`, formula: 'V = π/4 × D² × curso × cilindros' };
  }
  // consumo: "rodei 420 km com 35 litros"
  if ((m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:km|quilometros).*?(\d+(?:[.,]\d+)?)\s*(?:l|litros)\b/)) && /consumo|rodei|andei|fiz|media/.test(t)) {
    const kml = kmPerLiter(num(m[1]), num(m[2]));
    return { text: `Consumo médio: ${formatNumber(kml, 2)} km/L (${formatNumber(100 / kml, 2)} L/100 km).`, formula: 'km/L = distância / litros' };
  }
  return null;
}

export const ENGINE_DISCLAIMER = 'Diagnóstico à distância é apenas uma hipótese: confirme com inspeção física por um mecânico qualificado, principalmente em freios, direção, superaquecimento, vazamentos de combustível ou cheiro de queimado.';
