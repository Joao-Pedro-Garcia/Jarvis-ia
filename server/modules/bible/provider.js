// Fonte do texto bíblico.
// 1) Arquivo local data/bible/acf.json (baixado uma vez; depois funciona offline).
// 2) Se não existir, baixa de BIBLE_SOURCE_URL (padrão: Almeida Corrigida Fiel,
//    repositório público thiagobodruk/biblia) e salva.
// 3) Se o download falhar, tenta bible-api.com (tradução "almeida", domínio
//    público) capítulo a capítulo, também salvando em cache.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../../core/paths.js';
import { fetchWithTimeout } from '../../core/http-client.js';
import { log } from '../../core/logger.js';
import { bookByAbbrev, BOOKS } from './books.js';

const BIBLE_DIR = path.join(DATA_DIR, 'bible');
const FULL_FILE = path.join(BIBLE_DIR, 'acf.json');
const CHAPTER_CACHE = path.join(BIBLE_DIR, 'chapters');
export const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/thiagobodruk/biblia/master/json/acf.json';

let full = null; // { [abbrev]: string[][] }
let downloading = null;

function loadLocal() {
  if (full) return full;
  if (!fs.existsSync(FULL_FILE)) return null;
  try {
    const raw = fs.readFileSync(FULL_FILE, 'utf8').replace(/^﻿/, '');
    const arr = JSON.parse(raw);
    full = Object.fromEntries(arr.map((b) => [b.abbrev, b.chapters]));
    return full;
  } catch (err) {
    log.error('biblia', `Arquivo local da Bíblia inválido: ${err.message}`);
    return null;
  }
}

export async function downloadFull(url = process.env.BIBLE_SOURCE_URL || DEFAULT_SOURCE) {
  if (downloading) return downloading;
  downloading = (async () => {
    log.info('biblia', 'Baixando texto bíblico completo (uma única vez)…');
    const res = await fetchWithTimeout(url, { timeout: 60000 });
    const raw = (await res.text()).replace(/^﻿/, '');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 66 || !arr[0].chapters) throw new Error('Formato inesperado do arquivo da Bíblia');
    fs.mkdirSync(BIBLE_DIR, { recursive: true });
    fs.writeFileSync(FULL_FILE, raw);
    full = null;
    log.info('biblia', 'Bíblia salva localmente — disponível offline.');
    return loadLocal();
  })().finally(() => { downloading = null; });
  return downloading;
}

async function fromBibleApi(book, chapter) {
  const cacheFile = path.join(CHAPTER_CACHE, `${book}-${chapter}.json`);
  if (fs.existsSync(cacheFile)) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const b = bookByAbbrev(book);
  // bible-api.com aceita nomes em inglês; usamos o índice do livro via nomes OSIS.
  const osis = OSIS[b.index];
  const res = await fetchWithTimeout(`https://bible-api.com/${osis}+${chapter}?translation=almeida`, { timeout: 15000 });
  const data = await res.json();
  const verses = (data.verses || []).map((v) => String(v.text).replace(/\s+/g, ' ').trim());
  if (!verses.length) throw new Error('Capítulo vazio na bible-api.com');
  const out = { verses, translation: 'João Ferreira de Almeida (bible-api.com)' };
  fs.mkdirSync(CHAPTER_CACHE, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(out));
  return out;
}

const OSIS = ['genesis', 'exodus', 'leviticus', 'numbers', 'deuteronomy', 'joshua', 'judges', 'ruth', '1samuel', '2samuel', '1kings', '2kings',
  '1chronicles', '2chronicles', 'ezra', 'nehemiah', 'esther', 'job', 'psalms', 'proverbs', 'ecclesiastes', 'songofsongs', 'isaiah', 'jeremiah',
  'lamentations', 'ezekiel', 'daniel', 'hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai',
  'zechariah', 'malachi', 'matthew', 'mark', 'luke', 'john', 'acts', 'romans', '1corinthians', '2corinthians', 'galatians', 'ephesians',
  'philippians', 'colossians', '1thessalonians', '2thessalonians', '1timothy', '2timothy', 'titus', 'philemon', 'hebrews', 'james', '1peter',
  '2peter', '1john', '2john', '3john', 'jude', 'revelation'];

/** Retorna { verses: string[], translation } do capítulo. Lança erro se indisponível. */
export async function getChapter(book, chapter) {
  let data = loadLocal();
  if (!data) {
    try { data = await downloadFull(); } catch (err) {
      log.warn('biblia', `Download completo falhou (${err.message}); tentando bible-api.com`);
    }
  }
  if (data) {
    const verses = data[book]?.[chapter - 1];
    if (verses) return { verses, translation: 'Almeida Corrigida Fiel (ACF)' };
  }
  return fromBibleApi(book, chapter);
}

export function status() {
  const local = !!loadLocal();
  return { offline: local, file: local ? FULL_FILE : null, books: BOOKS.length };
}
