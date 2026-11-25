// Livros da Bíblia (cânon protestante, 66 livros), abreviações compatíveis com
// a fonte JSON (thiagobodruk/biblia) e quantidade de capítulos.
export const BOOKS = [
  ['gn', 'Gênesis', 50, ['genesis']], ['ex', 'Êxodo', 40, ['exodo']], ['lv', 'Levítico', 27, ['levitico']],
  ['nm', 'Números', 36, ['numeros']], ['dt', 'Deuteronômio', 34, ['deuteronomio']], ['js', 'Josué', 24, ['josue']],
  ['jz', 'Juízes', 21, ['juizes']], ['rt', 'Rute', 4, ['rute']], ['1sm', '1 Samuel', 31, ['1 samuel', 'primeiro samuel', 'i samuel']],
  ['2sm', '2 Samuel', 24, ['2 samuel', 'segundo samuel', 'ii samuel']], ['1rs', '1 Reis', 22, ['1 reis', 'primeiro reis', 'i reis']],
  ['2rs', '2 Reis', 25, ['2 reis', 'segundo reis', 'ii reis']], ['1cr', '1 Crônicas', 29, ['1 cronicas', 'primeiro cronicas', 'primeira cronicas']],
  ['2cr', '2 Crônicas', 36, ['2 cronicas', 'segundo cronicas', 'segunda cronicas']], ['ed', 'Esdras', 10, ['esdras']],
  ['ne', 'Neemias', 13, ['neemias']], ['et', 'Ester', 10, ['ester']], ['jó', 'Jó', 42, ['jo livro', 'livro de jo']],
  ['sl', 'Salmos', 150, ['salmos', 'salmo']], ['pv', 'Provérbios', 31, ['proverbios', 'proverbio']],
  ['ec', 'Eclesiastes', 12, ['eclesiastes']], ['ct', 'Cânticos', 8, ['canticos', 'cantares', 'cantico dos canticos']],
  ['is', 'Isaías', 66, ['isaias']], ['jr', 'Jeremias', 52, ['jeremias']], ['lm', 'Lamentações', 5, ['lamentacoes']],
  ['ez', 'Ezequiel', 48, ['ezequiel']], ['dn', 'Daniel', 12, ['daniel']], ['os', 'Oséias', 14, ['oseias']],
  ['jl', 'Joel', 3, ['joel']], ['am', 'Amós', 9, ['amos']], ['ob', 'Obadias', 1, ['obadias']], ['jn', 'Jonas', 4, ['jonas']],
  ['mq', 'Miquéias', 7, ['miqueias']], ['na', 'Naum', 3, ['naum']], ['hc', 'Habacuque', 3, ['habacuque']],
  ['sf', 'Sofonias', 3, ['sofonias']], ['ag', 'Ageu', 2, ['ageu']], ['zc', 'Zacarias', 14, ['zacarias']],
  ['ml', 'Malaquias', 4, ['malaquias']], ['mt', 'Mateus', 28, ['mateus']], ['mc', 'Marcos', 16, ['marcos']],
  ['lc', 'Lucas', 24, ['lucas']], ['jo', 'João', 21, ['joao']], ['atos', 'Atos', 28, ['atos', 'atos dos apostolos']],
  ['rm', 'Romanos', 16, ['romanos']], ['1co', '1 Coríntios', 16, ['1 corintios', 'primeira corintios', 'primeiro corintios', 'i corintios']],
  ['2co', '2 Coríntios', 13, ['2 corintios', 'segunda corintios', 'segundo corintios', 'ii corintios']],
  ['gl', 'Gálatas', 6, ['galatas']], ['ef', 'Efésios', 6, ['efesios']], ['fp', 'Filipenses', 4, ['filipenses']],
  ['cl', 'Colossenses', 4, ['colossenses']], ['1ts', '1 Tessalonicenses', 5, ['1 tessalonicenses', 'primeira tessalonicenses', 'primeiro tessalonicenses']],
  ['2ts', '2 Tessalonicenses', 3, ['2 tessalonicenses', 'segunda tessalonicenses', 'segundo tessalonicenses']],
  ['1tm', '1 Timóteo', 6, ['1 timoteo', 'primeira timoteo', 'primeiro timoteo']], ['2tm', '2 Timóteo', 4, ['2 timoteo', 'segunda timoteo', 'segundo timoteo']],
  ['tt', 'Tito', 3, ['tito']], ['fm', 'Filemom', 1, ['filemom', 'filemon']], ['hb', 'Hebreus', 13, ['hebreus']],
  ['tg', 'Tiago', 5, ['tiago']], ['1pe', '1 Pedro', 5, ['1 pedro', 'primeira pedro', 'primeiro pedro']],
  ['2pe', '2 Pedro', 3, ['2 pedro', 'segunda pedro', 'segundo pedro']], ['1jo', '1 João', 5, ['1 joao', 'primeira joao', 'primeiro joao']],
  ['2jo', '2 João', 1, ['2 joao', 'segunda joao', 'segundo joao']], ['3jo', '3 João', 1, ['3 joao', 'terceira joao', 'terceiro joao']],
  ['jd', 'Judas', 1, ['judas']], ['ap', 'Apocalipse', 22, ['apocalipse']],
].map(([abbrev, name, chapters, aliases], index) => ({ abbrev, name, chapters, aliases, index }));

export const TOTAL_CHAPTERS = BOOKS.reduce((s, b) => s + b.chapters, 0); // 1189

export function bookByAbbrev(abbrev) { return BOOKS.find((b) => b.abbrev === abbrev); }

/** Próximo capítulo em ordem canônica (Gênesis 50 → Êxodo 1). null no fim de Apocalipse. */
export function nextChapter({ book, chapter }) {
  const b = bookByAbbrev(book);
  if (chapter < b.chapters) return { book, chapter: chapter + 1 };
  const nb = BOOKS[b.index + 1];
  return nb ? { book: nb.abbrev, chapter: 1 } : null;
}

export function prevChapter({ book, chapter }) {
  const b = bookByAbbrev(book);
  if (chapter > 1) return { book, chapter: chapter - 1 };
  const pb = BOOKS[b.index - 1];
  return pb ? { book: pb.abbrev, chapter: pb.chapters } : null;
}

/** Posição absoluta (0..1188) — usada para progresso geral. */
export function absoluteIndex({ book, chapter }) {
  const b = bookByAbbrev(book);
  let n = 0;
  for (let i = 0; i < b.index; i++) n += BOOKS[i].chapters;
  return n + chapter - 1;
}

export function refLabel({ book, chapter }) { return `${bookByAbbrev(book).name} ${chapter}`; }

/** Rótulo de intervalo: "Gênesis 2–4" ou "Gênesis 50 – Êxodo 2". */
export function rangeLabel(chapters) {
  if (!chapters.length) return '';
  const a = chapters[0], z = chapters[chapters.length - 1];
  if (chapters.length === 1) return refLabel(a);
  if (a.book === z.book) return `${bookByAbbrev(a.book).name} ${a.chapter}–${z.chapter}`;
  return `${refLabel(a)} – ${refLabel(z)}`;
}

/**
 * Encontra uma referência bíblica no texto normalizado, ex.: "joao 3",
 * "salmo 23", "primeira corintios 13". Retorna { book, chapter } ou null.
 */
export function findReference(normText) {
  const candidates = [];
  for (const b of BOOKS) {
    for (const alias of b.aliases) {
      const re = new RegExp(`(?:^|\\s)${alias.replace(/ /g, '\\s+')}(?:\\s+(?:capitulo\\s+)?(\\d{1,3}))?(?=\\s|$)`);
      const m = normText.match(re);
      if (m) candidates.push({ b, alias, chapter: m[1] ? Number(m[1]) : null, pos: m.index });
    }
  }
  if (!candidates.length) return null;
  // Prefere o alias mais longo (evita "joao" casar com "1 joao") e que tenha capítulo.
  candidates.sort((x, y) => (y.chapter != null) - (x.chapter != null) || y.alias.length - x.alias.length);
  const c = candidates[0];
  // "jo" sozinho é ambíguo; só aceitamos Jó com "livro de jo".
  const chapter = Math.min(Math.max(c.chapter ?? 1, 1), c.b.chapters);
  return { book: c.b.abbrev, chapter, explicitChapter: c.chapter != null };
}
