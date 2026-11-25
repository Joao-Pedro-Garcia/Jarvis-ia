// Utilidades de texto para a camada de linguagem natural.
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s,.+\-*/^%()=?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove o nome do assistente e cortesias do início ("jarvis, por favor ..."). */
export function stripWake(text, name = 'jarvis') {
  let s = normalize(text);
  const n = normalize(name);
  s = s.replace(new RegExp(`^(ei |ok |oi |ola |e ai )?${n}[,!.\\s]*`), '');
  s = s.replace(new RegExp(`[,\\s]+${n}[.!?]*$`), '');
  s = s.replace(/^(por favor|pfv|pf)[,\s]+/, '').replace(/[,\s]+(por favor|pfv|pf)[.!?]*$/, '');
  return s.replace(/[.!?]+$/, '').trim();
}

export function tokens(text) {
  return normalize(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

const STOP = new Set('a o as os um uma de da do das dos e em no na nos nas para por com que se ao aos sobre como mais isso este esta essa esse foi ser ter tem nao sim ja ou entre ate apos sem sob'.split(' '));

export function keywords(text) {
  return tokens(text).filter((t) => t.length > 2 && !STOP.has(t));
}

/** Similaridade de Jaccard entre conjuntos de palavras-chave (0..1). */
export function similarity(a, b) {
  const A = new Set(keywords(a));
  const B = new Set(keywords(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Distância de Levenshtein (para tolerar erros de transcrição). */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const NUM_WORDS = {
  zero: 0, um: 1, uma: 1, primeiro: 1, primeira: 1, dois: 2, duas: 2, segundo: 2, segunda: 2, tres: 3, terceiro: 3, terceira: 3,
  quatro: 4, quarto: 4, quarta: 4, cinco: 5, quinto: 5, quinta: 5, seis: 6, sexto: 6, sexta: 6, sete: 7, setimo: 7, setima: 7,
  oito: 8, oitavo: 8, oitava: 8, nove: 9, nono: 9, nona: 9, dez: 10, decimo: 10, decima: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50,
};

/** Converte "segunda", "3", "terceira" etc. em número. */
export function parseOrdinal(word) {
  if (word == null) return null;
  const w = normalize(word);
  if (/^\d+$/.test(w)) return Number(w);
  const m = w.match(/^(\d+)[ºª°o]?$/);
  if (m) return Number(m[1]);
  return NUM_WORDS[w] ?? null;
}

/** Converte números por extenso simples ("vinte e tres") em dígitos dentro do texto. */
export function wordsToDigits(text) {
  return text.replace(/\b(vinte|trinta|quarenta|cinquenta)( e (um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove))?\b/g, (m, tens, _x, unit) =>
    String(NUM_WORDS[tens] + (unit ? NUM_WORDS[unit] : 0)))
    .replace(/\b(zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove)\b/g, (m) => String(NUM_WORDS[m]));
}
