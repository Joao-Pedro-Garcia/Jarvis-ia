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
const tasks = await import('./modules/tasks/tasks.js');
const selftest = await import('./core/selftest.js');
const chats = await import('./core/chats.js');
const groq = await import('./brain/ai/groq.js');
const tts = await import('./modules/voice/tts.js');
await (await import('./commands/loader.js')).loadCustomCommands();

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const { internetStatus } = await import('./core/http-client.js');
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
  // Só JSON: impede que formulários/requests "simples" de outros sites (CSRF) sejam aceitos.
  const type = String(req.headers['content-type'] || '');
  if (req.headers['content-length'] !== '0' && type && !type.startsWith('application/json')) {
    throw Object.assign(new Error('Content-Type deve ser application/json'), { status: 415 });
  }
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
setInterval(() => { // limpeza periódica (evita crescimento infinito do mapa)
  const now = Date.now();
  for (const [k, arr] of hits) if (!arr.length || now - arr[arr.length - 1] > 120000) hits.delete(k);
}, 60000).unref();
function rateLimited(ip, key, max, windowMs = 60000) {
  const k = `${ip}|${key}`;
  const now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(k, arr);
  return arr.length > max;
}

/**
 * Bloqueia requisições de outros sites (CSRF). Navegadores enviam Origin em
 * requisições cross-site; se existir, precisa ser o próprio host do JARVIS.
 */
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // apps/curl/mesma origem em GET
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function authorized(req, url) {
  if (!TOKEN) return true;
  const given = req.headers['x-jarvis-token'] || url.searchParams.get('token') || '';
  const a = Buffer.from(String(given)); const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SHARED_DIR = path.join(ROOT, 'shared');
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  // /shared/ = módulos puros usados por servidor E navegador (cálculos offline)
  const rootDir = p.startsWith('/shared/') ? SHARED_DIR : PUBLIC_DIR;
  const file = path.normalize(path.join(rootDir, p.startsWith('/shared/') ? p.slice('/shared'.length) : p));
  if (!file.startsWith(rootDir + path.sep)) return send(res, 403, 'Proibido');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Não encontrado');
    const ext = path.extname(file);
    const cache = 'no-cache'; // sempre revalida: evita misturar versões antigas e novas do app
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

// ---- SSE: eventos do servidor em tempo real para a interface ----
/** Processa uma mensagem do usuário dentro da sua conversa (memória da conversa + registro). */
async function runInput(body, onToken = null) {
  const client = body.client && typeof body.client === 'object' ? { mic: String(body.client.mic || '').slice(0, 20), hearing: body.client.hearing !== false, voice: body.client.voice !== false, notifications: String(body.client.notifications || '').slice(0, 20) } : {};
  // Cada conversa tem a sua memória de sessão (a IA lembra o que foi dito nela).
  const chatId = chats.validId(body.chatId) ? body.chatId : chats.newId();
  const sessionKey = `chat-${chatId}`;
  const sess = memory.session(sessionKey);
  if (!sess.history.length) for (const h of chats.historyFor(chatId)) memory.pushHistory(sess, h.role, h.content);
  const out = await processInput(body.text, { sessionId: sessionKey, pageSize: Number(body.pageSize) || 8, source: body.source === 'voice' ? 'voice' : 'text', client, onToken });
  const chat = chats.append(chatId, String(body.text || '').trim(), out);
  return { ...out, chatId, chatTitle: chat?.title || null };
}

const sseClients = new Set();
bus.on('*', (evt) => {
  const data = `data: ${JSON.stringify(evt)}\n\n`;
  for (const res of sseClients) res.write(data);
});
setInterval(() => { for (const res of sseClients) res.write(': ping\n\n'); }, 25000).unref();

const CLIENT_LOG_CATEGORIES = new Set(['palmas', 'ouvido', 'voz', 'permissoes', 'interface', 'erro-cliente', 'cerebro', 'notificacoes', 'pwa']);

async function api(req, res, url) {
  const ip = req.socket.remoteAddress;
  const route = `${req.method} ${url.pathname}`;
  const pageSize = Number(url.searchParams.get('pageSize')) || 8;

  if (route === 'GET /api/health') return send(res, 200, { ok: true, at: new Date().toISOString() });
  if (req.method !== 'GET' && !sameOrigin(req)) {
    log.warn('seguranca', `Requisição de outra origem bloqueada (${req.method} ${url.pathname})`);
    return send(res, 403, { error: 'Origem não permitida' });
  }
  if (!authorized(req, url)) { log.warn('seguranca', 'Token de acesso inválido'); return send(res, 401, { error: 'Token de acesso inválido' }); }

  switch (route) {
    case 'GET /api/status': {
      const st = await modulesStatus();
      return send(res, 200, { ...st, llm: llm.status(), settings: getSettings(), personality: getPersonality(), recentCommands: getRecentCommands(), version: VERSION, serverTime: new Date().toISOString(), timezone: process.env.JARVIS_TIMEZONE || 'America/Araguaina' });
    }
    case 'POST /api/input': {
      if (rateLimited(ip, 'input', 40)) return send(res, 429, { error: 'Muitas requisições. Aguarde um instante.' });
      return send(res, 200, await runInput(await readBody(req)));
    }
    case 'POST /api/input/stream': {
      // Mesma coisa que /api/input, mas a resposta da IA chega aos pedaços (uma linha JSON por evento):
      // {"type":"token","text":"..."} … e no final {"type":"done","result":{…}}.
      if (rateLimited(ip, 'input', 40)) return send(res, 429, { error: 'Muitas requisições. Aguarde um instante.' });
      const body = await readBody(req);
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      const line = (o) => { if (!res.writableEnded) res.write(`${JSON.stringify(o)}\n`); };
      try {
        const result = await runInput(body, (delta) => line({ type: 'token', text: delta }));
        line({ type: 'done', result });
      } catch (err) {
        log.error('servidor', `Falha no processamento: ${err.message}`);
        line({ type: 'error', error: 'Erro interno ao processar o pedido.' });
      }
      res.end();
      return undefined;
    }
    case 'GET /api/chats': return send(res, 200, { chats: chats.list({ category: url.searchParams.get('category') || null, q: url.searchParams.get('q') || '' }), categories: chats.categoriesInUse() });
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

    // ---- Tarefas ----
    case 'GET /api/tasks': return send(res, 200, { tasks: tasks.list({ includeDone: url.searchParams.get('all') === '1' }) });
    case 'POST /api/tasks': {
      const body = await readBody(req);
      if (!String(body.text || '').trim()) return send(res, 400, { error: 'Texto obrigatório' });
      return send(res, 201, tasks.add(String(body.text).trim(), body.dueAt ? { dueAt: body.dueAt, hasTime: !!body.hasTime } : {}));
    }
    case 'GET /api/internet': return send(res, 200, await internetStatus({ force: url.searchParams.get('force') === '1' }));
    case 'GET /api/ai': return send(res, 200, await llm.refresh({ force: url.searchParams.get('force') === '1' }));
    // IA online gratuita (Groq): a chave entra, é testada e fica criptografada no servidor (nunca volta para a tela).
    case 'GET /api/ai/online': return send(res, 200, { configured: groq.groqProvider.configured(), source: groq.keySource(), model: groq.groqProvider.configured() ? groq.groqProvider.model() : null });
    case 'POST /api/ai/online': {
      if (rateLimited(ip, 'ai-key', 10)) return send(res, 429, { error: 'Muitas tentativas. Aguarde um instante.' });
      const body = await readBody(req);
      try {
        const r = await groq.saveKey(body.key);
        log.info('cerebro', `IA online (Groq) configurada · modelo ${r.model}`);
        return send(res, 200, { ok: true, model: r.model, status: await llm.refresh({ force: true }) });
      } catch (err) { return send(res, err.status || 400, { error: err.message }); }
    }
    case 'DELETE /api/ai/online': {
      if (url.searchParams.get('confirm') !== 'true') return send(res, 400, { error: 'Confirmação necessária' });
      groq.removeKey();
      log.info('cerebro', 'IA online (Groq) removida; voltando para a IA local');
      return send(res, 200, { ok: true, status: await llm.refresh({ force: true }) });
    }
    // Voz do JARVIS: texto → áudio (MP3 da voz neural ou WAV do eSpeak). 503 = o navegador usa a voz do celular.
    case 'GET /api/tts': return send(res, 200, tts.ttsStatus());
    case 'POST /api/tts': {
      if (rateLimited(ip, 'tts', 240)) return send(res, 429, { error: 'Muitas falas seguidas. Aguarde um instante.' });
      const body = await readBody(req);
      try {
        const out = await tts.speakToAudio(body.text, { voice: body.voice, rate: body.rate, pitch: body.pitch, engine: body.engine });
        return send(res, 200, out.audio, { 'Content-Type': out.type, 'X-Voice-Engine': out.engine, 'Cache-Control': 'no-store' });
      } catch (err) { return send(res, err.status || 503, { error: err.message }); }
    }
    case 'GET /api/selftest': {
      if (rateLimited(ip, 'selftest', 6)) return send(res, 429, { error: 'Aguarde antes de repetir o diagnóstico.' });
      return send(res, 200, await selftest.runSelfTest({ includeAI: url.searchParams.get('ai') === '0' ? false : url.searchParams.get('ai') === '1' ? 'force' : true }));
    }

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
  if ((m = url.pathname.match(/^\/api\/chats\/([0-9a-f-]{36})$/))) {
    if (req.method === 'GET') { const c = chats.get(m[1]); return c ? send(res, 200, c) : send(res, 404, { error: 'Conversa não encontrada' }); }
    if (req.method === 'PATCH') { const c = chats.rename(m[1], (await readBody(req)).title); return c ? send(res, 200, c) : send(res, 400, { error: 'Título inválido' }); }
    if (req.method === 'DELETE') {
      if (url.searchParams.get('confirm') !== 'true') return send(res, 400, { error: 'Confirmação necessária' });
      return chats.remove(m[1]) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Conversa não encontrada' });
    }
  }
  if ((m = url.pathname.match(/^\/api\/memory\/([\w-]{36})$/))) {
    if (req.method === 'PATCH') { const item = memory.updateItem(m[1], await readBody(req)); return item ? send(res, 200, item) : send(res, 404, { error: 'Não encontrada' }); }
    if (req.method === 'DELETE') { const item = memory.remove(m[1]); return item ? send(res, 200, item) : send(res, 404, { error: 'Não encontrada' }); }
  }
  if ((m = url.pathname.match(/^\/api\/memory\/([\w-]{36})\/reveal$/)) && req.method === 'POST') {
    const body = await readBody(req);
    if (body.confirm !== true) return send(res, 400, { error: 'Confirmação necessária' });
    log.info('seguranca', 'Memória protegida revelada (após confirmação)');
    const text = memory.reveal(m[1]);
    return text ? send(res, 200, { text }) : send(res, 404, { error: 'Não encontrada' });
  }
  if ((m = url.pathname.match(/^\/api\/tasks\/([\w-]{36})$/)) && req.method === 'PATCH') {
    const body = await readBody(req);
    const id = m[1];
    if (!tasks.get(id)) return send(res, 404, { error: 'Não encontrada' });
    const out = body.action === 'done' ? tasks.complete(id) : body.action === 'cancel' ? tasks.cancel(id) : body.action === 'reopen' ? memory.updateItem(id, { status: 'pending' })
      : body.action === 'postpone' && body.dueAt ? tasks.postpone(id, new Date(body.dueAt), !!body.hasTime) : body.action === 'edit' && body.text ? tasks.edit(id, String(body.text)) : null;
    return out ? send(res, 200, out) : send(res, 400, { error: 'Ação inválida' });
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
  tasks.startScheduler(Number(process.env.JARVIS_REMINDER_INTERVAL_MS) || 20000);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Já existe um JARVIS ligado na porta ${PORT} (talvez em outra sessão do Termux).\n  Desligue-o com:  pkill -f "node server/index.js"   e ligue de novo com:  jarvis\n`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, HOST, async () => {
    bus.emitEvent(EVENTS.ASSISTANT_STARTED, {});
    const ai = await llm.refresh({ force: true }).catch(() => llm.status());
    const aiText = ai.configured ? `${ai.state} — ${ai.providerName} · ${ai.model}` : 'IA INDISPONÍVEL — modo local inteligente (para IA gratuita, instale o Ollama: veja o README)';
    log.info('sistema', `JARVIS online (v${VERSION}) em ${protocol}://${HOST}:${PORT} · ${aiText}`);
    // Busca notícias, câmbio e combustíveis em segundo plano: a primeira pergunta já sai rápida.
    news.prefetch().then(() => log.info('noticias', 'Notícias, câmbio e combustíveis pré-carregados')).catch(() => {});
    console.log(`\n  JARVIS online (v${VERSION}) → ${protocol}://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n  ${aiText}\n`);
  });
  const stop = () => { bus.emitEvent(EVENTS.ASSISTANT_STOPPED, {}); log.info('sistema', 'Encerrando JARVIS'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 1500).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
