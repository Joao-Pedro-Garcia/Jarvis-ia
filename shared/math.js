// Avaliador matemático SEGURO (sem eval). Gramática recursiva descendente.
// Suporta + - * / ^ %, parênteses, funções e constantes; e português falado
// ("quanto é 2 mais 3 vezes 4", "raiz quadrada de 144", "15 por cento de 200").
const FUNCS = {
  sqrt: Math.sqrt, raiz: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, log2: Math.log2,
  exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sin: (x) => Math.sin(x), cos: (x) => Math.cos(x), tan: (x) => Math.tan(x),
  sen: (x) => Math.sin(x), asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sind: (x) => Math.sin((x * Math.PI) / 180), cosd: (x) => Math.cos((x * Math.PI) / 180), tand: (x) => Math.tan((x * Math.PI) / 180),
};
const CONSTS = { pi: Math.PI, e: Math.E, g: 9.80665 };

/** Converte linguagem falada em expressão. */
export function spokenToExpression(input) {
  let s = ` ${String(input).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} `;
  s = s.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2'); // 1.000 -> 1000
  s = s.replace(/(\d),(\d)/g, '$1.$2'); // decimal brasileiro
  const rep = [
    [/\b(quanto e|quanto da|qual e o resultado de|calcule|calcula|faca a conta|faz a conta|faca uma conta|faz uma conta|faca as contas|conta|resultado de|me diga|jarvis)\b/g, ' '],
    [/\b(\d+(?:\.\d+)?)\s*(?:%|por cento)\s*de\s*/g, '($1/100)*'],
    [/\b(\d+(?:\.\d+)?)\s*(?:%|por cento)/g, '($1/100)'],
    [/\braiz quadrada de\b/g, ' sqrt '], [/\braiz cubica de\b/g, ' cbrt '],
    [/\bseno de\b/g, ' sind '], [/\bcosseno de\b/g, ' cosd '], [/\btangente de\b/g, ' tand '],
    [/\blogaritmo natural de\b/g, ' ln '], [/\blogaritmo de\b/g, ' log '],
    [/\bao quadrado\b/g, '^2'], [/\bao cubo\b/g, '^3'],
    [/\belevado (a|ao|à)\b/g, '^'], [/\bna potencia\b/g, '^'],
    [/\bmais\b/g, '+'], [/\bmenos\b/g, '-'], [/\b(vezes|multiplicado por)\b/g, '*'], [/\s+x\s+/g, '*'],
    [/\b(dividido por|divido por|sobre)\b/g, '/'], [/\bgraus?\b/g, ''], [/\bpi\b/g, ' pi '],
    [/\babre parenteses\b/g, '('], [/\bfecha parenteses\b/g, ')'],
  ];
  for (const [re, to] of rep) s = s.replace(re, to);
  return s.replace(/[?=]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function evaluate(expr) {
  const src = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.');
  let i = 0;
  const peek = () => { while (src[i] === ' ') i++; return src[i]; };
  const fail = (m) => { throw new Error(m || `Expressão inválida perto de "${src.slice(i, i + 8)}"`); };

  function parseExpr() {
    let v = parseTerm();
    for (;;) {
      const c = peek();
      if (c === '+') { i++; v += parseTerm(); }
      else if (c === '-') { i++; v -= parseTerm(); }
      else return v;
    }
  }
  function parseTerm() {
    let v = parseUnary();
    for (;;) {
      const c = peek();
      if (c === '*') { i++; v *= parseUnary(); }
      else if (c === '/') { i++; const d = parseUnary(); if (d === 0) fail('Divisão por zero'); v /= d; }
      else if (c === '%') { i++; v %= parseUnary(); }
      else if (c === '(' || (c && /[a-z]/i.test(c))) { v *= parseUnary(); } // multiplicação implícita: 2(3) 2pi
      else return v;
    }
  }
  function parseUnary() {
    const c = peek();
    if (c === '-') { i++; return -parseUnary(); }
    if (c === '+') { i++; return parseUnary(); }
    return parsePow();
  }
  function parsePow() {
    const base = parsePrimary();
    if (peek() === '^') { i++; return base ** parseUnary(); }
    return base;
  }
  function parsePrimary() {
    const c = peek();
    if (c === '(') { i++; const v = parseExpr(); if (peek() !== ')') fail('Parêntese não fechado'); i++; return v; }
    const num = src.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/i);
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = src.slice(i).match(/^[a-z][a-z0-9]*/i);
    if (id) {
      const name = id[0].toLowerCase();
      i += id[0].length;
      if (FUNCS[name]) {
        if (peek() === '(') { i++; const v = parseExpr(); if (peek() !== ')') fail('Parêntese não fechado'); i++; return FUNCS[name](v); }
        return FUNCS[name](parseUnary());
      }
      if (name in CONSTS) return CONSTS[name];
      fail(`Símbolo desconhecido: ${name}`);
    }
    fail();
  }
  const v = parseExpr();
  if (peek() !== undefined) fail();
  if (!Number.isFinite(v)) fail('Resultado não finito');
  return v;
}

export function formatNumber(v, maxDecimals = 6) {
  if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(4).replace('.', ',');
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: maxDecimals }).format(+v.toPrecision(12));
}

/** Tenta interpretar o texto como conta. Retorna { expression, value } ou null. */
export function tryMath(text) {
  const expr = spokenToExpression(text);
  if (!/\d/.test(expr) || !/[+\-*/^%]|sqrt|cbrt|sind|cosd|tand|ln|log/.test(expr)) return null;
  if (/[a-z]{3,}/i.test(expr.replace(/sqrt|cbrt|sind|cosd|tand|log2?|ln|pi|abs|exp/g, ''))) return null;
  try { return { expression: expr, value: evaluate(expr) }; } catch { return null; }
}
