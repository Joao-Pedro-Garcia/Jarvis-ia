// JARVIS — orquestrador da interface.
// Fluxo: PALMAS/MIC/TEXTO → OUVIDO → CÉREBRO (servidor) → AÇÃO/RESPOSTA → VOZ + INTERFACE
import { bus, EVENTS } from './core/bus.js';
import { api, serverEvents } from './core/api.js';
import { setState, getState } from './core/state.js';
import { getSettings, applyServerSettings, saveSettings } from './core/settings.js';
import { clientLog } from './core/logger.js';
import { listenOnce, stopListening, hearingSupported, setWakeWord, isListening } from './modules/hearing.js';
import { speak, stopSpeaking, configureVoice, unlockVoice, isSpeaking } from './modules/voice.js';
import { startClap, stopClap, pauseClap, resumeClap, configureClap, clapStatus } from './modules/clap.js';
import { sounds } from './modules/sounds.js';
import { createCore } from './ui/core-viz.js';
import { $, $$, esc, toast, relTime } from './ui/dom.js';
import { closeSheet, currentSheet } from './ui/sheet.js';
import { showBible, renderBibleMini, bibleActions, pageSize } from './ui/bible-reader.js';
import { showNews, showStory } from './ui/news-panel.js';
import { showMemory, showSettings, showDiagnostics, showModules, showHouse, showMenu } from './ui/panels.js';

const sessionId = (() => { try { let id = sessionStorage.getItem('jarvis.session'); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('jarvis.session', id); } return id; } catch { return 'default'; } })();
const startedAt = Date.now();
const history = []; // memória de sessão exibida no painel
let core;
let busy = false;
let lastStatus = null;
let offlineNotified = false;

// ------------------------------------------------------------ transcrição
function addMsg(role, text, { tag, confirm } = {}) {
  const box = $('#transcript');
  const p = document.createElement('p');
  p.className = `msg ${role}`;
  p.textContent = text;
  if (tag) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; p.appendChild(t); }
  if (confirm) {
    const div = document.createElement('div'); div.className = 'confirm-actions';
    for (const [label, say] of [['Sim, confirmar', 'sim'], ['Cancelar', 'não']]) {
      const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { div.remove(); handleInput(say, 'text'); }); div.appendChild(b);
    }
    p.appendChild(div);
  }
  box.appendChild(p);
  while (box.children.length > 60) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (role !== 'system') history.push({ role: role === 'user' ? 'user' : 'jarvis', text });
}

function recentCommand(intent, module, ok = true) {
  const ol = $('#recent-commands');
  if (ol.querySelector('.muted')) ol.innerHTML = '';
  const li = document.createElement('li');
  if (!ok) li.className = 'fail';
  li.innerHTML = `<b>${esc(module || '')} · ${esc(intent)}</b><span>${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>`;
  ol.prepend(li);
  while (ol.children.length > 12) ol.lastChild.remove();
}

// ------------------------------------------------------------ fala
async function say(text) {
  const s = getSettings();
  if (!text || !s?.voice?.enabled) return;
  setState('speaking');
  await pauseClap();
  await speak(text);
  if (getState() === 'speaking') setState('standby');
  resumeClap(getSettings()?.clap);
}

// ------------------------------------------------------------ cérebro
async function handleInput(text, source = 'text') {
  text = String(text || '').trim();
  if (!text) { setState('standby'); return; }
  if (busy) { toast('Aguarde, ainda estou processando…'); return; }
  busy = true;
  stopSpeaking();
  addMsg('user', text);
  setState('thinking');
  const t0 = performance.now();
  let res;
  try {
    res = await api.post('/api/input', { text, sessionId, pageSize: pageSize(), source }, { timeout: 90000 });
  } catch (err) {
    busy = false;
    setState('error', err.offline ? 'SEM SERVIDOR' : 'FALHA');
    sounds.error();
    addMsg('system', `⚠ ${err.message}`);
    clientLog('erro-cliente', `Falha ao enviar comando: ${err.message}`, 'warn');
    if (err.offline) offlineHelp();
    return;
  }
  busy = false;
  $('#sys-latency').textContent = `${Math.round(performance.now() - t0)} ms`;
  $('#sys-tone').textContent = (res.tone || '—').toUpperCase();
  bus.emit(EVENTS.RESPONSE_RECEIVED, res);
  if (res.intent) { bus.emit(EVENTS.COMMAND_DETECTED, res); recentCommand(res.intent, res.module, !res.error); }
  addMsg('jarvis', res.text, { tag: res.module, confirm: res.awaitingConfirmation });
  applyUi(res);
  if (res.clientActions?.includes('stopSpeech')) { stopSpeaking(); setState('standby'); return; }
  if (res.error) setState('error');
  await say(res.speech);
  // Conversa contínua: se o JARVIS fez uma pergunta, volta a ouvir.
  const s = getSettings();
  const asked = res.awaitingConfirmation || /\?\s*$/.test(res.text || '');
  if (source === 'voice' && s?.hearing?.continuousConversation && asked && !isSpeaking()) startListening({ chime: true });
  else if (getState() !== 'error') setState('standby');
}

function applyUi(res) {
  const ui = res.ui;
  if (!ui) return;
  switch (ui.panel) {
    case 'bible': showBible(ui.bible, res.animate || null); break;
    case 'close-bible': if (currentSheet() === 'bible') closeSheet(); break;
    case 'news': showNews(ui.news); break;
    case 'news-detail': showStory(ui.story); break;
    case 'memory': showMemory(history); refreshMemoryMini(); break;
    case 'settings': openSettings(); break;
    case 'diagnostics': showDiagnostics(); break;
    case 'modules': showModules(); break;
    case 'house': showHouse(); break;
    default: break;
  }
}

// ------------------------------------------------------------ ouvido
async function startListening({ chime = true, greet = null } = {}) {
  if (!hearingSupported) {
    addMsg('system', 'Reconhecimento de voz não suportado neste navegador (use Chrome, Edge ou Android). Você pode digitar.');
    $('#command-input').focus();
    return;
  }
  if (isListening()) { stopListening(); setState('standby'); return; }
  stopSpeaking();
  await pauseClap();
  if (greet) await say(greet);
  if (chime) sounds.activate();
  setState('listening');
  const s = getSettings();
  try {
    const text = await listenOnce({ lang: s?.hearing?.lang || 'pt-BR', silenceMs: s?.hearing?.silenceMs || 1800 });
    $('#interim').textContent = '';
    if (!text) { setState('standby'); resumeClap(s?.clap); return; }
    clientLog('ouvido', `Transcrição recebida (${text.length} caracteres)`);
    bus.emit(EVENTS.VOICE_RECEIVED, { text });
    await handleInput(text, 'voice');
  } catch (err) {
    $('#interim').textContent = '';
    setState('error', 'MICROFONE');
    sounds.error();
    addMsg('system', `⚠ ${err.message}`);
  } finally {
    resumeClap(getSettings()?.clap);
    updateChips();
  }
}

bus.on(EVENTS.VOICE_INTERIM, ({ text }) => { $('#interim').textContent = text; core?.pulse(0.25); });
bus.on(EVENTS.SPEECH_BOUNDARY, () => core?.pulse(0.35));
bus.on(EVENTS.STATE_CHANGED, ({ next }) => { core?.setState(next); updateChips(); });
bus.on(EVENTS.CLAP_LEVEL, ({ peak, threshold }) => {
  $('#mic-level').style.width = `${Math.min(100, peak * 100)}%`;
  $('#clap-threshold').style.left = `${Math.min(99, threshold * 100)}%`;
});
bus.on(EVENTS.CLAP_DETECTED, () => core?.pulse(0.3));
bus.on(EVENTS.DOUBLE_CLAP, () => {
  if (busy || isListening()) return;
  addMsg('system', '👏👏 Duas palmas detectadas');
  startListening({ chime: false, greet: 'Sim?' });
});
// Ativação por voz ("Jarvis, ...")
bus.on(EVENTS.VOICE_RECEIVED, ({ text, wake }) => {
  if (!wake) return;
  if (text && text.length > 1) handleInput(text, 'voice'); else startListening({ chime: false, greet: 'Sim?' });
});
bus.on('bible:message', (msg) => { addMsg('jarvis', msg, { tag: 'BÍBLIA' }); if (/concluíd/.test(msg)) say(msg); });
bus.on(EVENTS.BIBLE_OPENED, (v) => renderBibleMini(v));

// ------------------------------------------------------------ status / módulos
function chip(id, cls) { const el = $(id); el.classList.remove('ok', 'warn', 'bad', 'active'); if (cls) el.classList.add(...cls.split(' ')); }
function updateChips() {
  const online = navigator.onLine && lastStatus?.online !== false;
  chip('#chip-net', online ? 'ok' : 'bad');
  chip('#chip-ai', lastStatus?.llm?.configured ? (online ? 'ok' : 'warn') : 'warn');
  chip('#chip-mic', isListening() ? 'ok active' : hearingSupported ? '' : 'bad');
  const c = clapStatus();
  chip('#chip-clap', c.running ? 'ok' : c.enabled ? 'warn' : '');
  $('#sys-mode').textContent = `${getSettings()?.security?.safeMode ? 'SEGURO · ' : ''}${getSettings()?.ui?.mode === 'economico' ? 'ECONÔMICO' : 'DESEMPENHO'}`;
}

function renderModules(status) {
  const grid = $('#module-grid');
  grid.innerHTML = status.modules.map((m) => `<li data-module="${esc(m.id)}" title="${esc(m.info)}"><span class="m-name"><i class="m-dot ${esc(m.status)}"></i>${esc(m.name)}</span><span class="m-last">${m.last ? `${esc(m.last.event)} · ${relTime(m.last.at)}` : esc(m.info.split('.')[0])}</span></li>`).join('');
  $$('li', grid).forEach((li) => li.addEventListener('click', () => {
    const id = li.dataset.module;
    ({ biblia: () => handleInput('Bíblia'), noticias: () => handleInput('Notícias'), memoria: () => showMemory(history), casa: showHouse, sistema: showDiagnostics, palmas: openSettings, voz: openSettings, ouvido: openSettings }[id] || showModules)();
  }));
}

async function refreshStatus() {
  try {
    lastStatus = await api.get('/api/status', { timeout: 15000 });
    renderModules(lastStatus);
    const ol = $('#recent-commands');
    if (ol.querySelector('.muted') && lastStatus.recentCommands.length) {
      ol.innerHTML = '';
      lastStatus.recentCommands.slice(0, 10).reverse().forEach((c) => recentCommand(c.name, c.module, c.ok));
    }
    if (!lastStatus.online && !offlineNotified) offlineHelp();
    if (lastStatus.online) offlineNotified = false;
  } catch (err) {
    lastStatus = { ...(lastStatus || {}), online: false };
    if (!offlineNotified) offlineHelp(true);
  }
  updateChips();
}

function offlineHelp(serverDown = false) {
  offlineNotified = true;
  addMsg('system', serverDown
    ? '⚠ Servidor do JARVIS inacessível. A interface continua aberta, mas comandos precisam do servidor rodando (npm start).'
    : '⚠ Sem internet. Continuam funcionando: hora, data, contas, conversões, cálculos de motor, memória, tarefas, Bíblia já baixada e a voz. Ficam indisponíveis: conversa com a IA, notícias, câmbio, combustíveis e (no Chrome) o reconhecimento de voz — use o texto.');
}

async function refreshMemoryMini() {
  try {
    const m = await api.get('/api/memory');
    const items = [...m.facts.map((x) => ['FATO', x]), ...m.preferences.map((x) => ['PREFERÊNCIA', x]), ...m.tasks.filter((t) => !t.done).map((x) => ['TAREFA', x])].slice(-8).reverse();
    $('#mem-mini').innerHTML = items.length ? items.map(([k, x]) => `<li><small>${k}</small>${esc(x.text)}</li>`).join('') : '<li class="muted">Sem memórias.</li>';
  } catch {}
}

// ------------------------------------------------------------ configurações
function applySettings(s, changedKey) {
  if (!s) return;
  document.body.dataset.theme = s.ui.theme;
  document.body.classList.toggle('eco', s.ui.mode === 'economico');
  document.body.classList.toggle('no-anim', !s.ui.animations);
  core?.configure({ eco: s.ui.mode === 'economico', particles: s.ui.particles, animations: s.ui.animations });
  configureVoice({ rate: s.voice.rate, volume: s.voice.volume, pitch: s.voice.pitch, lang: s.voice.lang, voiceName: s.voice.voiceName });
  configureClap(s.clap);
  if (changedKey === 'clap.enabled' || changedKey === 'boot') {
    if (s.clap.enabled) startClap(s.clap).then(() => { toast('👏 Palmas ativas: bata duas vezes para me chamar.'); updateChips(); }).catch((e) => { toast(e.message); saveSettings({ clap: { enabled: false } }); });
    else if (changedKey !== 'boot') stopClap().then(updateChips);
  }
  if (changedKey === 'hearing.wakeWord' || changedKey === 'boot') setWakeWord(s.hearing.wakeWord, { lang: s.hearing.lang, name: s.hearing.wakeWordName });
  if (changedKey === 'test-voice') say('Olá. Esta é a minha voz atual.');
  updateChips();
}
function openSettings() { showSettings({ onChange: (s, key) => applySettings(s, key) }); }

// ------------------------------------------------------------ eventos de interface
$('#command-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#command-input');
  const v = input.value; input.value = '';
  handleInput(v, 'text');
});
$('#mic-btn').addEventListener('click', () => startListening());
$('#dock-mic').addEventListener('click', () => startListening());
$('#sheet-mic').addEventListener('click', () => startListening());
$('#core-button').addEventListener('click', () => (isSpeaking() ? (stopSpeaking(), setState('standby')) : startListening()));
$('#stop-btn').addEventListener('click', () => { stopSpeaking(); setState('standby'); });
const PANELS = { memory: () => showMemory(history), settings: openSettings, diagnostics: showDiagnostics, modules: showModules, house: showHouse,
  menu: () => showMenu({ bible: () => handleInput('Bíblia'), news: () => handleInput('Notícias'), memory: () => showMemory(history), modules: showModules, house: showHouse, settings: openSettings, diagnostics: showDiagnostics,
    clap: () => { const s = getSettings(); saveSettings({ clap: { enabled: !s.clap.enabled } }).then((n) => applySettings(n, 'clap.enabled')); closeSheet(); }, stop: () => { stopSpeaking(); setState('standby'); closeSheet(); } }) };
document.addEventListener('click', (e) => {
  const sayBtn = e.target.closest('[data-say]'); if (sayBtn) handleInput(sayBtn.dataset.say, 'text');
  const openBtn = e.target.closest('[data-open]'); if (openBtn) PANELS[openBtn.dataset.open]?.();
});

// Atalhos de teclado (PC)
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (isSpeaking()) { stopSpeaking(); setState('standby'); } else if (isListening()) { stopListening(); setState('standby'); } else closeSheet(); return; }
  if (typing) return;
  if (currentSheet() === 'bible' && (e.key === 'ArrowRight' || e.key === 'PageDown')) { e.preventDefault(); bibleActions.next(); return; }
  if (currentSheet() === 'bible' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) { e.preventDefault(); bibleActions.prev(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); startListening(); }
  else if (k === '/') { e.preventDefault(); $('#command-input').focus(); }
  else if (k === 'b') handleInput('Bíblia');
  else if (k === 'n') handleInput('Notícias');
  else if (k === 'm') showMemory(history);
  else if (k === 's') openSettings();
  else if (k === 'd') showDiagnostics();
});

window.addEventListener('online', () => { toast('Conexão restabelecida.'); offlineNotified = false; refreshStatus(); });
window.addEventListener('offline', () => { updateChips(); offlineHelp(); });

// ------------------------------------------------------------ relógio
function tick() {
  const now = new Date();
  $('#clock-time').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('#clock-date').textContent = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  $('#sys-uptime').textContent = `${Math.floor((Date.now() - startedAt) / 60000)} min`;
}

// ------------------------------------------------------------ inicialização
async function boot() {
  core = createCore($('#core-canvas'));
  tick(); setInterval(tick, 1000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try {
    lastStatus = await api.get('/api/status', { timeout: 15000 });
    applyServerSettings(lastStatus.settings);
    renderModules(lastStatus);
    $('#boot-text').textContent = 'SISTEMAS ONLINE';
  } catch (err) {
    $('#boot-text').textContent = 'SERVIDOR INACESSÍVEL — MODO LIMITADO';
    clientLog('interface', `Boot sem servidor: ${err.message}`, 'warn');
  }
  applySettings(getSettings() || {}, null);
  updateChips();
  api.get(`/api/bible?pageSize=${pageSize()}`, { timeout: 20000 }).then(renderBibleMini).catch(() => {});
  refreshMemoryMini();
  serverEvents((evt) => {
    bus.emit(EVENTS.SERVER_EVENT, evt);
    if (evt.type === 'MEMORY_UPDATED') refreshMemoryMini();
    if (['MEMORY_UPDATED', 'BIBLE_DAY_COMPLETED', 'NEWS_FETCHED', 'HOUSE_ACTION', 'LLM_ERROR'].includes(evt.type)) refreshStatus();
  });
  setInterval(refreshStatus, 60000);
  // Um toque inicial é exigido pelos navegadores para liberar áudio e microfone.
  const start = $('#boot-start');
  start.hidden = false;
  start.addEventListener('click', () => {
    unlockVoice(); sounds.unlock();
    $('#boot').classList.add('hide');
    setTimeout(() => $('#boot').remove(), 700);
    setState('standby');
    bus.emit(EVENTS.ASSISTANT_STARTED);
    applySettings(getSettings(), 'boot');
    const h = new Date().getHours();
    const nome = lastStatus?.personality?.nome_usuario;
    const greet = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${nome ? `, ${nome}` : ''}. JARVIS online.`;
    addMsg('jarvis', `${greet} ${lastStatus?.llm?.configured ? 'Como posso ajudar?' : 'Estou no modo local (IA conversacional não configurada no servidor).'}`, { tag: 'SISTEMA' });
    say(greet);
  }, { once: true });
}

boot();
window.addEventListener('beforeunload', () => { stopSpeaking(); stopClap(); });
