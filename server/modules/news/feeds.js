// Leitura de feeds RSS/Atom/RDF de veículos jornalísticos reconhecidos e
// órgãos oficiais (lista em config/news-sources.json).
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR } from '../../core/paths.js';
import { fetchWithTimeout, cached } from '../../core/http-client.js';
import { log } from '../../core/logger.js';
import { setHealth } from '../../core/health.js';
import { load, save } from '../../core/store.js';

const CACHE_FILE = 'news-cache';
/** Últimas matérias obtidas (para mostrar, ROTULADAS como cache, quando as fontes falham). */
export const lastSaved = () => load(CACHE_FILE, { items: [], fetchedAt: null });

const TTL = 10 * 60 * 1000; // 10 minutos
export const MAX_AGE_HOURS = 36;

export function sources() {
  return JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'news-sources.json'), 'utf8')).feeds;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

export function stripHtml(s) {
  return decodeEntities(decodeEntities(s)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1] : '';
}

/** Parser tolerante para RSS 2.0, RSS 1.0 (RDF) e Atom. */
export function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, 'title'));
    let link = stripHtml(tag(b, 'link'));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); if (m) link = m[1]; }
    const dateRaw = stripHtml(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'));
    const date = dateRaw ? new Date(dateRaw) : null;
    const description = stripHtml(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 600);
    if (!title) continue;
    items.push({
      title, link, description,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      source: source.name, category: source.category, priority: source.priority ?? 2, official: !!source.official,
    });
  }
  return items;
}

/**
 * Decodifica o feed respeitando o charset (cabeçalho HTTP ou <?xml encoding?>).
 * Feeds em ISO-8859-1 lidos como UTF-8 viravam "esfor�o".
 */
export function decodeFeed(bytes, contentType = '') {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const declared = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1] || /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] || 'utf-8';
  let text;
  try { text = new TextDecoder(declared.toLowerCase()).decode(bytes); } catch { text = new TextDecoder('utf-8').decode(bytes); }
  // Charset declarado errado (comum): UTF-8 com caracteres inválidos → tenta Windows-1252/Latin-1.
  if (text.includes('\uFFFD')) { const alt = new TextDecoder('latin1').decode(bytes); if (!alt.includes('\uFFFD')) text = alt; }
  return text;
}

/** Busca todos os feeds em paralelo; falhas individuais não derrubam o módulo. */
export async function fetchAll() {
  return cached('feeds', TTL, async () => {
    const list = sources();
    const results = await Promise.allSettled(list.map(async (src) => {
      const res = await fetchWithTimeout(src.url, { timeout: 10000, headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
      return parseFeed(decodeFeed(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type')), src);
    }));
    const items = [];
    const failed = [];
    results.forEach((r, i) => (r.status === 'fulfilled' ? items.push(...r.value) : failed.push(list[i].name)));
    if (failed.length) log.warn('noticias', `Feeds indisponíveis: ${failed.join(', ')}`);
    setHealth('noticias', failed.length === 0 ? 'ok' : failed.length < list.length ? 'limited' : 'fail', `${list.length - failed.length}/${list.length} fontes${failed.length ? ` · fora: ${failed.join(', ')}` : ''}`);
    const cutoff = Date.now() - MAX_AGE_HOURS * 3600 * 1000;
    // Regra de atualidade: sem data ou antigas são descartadas.
    const fresh = items.filter((it) => it.publishedAt && Date.parse(it.publishedAt) >= cutoff && Date.parse(it.publishedAt) <= Date.now() + 3600e3);
    const fetchedAt = new Date().toISOString();
    if (fresh.length) save(CACHE_FILE, { items: fresh.slice(0, 300), fetchedAt });
    return { items: fresh, failed, okSources: list.length - failed.length, totalSources: list.length, fetchedAt, ...(fresh.length ? {} : { failed: failed.length ? failed : ['todas'], ok: false }) };
  });
}
