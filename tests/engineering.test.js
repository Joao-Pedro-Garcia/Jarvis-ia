import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, tryMath, spokenToExpression } from '../server/modules/engineering/math.js';
import { convert, tryConvert } from '../server/modules/engineering/units.js';
import { tryEngineCalc, powerFromTorque } from '../server/modules/engine/engine.js';

test('avaliador matemático respeita precedência e funções', () => {
  assert.equal(evaluate('2+3*4'), 14);
  assert.equal(evaluate('(2+3)*4'), 20);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('sqrt(144)'), 12);
  assert.ok(Math.abs(evaluate('2pi') - 2 * Math.PI) < 1e-12);
  assert.throws(() => evaluate('1/0'));
  assert.throws(() => evaluate('process.exit()'));
});

test('matemática falada em português', () => {
  assert.equal(tryMath('quanto e 2 mais 3 vezes 4').value, 14);
  assert.equal(tryMath('15% de 230').value, 34.5);
  assert.equal(tryMath('raiz quadrada de 144').value, 12);
  assert.equal(tryMath('10 dividido por 4').value, 2.5);
  assert.equal(tryMath('3 elevado a 4').value, 81);
  assert.equal(tryMath('1,5 vezes 2').value, 3);
  assert.equal(tryMath('quanto e 1.000 mais 1').value, 1001);
  assert.equal(tryMath('como funciona um motor'), null);
  assert.equal(spokenToExpression('seno de 30').trim(), 'sind 30');
  assert.ok(Math.abs(tryMath('seno de 30').value - 0.5) < 1e-12);
});

test('conversões de unidades', () => {
  assert.ok(Math.abs(convert(10, 'km', 'milhas') - 6.21371) < 1e-4);
  assert.equal(convert(100, 'c', 'f'), 212);
  assert.ok(Math.abs(convert(32, 'psi', 'bar') - 2.20632) < 1e-4);
  assert.ok(Math.abs(convert(100, 'cv', 'kw') - 73.549875) < 1e-9);
  assert.throws(() => convert(1, 'kg', 'metros'));
  const r = tryConvert('30 graus celsius em fahrenheit');
  assert.equal(r.result, 86);
  assert.equal(tryConvert('10 km em milhas').from, 'km');
});

test('cálculos de motor', () => {
  assert.ok(Math.abs(powerFromTorque(300, 4000) - 125.66) < 0.01);
  assert.match(tryEngineCalc('qual a potencia com 300 nm a 4000 rpm').text, /125,7 kW/);
  assert.match(tryEngineCalc('rodei 420 km com 35 litros qual o consumo').text, /12 km\/L/);
  assert.match(tryEngineCalc('diametro de 86 mm curso de 86 mm 4 cilindros').text, /1\.998 cm³/);
});
