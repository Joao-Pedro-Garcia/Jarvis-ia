// JARVIS — servidor. Node.js puro (sem framework), API + arquivos estáticos.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEnv } from './core/env.js';
loadEnv();
const { PUBLIC_DIR, ROOT } = await import('./core/paths.js');
const { log, recentLogs, clearLogs } = await import('./core/logger.js');
const { bus, EVENTS } = await import('./core/events.js');
const { getSettings, updateSettings } = await import('./core/settings.js');
const { modulesStatus, noteClientEvent } = await import('./core/modules-status.js');
const { processInput, getRecentCommands } = await import('./brain/brain.js');
const { listCommands } = await import('./brain/commands.js');
const { getPersonality, updatePersonality } = await import('./brain/personality.js');
const reading = await import('./modules/bible/reading.js');
const { BOOKS } = await import('./modules/bible/books.js');
const memory = await import('./modules/memory/memory.js');
const news = await import('./modules/news/news.js');
const house = await import('./modules/house/house.js');
const llm = await import('./brain/llm.js');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.JARVIS_ACCESS_TOKEN || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': isJson ? MIME['.json'] : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Corpo muito grande'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// Limite simples de requisições por IP (evita abuso e gastos com a API).
const hits = new Map();
function rateLimited(ip, key, max, windowMs = 60000) {
  const k = `${ip}|${key}`;
  const now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(k, arr);
  return arr.length > max;
}

function authorized(req, url) {
  if (!TOKEN) return true;
  const given = req.headers['x-jarvis-token'] || url.searchParams.get('token') || '';
  const a = Buffer.from(String(given)); const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Proibido');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Não encontrado');
    const ext = path.extname(file);
    const cache = ext === '.html' || p === '/sw.js' ? 'no-cache' : 'public, max-age=300';
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

// ---- SSE: eventos do servidor em tempo real para a interface ----
const sseClients = new Set();
bus.on('*', (evt) => {
  const data = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) res.write(data);
});
setInterval(() => { for (const res of sseClients) res.write(': ping\n\n'); }, 25000).unref();

const CLIENT_LOG_CATEGORIES = new Set(['palmas', 'ouvido', 'voz', 'permissoes', 'interface', 'erro-cliente']);

async function api(req, res, url) {
  const ip = req.socket.remoteAddress;
  const route = `${req.method} ${url.pathname}`;
  const pageSize = Number(url.searchParams.get('pageSize')) || 8;

  if (route === 'GET /api/health') return send(res, 200, { ok: true, at: new Date().toISOString() });
  if (!authorized(req, url)) return send(res, 401, { error: 'Token de acesso inválido' });

  switch (route) {
    case 'GET /api/status': {
      const st = await modulesStatus();
      return send(res, 200, { ...st, llm: llm.status(), settings: getSettings(), personality: getPersonality(), recentCommands: getRecentCommands(), version: '1.0.0', serverTime: new Date().toISOString(), timezone: process.env.JARVIS_TIMEZONE || 'America/Araguaina' });
    }
    case 'POST /api/input': {
      if (rateLimited(ip, 'input', 40)) return send(res, 429, { error: 'Muitas requisições. Aguarde um instante.' });
      const body = await readBody(req);
      const out = await processInput(body.text, { sessionId: String(body.sessionId || 'default').slice(0, 64), pageSize: Number(body.pageSize) || 8, source: body.source === 'voice' ? 'voice' : 'text' });
      return send(res, 200, out);
    }
    case 'GET /api/events': {
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': conectado\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return undefined;
    }
    case 'GET /api/commands': return send(res, 200, { commands: listCommands() });

    // ---- Bíblia (botões/gestos da interface usam a mesma lógica dos comandos de voz) ----
    case 'GET /api/bible': return send(res, 200, await reading.current(pageSize));
    case 'GET /api/bible/books': return send(res, 200, { books: BOOKS.map(({ abbrev, name, chapters }) => ({ abbrev, name, chapters })) });
    case 'POST /api/bible/open': return send(res, 200, await reading.openDaily(pageSize));
    case 'POST /api/bible/next': return send(res, 200, await reading.turnPage('next', pageSize));
    case 'POST /api/bible/prev': return send(res, 200, await reading.turnPage('prev', pageSize));
    case 'POST /api/bible/next-chapter': return send(res, 200, await reading.changeChapter('next', pageSize));
    case 'POST /api/bible/prev-chapter': return send(res, 200, await reading.changeChapter('prev', pageSize));
    case 'POST /api/bible/next-reading': return send(res, 200, await reading.startNextReading(pageSize));
    case 'POST /api/bible/goto': {
      const body = await readBody(req);
      return send(res, 200, await reading.openReference({ book: body.book, chapter: Number(body.chapter) || 1 }, pageSize));
    }
    case 'GET /api/bible/settings': return send(res, 200, reading.getSettings());
    case 'PUT /api/bible/settings': return send(res, 200, reading.updateSettings(await readBody(req)));

    // ---- Notícias ----
    case 'GET /api/news': {
      if (rateLimited(ip, 'news', 10)) return send(res, 429, { error: 'Muitas atualizações seguidas.' });
      const parts = (url.searchParams.get('parts') || 'exchange,fuel,brazil,world,curiosity').split(',');
      return send(res, 200, await news.getSummary({ parts }));
    }

    // ---- Memória ----
    case 'GET /api/memory': return send(res, 200, memory.list());
    case 'POST /api/memory': {
      const body = await readBody(req);
      try { return send(res, 201, memory.add(body.kind, body.text)); } catch (err) { return send(res, 400, { error: err.message }); }
    }
    case 'DELETE /api/memory': {
      if (url.searchParams.get('confirm') !== 'true') return send(res, 400, { error: 'Confirmação necessária' });
      memory.clearAll(); return send(res, 200, { ok: true });
    }

    // ---- Configurações / personalidade ----
    case 'GET /api/settings': return send(res, 200, getSettings());
    case 'PUT /api/settings': return send(res, 200, updateSettings(await readBody(req)));
    case 'GET /api/personality': return send(res, 200, getPersonality());
    case 'PUT /api/personality': return send(res, 200, updatePersonality(await readBody(req)));

    // ---- Casa ----
    case 'GET /api/house': return send(res, 200, await house.status());

    // ---- Logs / diagnóstico ----
    case 'GET /api/logs': return send(res, 200, { logs: recentLogs({ limit: Number(url.searchParams.get('limit')) || 200, category: url.searchParams.get('category') || undefined, level: url.searchParams.get('level') || undefined }) });
    case 'DELETE /api/logs': { if (url.searchParams.get('confirm') !== 'true') return send(res, 400, { error: 'Confirmação necessária' }); clearLogs(); return send(res, 200, { ok: true }); }
    case 'POST /api/logs/client': {
      if (rateLimited(ip, 'clientlog', 120)) return send(res, 429, { error: 'excesso de logs' });
      const body = await readBody(req, 8 * 1024);
      const cat = CLIENT_LOG_CATEGORIES.has(body.category) ? body.category : 'erro-cliente';
      const level = ['info', 'warn', 'error'].includes(body.level) ? body.level : 'info';
      log[level](cat, String(body.message || '').slice(0, 300));
      if (cat === 'palmas' || cat === 'ouvido' || cat === 'voz') noteClientEvent(cat, String(body.message || '').slice(0, 60));
      return send(res, 204, '');
    }
    default: break;
  }
  // rotas com parâmetro
  let m;
  if ((m = url.pathname.match(/^\/api\/memory\/([\w-]{36})$/))) {
    if (req.method === 'PATCH') { const item = memory.updateItem(m[1], await readBody(req)); return item ? send(res, 200, item) : send(res, 404, { error: 'Não encontrada' }); }
    if (req.method === 'DELETE') { const item = memory.remove(m[1]); return item ? send(res, 200, item) : send(res, 404, { error: 'Não encontrada' }); }
  }
  return send(res, 404, { error: 'Rota não encontrada' });
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido');
    return serveStatic(req, res, url);
  } catch (err) {
    log.error('servidor', `${req.method} ${url.pathname}: ${err.message}`);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Erro interno' });
  }
}

export function createServer() {
  const key = process.env.HTTPS_KEY && path.resolve(ROOT, process.env.HTTPS_KEY);
  const cert = process.env.HTTPS_CERT && path.resolve(ROOT, process.env.HTTPS_CERT);
  if (key && cert && fs.existsSync(key) && fs.existsSync(cert)) {
    return { server: https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handler), protocol: 'https' };
  }
  return { server: http.createServer(handler), protocol: 'http' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ROOT, 'server', 'index.js')) {
  const { server, protocol } = createServer();
  server.listen(PORT, HOST, () => {
    bus.emitEvent(EVENTS.ASSISTANT_STARTED, {});
    log.info('sistema', `JARVIS online em ${protocol}://${HOST}:${PORT} · IA: ${llm.available() ? llm.model() : 'não configurada (modo local)'}`);
    console.log(`\n  JARVIS online → ${protocol}://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n  IA: ${llm.available() ? llm.model() : 'não configurada (modo local) — defina ANTHROPIC_API_KEY no .env'}\n`);
  });
  const stop = () => { bus.emitEvent(EVENTS.ASSISTANT_STOPPED, {}); log.info('sistema', 'Encerrando JARVIS'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
