// JARVIS — orquestrador da interface (navegador).
// Fluxo: PALMAS/MIC/TEXTO → OUVIDO → CÉREBRO (servidor) → RESULTADO → VOZ + INTERFACE.
// A lógica de negócio fica no servidor; aqui só há entrada, saída e estado.
import { bus, EVENTS } from './core/bus.js';
import { api, serverEvents } from './core/api.js';
import { setState, getState } from './core/state.js';
import { getSettings, applyServerSettings, saveSettings } from './core/settings.js';
import { clientLog } from './core/logger.js';
import { offlineAnswer, OFFLINE_NOTICE } from './core/offline-brain.js';
import { finishListening, holdWake, configureStt, listenOnce, stopListening, hearingSupported, isListening, startBargeIn, stopBargeIn, lastListenOutcome, waitMicRelease, MIC_RELEASE_MS } from './modules/hearing.js';
import { resetJarvisVoice, speak, stopSpeaking, configureVoice, unlockVoice, isSpeaking, pauseSpeaking, resumeSpeaking, isPaused, voiceSupported } from './modules/voice.js';
import { sounds } from './modules/sounds.js';
import { wake } from './modules/wake/index.js';
import { setClapStrict, setVoiceWake } from './modules/clap.js';
import * as attach from './modules/attach.js';
import { initMicState, micStatus, setMicState, MIC_LABEL, notify, notificationState, setKeepAwake } from './modules/device.js';
import { createCore } from './ui/core-viz.js';
import { $, $$, esc, toast, relTime } from './ui/dom.js';
import { closeSheet, currentSheet } from './ui/sheet.js';
import { showBible, renderBibleMini, bibleActions, pageSize } from './ui/bible-reader.js';
import { showNews, showStory } from './ui/news-panel.js';
import { showMemory, showSettings, showModules, showHouse, showMenu, showAgenda } from './ui/panels.js';
import { showDiagnostics, runSelfTest } from './ui/diagnostics.js';
import { checkBrowserAI, browserAIState, askBrowserAI } from './modules/browser-ai.js';

const sessionId = (() => { try { let id = sessionStorage.getItem('jarvis.session'); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('jarvis.session', id); } return id; } catch { return 'default'; } })();
const startedAt = Date.now();
const isAndroid = /Android/i.test(navigator.userAgent);
const history = []; // memória de sessão exibida no painel
let core;
let busy = false;
let lastStatus = null;
let serverReachable = true;
let statusTimer = null;

// ============================================================ transcrição
function addMsg(role, text, { tag, confirm } = {}) {
  const box = $('#transcript');
  // Avisos de sistema repetidos em sequência (ex.: palmas em ambiente barulhento)
  // viram uma linha só com contador, em vez de encher a tela.
  const prev = box.lastElementChild;
  if (role === 'system' && prev?.classList.contains('system') && prev.dataset.text === text) {
    const n = Number(prev.dataset.count || 1) + 1;
    prev.dataset.count = String(n);
    prev.textContent = `${text} ×${n}`;
    return;
  }
  const p = document.createElement('p');
  if (role === 'system') p.dataset.text = text;
  p.className = `msg ${role}`;
  p.textContent = text;
  if (tag) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; p.appendChild(t); }
  if (confirm) {
    const div = document.createElement('div'); div.className = 'confirm-actions';
    for (const [label, answer] of [['Sim, confirmar', 'sim'], ['Cancelar', 'não']]) {
      const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => { div.remove(); handleInput(answer, 'text'); }); div.appendChild(b);
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

// ============================================================ voz
let fallbackWarned = false;
bus.on('voice:fallback', ({ reason } = {}) => {
  if (fallbackWarned) return; fallbackWarned = true;
  addMsg('system', `⚠️ A voz escolhida não respondeu (${reason}). Falando com a voz do celular. Para voz masculina: Configurações → VOZ → “Como deixar a voz MASCULINA”.`);
});
/** Fala, com possibilidade de interrupção por "pare" (voz) ou duas palmas. */
let speechClapHold = 0;
let lastSpoken = { text: '', at: 0 };
const normTxt = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** O microfone pegou a PRÓPRIA voz do JARVIS (fim da fala no alto-falante)? */
const isEcho = (t) => { const n = normTxt(t); return n.length >= 6 && Date.now() - lastSpoken.at < 20000 && normTxt(lastSpoken.text).includes(n); };
async function say(text) {
  const s = getSettings();
  if (!text || !s?.voice?.enabled || s.voice.silent) return;
  setState('speaking');
  lastSpoken = { text, at: Date.now() };
  holdWake(true); // a escuta do "Jarvis" cortaria a fala no Android
  // O detector de palmas ouviria a PRÓPRIA voz do JARVIS no alto-falante ("p", "t" parecem
  // palmas) e cortaria a fala no meio: fica pausado enquanto ele fala.
  speechClapHold++;
  try {
  await wake?.pause();
  const speaking = speak(text);
  // Interrupção por voz (só depois que a fala começou). No Android, só se as
  // palmas estiverem desligadas — o microfone é um só.
  const barge = s.voice.bargeIn && hearingSupported && !(isAndroid && s.clap.enabled)
    ? startBargeIn({ lang: s.hearing.lang, onStop: () => { clientLog('voz', 'Fala interrompida: "pare" ouvido', 'warn'); stopSpeaking(); setState('standby'); }, onPause: () => togglePause() }) : null;
  await speaking.finally(() => holdWake(false));
  barge?.(); stopBargeIn();
  // Volta a ouvir palmas um instante depois (o fim do som não pode virar "palma").
  } finally {
    // Sempre libera (mesmo se algo falhar no meio): senão as palmas ficariam desligadas para sempre.
    setTimeout(() => { speechClapHold = Math.max(0, speechClapHold - 1); if (speechClapHold === 0 && !isListening() && !listenStarting) wake?.resume(getSettings()); }, 350);
  }
  if (getState() === 'speaking') setState('standby');
}

function togglePause() {
  if (isPaused()) { resumeSpeaking(); document.body.classList.remove('speech-paused'); setState('speaking'); }
  else if (pauseSpeaking()) { document.body.classList.add('speech-paused'); setState('standby', 'FALA PAUSADA'); }
}
function stopAll(why = '') {
  if (why && isSpeaking()) clientLog('voz', `Fala interrompida: ${why}`, 'warn'); // registro para achar cortes inesperados
  stopSpeaking(); stopBargeIn(); document.body.classList.remove('speech-paused'); setState('standby'); }

// ============================================================ cérebro
function clientInfo() {
  return { mic: micStatus(), hearing: hearingSupported, voice: voiceSupported, notifications: notificationState() };
}

// ============================================================ ouvido (Whisper)
// Com o Groq conectado, a transcrição é feita pelo Whisper (entende voz baixa e tom normal).
let sttCheckedAt = 0;
async function ensureStt(s = getSettings()) {
  if (s?.hearing?.engine === 'browser') { configureStt({ enabled: false }); return; }
  if (Date.now() - sttCheckedAt < 60000) return;
  sttCheckedAt = Date.now();
  try { const r = await api.get('/api/stt', { timeout: 2500 }); configureStt({ enabled: !!r.available }); } catch { /* mantém o último estado */ }
}
let sttWarned = false;
bus.on('stt:fallback', ({ reason } = {}) => {
  sttCheckedAt = 0;
  if (sttWarned) return; sttWarned = true;
  addMsg('system', `⚠️ A transcrição Whisper falhou (${reason}). Usando o reconhecimento do Google por 1 minuto. Fale de novo.`);
});

// ============================================================ modo dormindo
// Dormindo: tela apagada, só escuta duas palmas ou a palavra "Jarvis". Acorda com qualquer uma.
let asleep = false;
const SLEEP_RE = /^(jarvis )?(dorme|durma|modo dormir|pode dormir|descansa|descanse|modo sono|modo descanso)( jarvis)?$/;
function sleepNow({ quiet = false } = {}) {
  if (asleep) return;
  asleep = true;
  stopAll();
  document.body.classList.add('asleep');
  setState('standby', 'DORMINDO');
  if (!quiet) addMsg('system', '💤 Modo dormindo. Bata duas palmas ou diga “Jarvis” para me acordar.', 'SISTEMA');
  setClapStrict(true); // dormindo: só palmas nítidas acordam (barulhos de casa não)
  // Android: o "Jarvis" é ouvido pelo microfone das palmas (o do Google tiraria o microfone delas).
  if (isAndroid || !hearingSupported) setVoiceWake(true, onWakeClip);
  // Dormindo, a tela precisa ficar ligada (bem escura) para o microfone ouvir as palmas.
  setKeepAwake(true).catch(() => {});
  // os detectores de ativação precisam estar ligados para acordar
  const s = getSettings();
  if (!s.clap.enabled || !s.hearing.wakeWord) {
    saveSettings({ clap: { enabled: true }, hearing: { wakeWord: true } }).then((n) => {
      applySettings(n, 'clap.enabled');
      wake?.setWakeWord(true, n);
    }).catch(() => {});
  }
}
function wakeUp(how) {
  if (!asleep) return false;
  asleep = false;
  document.body.classList.remove('asleep');
  setClapStrict(false);
  setVoiceWake(false);
  document.body.classList.add('waking'); setTimeout(() => document.body.classList.remove('waking'), 1200);
  core?.pulse(1);
  setState('standby');
  setKeepAwake(!!getSettings()?.ui?.keepAwake).catch(() => {});
  addMsg('system', `🔔 Acordei (${how}).`, 'SISTEMA');
  return true;
}
/** Trecho de fala ouvido enquanto dorme: o Whisper confere se foi "Jarvis". */
const NAME_RE = /\b(jarvis|jarves|jarbas|djarvis|jarviz|jervis|jarvi)\b/i;
async function onWakeClip(wav) {
  if (!asleep) return;
  try {
    const res = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
    if (!res.ok) return; // sem Groq: só as palmas acordam
    const text = String((await res.json()).text || '');
    const m = text.match(NAME_RE);
    if (!m || !asleep) return;
    clientLog('ouvido', 'Palavra de ativação ouvida pelo microfone das palmas');
    wakeUp('Jarvis');
    const rest = text.slice(m.index + m[0].length).replace(/^[\s,.!?]+/, '').trim();
    if (rest.length > 2) handleInput(rest, 'voice'); else greetOnWake();
  } catch { /* sem internet: as palmas continuam funcionando */ }
}

/** Ao acordar: bom dia criativo (com clima real, se houver) e já fica ouvindo. */
async function greetOnWake() {
  const h = new Date().getHours();
  const nome = lastStatus?.personality?.nome_usuario;
  let g = null;
  try { g = await api.get('/api/greeting', { timeout: 1500 }); } catch { /* servidor fora: saudação simples */ }
  const text = g?.text || `${h >= 5 && h < 12 ? 'Bom dia' : h < 18 && h >= 12 ? 'Boa tarde' : 'Boa noite'}${nome ? `, ${nome}` : ''}! O que vai ser hoje?`;
  addMsg('jarvis', text, { tag: 'SISTEMA' });
  await say(text);
  if (!asleep && !busy && !isListening()) startListening({ chime: true, quiet: 'silence' });
}

async function handleInput(text, source = 'text', { media = null } = {}) {
  text = String(text || '').trim();
  if (!text && !media) { setState('standby'); return; }
  if (busy) { toast('Aguarde, ainda estou processando…'); return; }
  const low = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!media && SLEEP_RE.test(low)) { if (!asleep) sleepNow(); else addMsg('system', 'Já estou dormindo. Bata duas palmas ou diga “Jarvis”.', 'SISTEMA'); return; }
  if (asleep) { wakeUp('comando de voz'); }
  busy = true;
  stopAll('nova pergunta');
  addMsg('user', text || (media ? (media.kind === 'video' ? '🎬 Vídeo' : media.count > 1 ? `📷 ${media.count} imagens` : '📷 Imagem') : ''));
  if (media) { // miniaturas do que foi enviado, no próprio balão
    const p = $('#transcript').lastElementChild; const th = document.createElement('div'); th.className = 'thumbs';
    for (const src of media.images.slice(0, 5)) { const im = document.createElement('img'); im.src = src; im.alt = ''; th.appendChild(im); }
    p?.appendChild(th);
  }
  setState('thinking', media ? (media.kind === 'video' ? 'ASSISTINDO' : 'OLHANDO') : undefined);
  const t0 = performance.now();
  let res;
  // Balão da resposta sendo escrita (IA local manda a resposta palavra por palavra).
  let live = null;
  const onToken = (delta) => {
    if (!live) {
      live = document.createElement('p'); live.className = 'msg live'; live.setAttribute('aria-busy', 'true');
      $('#transcript').appendChild(live);
      setState('thinking', 'ESCREVENDO');
    }
    live.textContent += delta;
    $('#transcript').scrollTop = $('#transcript').scrollHeight;
  };
  try {
    const payload = { text, sessionId, chatId, pageSize: pageSize(), source, client: clientInfo() };
    if (media) res = await api.post('/api/input/media', { ...payload, media }, { timeout: 120000 });
    else try { res = await api.postStream('/api/input/stream', payload, onToken); }
    catch (err) { if (err.status === 404 || err.status === 405) res = await api.post('/api/input', payload, { timeout: 90000 }); else throw err; }
    if (res?.chatId && res.chatId !== chatId) setChat(res.chatId);
    if (!$('#drawer').hidden) renderChats();
    if (!serverReachable) { serverReachable = true; updateBanner(); }
  } catch (err) {
    busy = false;
    live?.remove();
    clientLog('erro-cliente', `Falha ao enviar comando: ${err.message}`, 'warn');
    if (err.offline || err.timeout) { serverReachable = !err.offline; updateBanner(); return offlineFallback(text, err); }
    setState('error', 'FALHA'); sounds.error();
    addMsg('system', `⚠ ${err.message}`);
    return;
  }
  busy = false;
  $('#sys-latency').textContent = `${Math.round(performance.now() - t0)} ms`;
  $('#sys-tone').textContent = (res.mode || res.tone || '—').toUpperCase();
  // IA do navegador como reserva gratuita: só quando o servidor não tem IA e o navegador tem.
  if (res.wantsAI && browserAIState().availability === 'available') {
    try {
      setState('thinking', 'IA DO NAVEGADOR');
      const answer = await askBrowserAI(text);
      if (answer) res = { ...res, text: answer, speech: answer, intent: 'conversation.browser-ai', source: 'IA do navegador', success: true };
    } catch (err) { clientLog('cerebro', `IA do navegador falhou: ${err.message}`, 'warn'); }
  }
  bus.emit(EVENTS.RESPONSE_RECEIVED, res);
  if (res.intent) { bus.emit(EVENTS.COMMAND_DETECTED, res); recentCommand(res.intent, res.module, res.success !== false || /^conversation/.test(res.intent)); }
  live?.remove(); // a versão final (com etiqueta e botões) substitui o balão parcial
  addMsg('jarvis', res.text, { tag: res.module, confirm: res.awaitingConfirmation });
  document.body.classList.toggle('silent', !!res.silent);
  if (res.intent?.startsWith('system.silent')) { await refreshSettings(); }
  applyUi(res);
  const actions = res.clientActions || [];
  if (actions.includes('stopSpeech')) { stopAll('comando parar'); return; }
  if (actions.includes('pauseSpeech')) { togglePause(); return; }
  if (actions.includes('resumeSpeech')) { if (isPaused()) togglePause(); return; }
  if (res.error) setState('error');
  if (res.ui?.panel === 'selftest') { setState('standby', 'DIAGNÓSTICO'); return; }
  await say(res.speech);
  const s = getSettings();
  const asked = res.awaitingConfirmation || /\?\s*$/.test(res.text || '');
  if (source === 'voice' && s?.hearing?.continuousConversation && asked && !isSpeaking()) startListening({ chime: true, quiet: true });
  else if (getState() !== 'error') setState('standby');
}

/** Servidor inacessível: responde o que der localmente, sem fingir o resto. */
function offlineFallback(text, err) {
  const local = offlineAnswer(text);
  const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let cachedBible = null;
  try { cachedBible = /biblia|leitura|onde parei/.test(norm) ? JSON.parse(localStorage.getItem('jarvis.bible') || 'null') : null; } catch {}
  if (local) { addMsg('jarvis', local, { tag: 'LOCAL' }); recentCommand('offline.local', 'LOCAL'); say(local); setState('standby', 'SERVIDOR OFFLINE'); return; }
  if (cachedBible) {
    showBible({ ...cachedBible, message: null });
    const msg = `Servidor inacessível: mostrando a última página salva (${cachedBible.ref.label}, página ${cachedBible.pageIndex + 1}). Virar páginas e registrar progresso exige o servidor.`;
    addMsg('jarvis', msg, { tag: 'LOCAL' }); setState('standby', 'SERVIDOR OFFLINE'); return;
  }
  setState('error', err.offline ? 'SEM SERVIDOR' : 'TEMPO ESGOTADO');
  sounds.error();
  addMsg('system', `⚠ ${err.message} ${OFFLINE_NOTICE}`);
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
    case 'selftest': runSelfTest({ speakResult: (t) => { addMsg('jarvis', t, { tag: 'SISTEMA' }); return say(t); } }); break;
    case 'modules': showModules(); break;
    case 'house': showHouse(); break;
    case 'agenda': showAgenda(); break;
    default: break;
  }
}

// ============================================================ ouvido
let listenStarting = false;
// manual: veio de um TOQUE no microfone → termina só quando você tocar de novo (configurável).
async function startListening({ chime = true, greet = null, quiet = false, manual = false } = {}) {
  if (!hearingSupported) {
    addMsg('system', 'Reconhecimento de voz não suportado neste navegador. Digite seu comando no campo abaixo (para falar, use Chrome, Edge ou o navegador do Android).');
    $('#command-input').focus();
    return;
  }
  if (!window.isSecureContext) { addMsg('system', '⚠ O microfone exige HTTPS (ou localhost). Veja “Usar no Android” no README.'); return; }
  if (isListening()) { if (!finishListening()) { stopListening(); setState('standby'); } return; } // 2º toque: envia o que você falou
  // Trava: palmas + toque quase juntos não podem abrir duas escutas que disputam o microfone.
  if (listenStarting) return;
  listenStarting = true;
  try {
    stopAll('microfone aberto');
    const clapWasOn = !!wake?.status()?.clap?.running;
    await wake?.pause();
    // Espera o detector de palmas soltar o microfone antes de o Google começar a ouvir.
    if (clapWasOn && MIC_RELEASE_MS) await waitMicRelease();
    if (greet) await say(greet);
    if (chime) sounds.activate();
  } catch (err) { listenStarting = false; throw err; }
  // Só mostra OUVINDO quando o navegador confirmar (evento LISTEN_STARTED).
  setState('standby', 'ATIVANDO MICROFONE');
  const s = getSettings();
  await ensureStt(s);
  try {
    const tapToEnd = manual && s?.hearing?.endMode !== 'silence';
    if (tapToEnd) toast('🎙 Fale à vontade. Toque no microfone de novo para enviar.');
    const listening = listenOnce({ lang: s?.hearing?.lang || 'pt-BR', silenceMs: s?.hearing?.silenceMs || 1800, manual: tapToEnd });
    listenStarting = false; // a escuta já começou: um novo toque passa a encerrá-la
    const text = await listening;
    $('#interim').textContent = '';
    if (!text) {
      setState('standby');
      // Escuta pedida pelo usuário que não transcreveu nada: diz o motivo (nunca fica calado).
      const o = lastListenOutcome();
      // quiet: true → nunca avisa (escuta automática); 'silence' → só avisa se ouviu voz (palmas/"Jarvis").
      if (quiet !== true && !(quiet === 'silence' && !o.speech) && o.error !== 'aborted') {
        const why = !o.started ? 'O microfone não chegou a abrir. Toque no microfone de novo.'
          : !o.speech ? `Não ouvi sua voz. Fale logo depois do sinal, perto do microfone.${getSettings()?.clap?.enabled ? ' Se continuar, desligue as palmas em Configurações (elas usam o mesmo microfone).' : ''}${isAndroid && o.engine !== 'whisper' ? ' Confira também a permissão de microfone do app Google.' : ''}`
          : o.engine === 'whisper' ? 'Ouvi sua voz, mas o áudio não virou texto. Tente de novo.' : 'Ouvi sua voz, mas não consegui transcrever. Fale um pouco mais devagar e perto do microfone.';
        addMsg('system', `🎙 ${why}`);
        clientLog('ouvido', `Nada transcrito: microfone ${o.started ? 'abriu' : 'não abriu'}, voz ${o.speech ? 'detectada' : 'não detectada'}${o.error ? `, erro ${o.error}` : ''}`, 'warn');
      }
      return;
    }
    if (isEcho(text)) { clientLog('ouvido', 'Transcrição descartada: era a própria voz do JARVIS'); setState('standby'); return; }
    clientLog('ouvido', `Transcrição recebida (${text.length} caracteres)`);
    bus.emit(EVENTS.VOICE_RECEIVED, { text });
    if (attached.length) await sendWithMedia(text); // falou a pergunta sobre o anexo
    else await handleInput(text, 'voice');
  } catch (err) {
    $('#interim').textContent = '';
    setState('error', 'MICROFONE');
    sounds.error();
    addMsg('system', `⚠ ${err.message}`);
  } finally {
    listenStarting = false;
    wake?.resume(getSettings());
    updateChips();
  }
}

bus.on(EVENTS.LISTEN_STARTED, () => setState('listening'));
bus.on('mic:set', (s) => setMicState(s));
bus.on('mic:state', () => updateChips());
bus.on(EVENTS.VOICE_INTERIM, ({ text }) => { $('#interim').textContent = text; core?.pulse(0.25); });
bus.on(EVENTS.SPEECH_BOUNDARY, () => core?.pulse(0.35));
bus.on(EVENTS.STATE_CHANGED, ({ next }) => { core?.setState(next); updateChips(); });
bus.on(EVENTS.SPEECH_STARTED, () => updateTopStatus());
bus.on(EVENTS.SPEECH_FINISHED, () => updateTopStatus());
bus.on(EVENTS.CLAP_LEVEL, ({ peak, threshold }) => {
  $('#mic-level').style.width = `${Math.min(100, peak * 100)}%`;
  $('#clap-threshold').style.left = `${Math.min(99, threshold * 100)}%`;
});
bus.on(EVENTS.CLAP_DETECTED, () => core?.pulse(0.3));
// PALMS_DETECTED: duas palmas reconhecidas → "Sim?" → ouvir → cérebro → resposta.
bus.on(EVENTS.PALMS_DETECTED, (evt) => {
  if (evt?.test) return; // teste do diagnóstico: não inicia conversa
  if (currentSheet() === 'selftest') return; // auto-diagnóstico usando o microfone: palmas não abrem escuta no meio
  if (asleep) { wakeUp('duas palmas'); greetOnWake(); return; }
  if (isSpeaking() || isPaused()) { stopAll('duas palmas'); addMsg('system', '👏👏 Fala interrompida'); return; }
  if (busy || isListening()) return;
  addMsg('system', '👏👏 Duas palmas detectadas');
  startListening({ chime: false, greet: 'Sim?', quiet: 'silence' });
});
bus.on(EVENTS.VOICE_RECEIVED, ({ text, wake: isWake }) => {
  if (!isWake) return;
  const woke = wakeUp('Jarvis');
  if (woke && !(text && text.length > 1)) { greetOnWake(); return; }
  if (text && text.length > 1) handleInput(text, 'voice'); else startListening({ chime: false, greet: 'Sim?', quiet: 'silence' });
});
bus.on('bible:message', (msg) => { addMsg('jarvis', msg, { tag: 'BÍBLIA' }); if (/concluíd/.test(msg)) say(msg); });
bus.on(EVENTS.BIBLE_OPENED, (v) => { renderBibleMini(v); try { if (v && !v.error) localStorage.setItem('jarvis.bible', JSON.stringify(v)); } catch {} });
bus.on('sheet:open', () => core?.setCovered(window.innerWidth <= 820));
bus.on('sheet:close', () => core?.setCovered(false));

// ============================================================ status / módulos
function chip(id, cls, title) { const el = $(id); el.classList.remove('ok', 'warn', 'bad', 'active'); if (cls) el.classList.add(...cls.split(' ')); if (title) el.title = title; }
function updateChips() {
  const internet = navigator.onLine && lastStatus?.online !== false;
  chip('#chip-net', !serverReachable ? 'bad' : internet ? 'ok' : 'warn', !serverReachable ? 'Servidor inacessível' : internet ? 'Online' : 'Modo offline');
  chip('#chip-ai', lastStatus?.llm?.configured ? (lastStatus.llm.kind === 'local' || internet ? 'ok' : 'warn') : 'warn', lastStatus?.llm?.configured ? `${lastStatus.llm.state}: ${lastStatus.llm.providerName} · ${lastStatus.llm.model}` : 'IA INDISPONÍVEL (modo local inteligente)');
  const mic = micStatus();
  chip('#chip-mic', isListening() ? 'ok active' : mic === 'denied' || mic === 'unavailable' || !hearingSupported ? 'bad' : '', `Microfone: ${MIC_LABEL[mic]}${hearingSupported ? '' : ' · reconhecimento indisponível'}`);
  const ws = wake?.status() || {};
  chip('#chip-clap', ws.clap?.running ? 'ok' : ws.clap?.enabled ? 'warn' : '', ws.detail);
  document.body.classList.toggle('silent', !!getSettings()?.voice?.silent);
  $('#sys-mode').textContent = `${getSettings()?.security?.safeMode ? 'SEGURO · ' : ''}${getSettings()?.ui?.mode === 'economico' ? 'ECONÔMICO' : 'DESEMPENHO'}`;
  updateTopStatus();
}

/** Estado no topo: ONLINE · OUVINDO · PROCESSANDO · FALANDO · OFFLINE · LIMITADO. */
function updateTopStatus() {
  const el = $('#jarvis-status'); if (!el) return;
  const st = getState();
  const net = lastStatus?.internet?.state;
  let label, cls, why;
  if (st === 'listening') { label = 'OUVINDO'; cls = 'active'; why = 'Microfone ativo'; }
  else if (st === 'thinking') { label = 'PROCESSANDO'; cls = 'active'; why = 'Processando o pedido'; }
  else if (st === 'speaking' || isSpeaking()) { label = 'FALANDO'; cls = 'active'; why = 'Respondendo em voz alta'; }
  else if (!serverReachable) { label = 'OFFLINE'; cls = 'bad'; why = 'Servidor do JARVIS inacessível: só funções locais do aparelho.'; }
  else if (!navigator.onLine || lastStatus?.online === false || net === 'offline') { label = 'OFFLINE'; cls = 'bad'; why = 'Sem internet: Bíblia, memória, tarefas e cálculos funcionam; notícias e câmbio não.'; }
  else if (net === 'limited') { label = 'LIMITADO'; cls = 'warn'; why = `Internet limitada (${lastStatus.internet.label}).`; }
  else { label = 'ONLINE'; cls = 'ok'; why = `Sistemas online · ${lastStatus?.llm?.state || ''}`; }
  el.textContent = label; el.className = `sys-badge ${cls}`; el.title = why;
  const stopBtn = $('#stop-speech'); if (stopBtn) stopBtn.hidden = !(isSpeaking() || isPaused() || st === 'speaking');
}

function updateBanner() {
  const b = $('#banner');
  if (!serverReachable) { b.className = 'banner server'; b.textContent = '⚠ SERVIDOR INACESSÍVEL — FUNÇÕES LOCAIS'; b.hidden = false; }
  else if (!navigator.onLine || lastStatus?.online === false) { b.className = 'banner offline'; b.textContent = '📡 MODO OFFLINE'; b.hidden = false; }
  else b.hidden = true;
  updateChips();
}

function renderModules(status) {
  const grid = $('#module-grid');
  grid.innerHTML = status.modules.map((m) => `<li data-module="${esc(m.id)}" title="${esc(m.info)}" tabindex="0"><span class="m-name"><i class="m-dot ${esc(m.status)}"></i>${esc(m.name)}</span><span class="m-last">${m.last ? `${esc(m.last.event)} · ${relTime(m.last.at)}` : esc(m.info.split('.')[0])}</span></li>`).join('');
  $$('li', grid).forEach((li) => li.addEventListener('click', () => {
    const id = li.dataset.module;
    ({ biblia: () => handleInput('Bíblia'), noticias: () => handleInput('Notícias'), memoria: () => showMemory(history), tarefas: () => showMemory(history), casa: showHouse, sistema: showDiagnostics, cerebro: showDiagnostics, palmas: openSettings, voz: openSettings, ouvido: openSettings }[id] || showModules)();
  }));
}

async function refreshStatus() {
  try {
    lastStatus = await api.get('/api/status', { timeout: 15000 });
    serverReachable = true;
    renderModules(lastStatus);
    const ol = $('#recent-commands');
    if (ol.querySelector('.muted') && lastStatus.recentCommands.length) {
      ol.innerHTML = '';
      lastStatus.recentCommands.slice(0, 10).reverse().forEach((c) => recentCommand(c.name, c.module, c.ok));
    }
  } catch { serverReachable = false; }
  updateBanner();
}

async function refreshSettings() {
  try { applyServerSettings(await api.get('/api/settings')); applySettings(getSettings()); } catch {}
}

async function refreshMemoryMini() {
  try {
    const [m, t] = await Promise.all([api.get('/api/memory'), api.get('/api/tasks')]);
    const items = [...m.facts.map((x) => ['MEMÓRIA', x]), ...m.preferences.map((x) => ['PREFERÊNCIA', x]), ...t.tasks.map((x) => [x.dueAt ? `LEMBRETE · ${new Date(x.dueAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'TAREFA', x])].slice(-8).reverse();
    $('#mem-mini').innerHTML = items.length ? items.map(([k, x]) => `<li><small>${esc(k)}</small>${esc(x.text)}</li>`).join('') : '<li class="muted">Sem memórias.</li>';
  } catch {}
}

// ============================================================ configurações
function applySettings(s, changedKey) {
  if (!s) return;
  document.body.dataset.theme = s.ui.theme;
  const eco = s.ui.mode === 'economico';
  document.body.classList.toggle('eco', eco);
  document.body.classList.toggle('no-anim', !s.ui.animations);
  core?.configure({ eco, particles: s.ui.particles, animations: s.ui.animations });
  configureVoice({ rate: s.voice.rate, volume: s.voice.volume, pitch: s.voice.pitch, lang: s.voice.lang, voiceName: s.voice.voiceName, engine: s.voice.engine, neuralVoice: s.voice.neuralVoice });
  wake?.configure(s);
  // Modo econômico: menos atualizações de status.
  clearInterval(statusTimer); statusTimer = setInterval(refreshStatus, eco ? 180000 : 60000);
  if (changedKey === 'clap.enabled') {
    wake?.setClapEnabled(s.clap.enabled, s).then(() => { if (s.clap.enabled) toast('👏 Palmas ativas: bata duas vezes para me chamar. Mantenha o JARVIS aberto.'); updateChips(); })
      .catch((e) => { toast(e.message); saveSettings({ clap: { enabled: false } }); });
  }
  if (changedKey === 'hearing.wakeWord') wake?.setWakeWord(s.hearing.wakeWord, s);
  if (changedKey === 'hearing.engine' || changedKey === 'boot') { sttCheckedAt = 0; ensureStt(s); }
  if (changedKey === 'ui.keepAwake' || changedKey === 'boot') setKeepAwake(!!s.ui.keepAwake).then((ok) => { if (s.ui.keepAwake && !ok) toast('Este navegador não permite manter a tela ligada.'); });
  if (changedKey === 'voice.silent' && s.voice.silent) stopAll();
  if (changedKey === 'test-voice') {
    if (s.voice.silent) toast('Modo silencioso ativo.');
    else if (!['neural', 'espeak'].includes(s.voice.engine)) say('Olá. Esta é a minha voz atual.');
    else {
      // Testa de verdade a voz própria no servidor e diz o motivo se falhar.
      toast('Testando a voz…');
      if (s.voice.engine === 'espeak') { resetJarvisVoice(); say('Olá. Esta é a voz robótica offline.'); return; }
      api.get(`/api/tts/test?voice=${encodeURIComponent(s.voice.neuralVoice || '')}`).then((r) => {
        if (r.ok) { resetJarvisVoice(); addMsg('system', `🔊 Voz neural funcionando (gerada em ${r.ms} ms).`); say('Olá, senhor. Esta é a minha voz.'); }
        else { addMsg('system', `⚠️ Voz neural falhou: ${r.error}. Usando a voz do celular.`); say('Esta é a voz de reserva.'); }
      }).catch(() => { addMsg('system', '⚠️ Não consegui falar com o servidor do JARVIS para testar a voz.'); });
    }
  }
  updateChips();
}
function openSettings() { showSettings({ onChange: (s, key) => applySettings(s, key) }); }

// ============================================================ eventos de interface
// ---- Anexos: 📎 imagem(ns) ou vídeo para o JARVIS analisar ----
let attached = [];
function renderAttach() {
  const box = $('#attach-preview');
  box.hidden = !attached.length;
  box.replaceChildren(...attached.map((a, i) => {
    const d = document.createElement('div'); d.className = 'att';
    const el = document.createElement(a.kind === 'video' ? 'video' : 'img');
    if (a.kind === 'video') { el.src = a.url; el.muted = true; el.playsInline = true; } else if (a.thumb) el.src = a.thumb;
    if (a.kind !== 'video' && !a.thumb) el.alt = '📷';
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remover anexo');
    x.addEventListener('click', () => { URL.revokeObjectURL(a.url); attached.splice(i, 1); renderAttach(); });
    const k = document.createElement('span'); k.className = 'kind'; k.textContent = a.kind === 'video' ? '🎬' : '📷';
    d.append(el, k, x); return d;
  }));
  $('#command-input').placeholder = attached.length ? 'Pergunte algo sobre o anexo (ou só envie) ➤' : 'Fale ou digite um comando…  ( / para digitar · espaço para falar )';
}
function clearAttach() { for (const a of attached) URL.revokeObjectURL(a.url); attached = []; renderAttach(); }
$('#attach-btn').addEventListener('click', () => $('#attach-input').click());
$('#attach-input').addEventListener('change', async (e) => {
  const input = e.target;
  // Copia os arquivos para a memória NA HORA: no Android, a permissão de leitura de fotos
  // do Google Fotos/nuvem expira logo depois ("The requested file could not be read").
  const picked = [...input.files];
  const { copies, failed } = await attach.copyFiles(picked);
  input.value = '';
  if (failed) toast(attach.READ_HELP);
  if (!copies.length) return;
  const { items, note } = attach.classify(copies, attached);
  for (const a of attached) if (!items.includes(a)) URL.revokeObjectURL(a.url);
  attached = items.map((it) => (it.url ? it : { ...it, url: URL.createObjectURL(it.file) }));
  if (note) toast(note);
  renderAttach();
  // miniaturas em segundo plano (data URL: funciona mesmo onde blob: é bloqueado)
  for (const a of attached) if (a.kind === 'image' && !a.thumb) attach.thumbnail(a.file).then((t) => { if (t) { a.thumb = t; renderAttach(); } }).catch(() => {});
  $('#command-input').focus();
});
async function sendWithMedia(text) {
  if (busy) { toast('Aguarde, ainda estou processando…'); return; }
  const items = attached; attached = []; renderAttach();
  let media;
  try {
    setState('thinking', 'PREPARANDO');
    media = await attach.prepare(items, (step) => { $('#interim').textContent = step; });
  } catch (err) { setState('standby'); toast(attach.friendlyError(err)); return; }
  finally { $('#interim').textContent = ''; for (const a of items) URL.revokeObjectURL(a.url); }
  if (media.kind === 'video' && !media.transcript) clientLog('interface', 'Vídeo sem áudio transcrito (sem áudio, grande demais ou formato .mov)');
  return handleInput(text, 'text', { media });
}

$('#command-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#command-input');
  const v = input.value; input.value = '';
  if (attached.length) { sendWithMedia(v); return; }
  handleInput(v, 'text');
});
for (const id of ['#mic-btn', '#dock-mic', '#sheet-mic']) $(id).addEventListener('click', () => startListening({ manual: true }));
$('#core-button').addEventListener('click', () => {
  if (asleep) { wakeUp('toque'); greetOnWake(); return; }
  return isSpeaking() || isPaused() ? stopAll('toque no núcleo') : startListening({ manual: true });
});
$('#stop-btn').addEventListener('click', stopAll);
$('#stop-speech').addEventListener('click', () => { stopAll('botão parar'); updateTopStatus(); });
$('#pause-btn').addEventListener('click', togglePause);
// ============================================================ conversas (estilo ChatGPT)
// Cada conversa tem título e fica salva no servidor (data/chats.json).
let chatId = (() => { try { return localStorage.getItem('jarvis.chat') || null; } catch { return null; } })();
let chatFilter = '';
let chatQuery = '';
function setChat(id) { chatId = id || null; try { if (chatId) localStorage.setItem('jarvis.chat', chatId); else localStorage.removeItem('jarvis.chat'); } catch {} }
function groupOf(iso) {
  const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0);
  const days = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return days <= 0 ? 'Hoje' : days === 1 ? 'Ontem' : days < 7 ? 'Últimos 7 dias' : days < 30 ? 'Últimos 30 dias' : 'Mais antigas';
}
function openDrawer() {
  $('#drawer').hidden = false; $('#drawer-backdrop').hidden = false;
  $('#chats-btn').setAttribute('aria-expanded', 'true');
  renderChats();
  setTimeout(() => $('#new-chat').focus(), 50);
}
function closeDrawer() {
  $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true;
  $('#chats-btn').setAttribute('aria-expanded', 'false');
}
async function renderChats() {
  const list = $('#chat-list');
  let data;
  try {
    const qs = new URLSearchParams({ ...(chatFilter ? { category: chatFilter } : {}), ...(chatQuery ? { q: chatQuery } : {}) });
    data = await api.get(`/api/chats?${qs}`);
  } catch (e) { list.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  $('#chat-filters').innerHTML = data.categories.length > 1 || chatFilter
    ? [`<button type="button" class="chip-f ${!chatFilter ? 'on' : ''}" data-f="">Todas</button>`, ...data.categories.map((c) => `<button type="button" class="chip-f ${chatFilter === c.id ? 'on' : ''}" data-f="${esc(c.id)}">${esc(c.label)}</button>`)].join('') : '';
  if (!data.chats.length) { list.innerHTML = `<p class="muted">${chatQuery || chatFilter ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda. Fale comigo e ela aparece aqui com um título.'}</p>`; return; }
  let html = ''; let last = null;
  for (const c of data.chats) {
    const g = groupOf(c.updatedAt);
    if (g !== last) { html += `<h5>${g}</h5>`; last = g; }
    html += `<div class="chat-item ${c.id === chatId ? 'active' : ''}"><button type="button" class="chat-open" data-id="${esc(c.id)}"><b>${esc(c.title)}</b><small>${esc(c.preview)}</small></button><button type="button" class="icon-btn chat-ren" data-id="${esc(c.id)}" aria-label="Renomear “${esc(c.title)}”" title="Renomear">✎</button><button type="button" class="icon-btn chat-del" data-id="${esc(c.id)}" aria-label="Apagar “${esc(c.title)}”" title="Apagar">🗑</button></div>`;
  }
  list.innerHTML = html;
}
function showChatMessages(c) {
  $('#transcript').innerHTML = '';
  history.length = 0;
  for (const m of c.messages) addMsg(m.role === 'user' ? 'user' : 'jarvis', m.text, { tag: m.role === 'user' ? undefined : (m.tag || undefined) });
}
async function openChat(id) {
  try {
    const c = await api.get(`/api/chats/${id}`);
    stopAll();
    setChat(c.id);
    showChatMessages(c);
    addMsg('system', `Conversa “${c.title}” aberta.`);
    closeDrawer();
  } catch (e) { toast(e.message); }
}
function newChat() {
  stopAll();
  setChat(null);
  $('#transcript').innerHTML = '';
  history.length = 0;
  addMsg('jarvis', 'Nova conversa. Como posso ajudar?', { tag: 'SISTEMA' });
  closeDrawer();
  $('#command-input').focus();
}
/** Ao abrir o JARVIS, a última conversa volta para a tela. */
async function restoreChat() {
  if (!chatId) return;
  try { showChatMessages(await api.get(`/api/chats/${chatId}`)); }
  catch (e) { if (e.status === 404) setChat(null); }
}
$('#chats-btn').addEventListener('click', () => ($('#drawer').hidden ? openDrawer() : closeDrawer()));
$('#drawer-close').addEventListener('click', closeDrawer);
$('#drawer-backdrop').addEventListener('click', closeDrawer);
$('#new-chat').addEventListener('click', newChat);
let searchTimer = null;
$('#chat-search').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { chatQuery = e.target.value.trim(); renderChats(); }, 250); });
$('#drawer').addEventListener('click', async (e) => {
  const f = e.target.closest('.chip-f'); if (f) { chatFilter = f.dataset.f; renderChats(); return; }
  const o = e.target.closest('.chat-open'); if (o) { openChat(o.dataset.id); return; }
  const rn = e.target.closest('.chat-ren');
  if (rn) {
    const cur = rn.closest('.chat-item').querySelector('b').textContent;
    const t = window.prompt('Novo título da conversa:', cur);
    if (t && t.trim()) { try { await api.patch(`/api/chats/${rn.dataset.id}`, { title: t.trim() }); renderChats(); } catch (err) { toast(err.message); } }
    return;
  }
  const del = e.target.closest('.chat-del');
  if (del) {
    if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Apagar?'; del.classList.add('armed'); setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = '🗑'; del.classList.remove('armed'); } }, 4000); return; }
    try {
      await api.del(`/api/chats/${del.dataset.id}?confirm=true`);
      if (del.dataset.id === chatId) newChat(); else renderChats();
      toast('Conversa apagada.');
    } catch (err) { toast(err.message); }
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) { e.stopImmediatePropagation(); closeDrawer(); } }, true);

const PANELS = {
  conversas: () => openDrawer(),
  memory: () => showMemory(history), settings: openSettings, diagnostics: showDiagnostics, modules: showModules, house: showHouse,
  menu: () => showMenu({
    bible: () => handleInput('Bíblia'), news: () => handleInput('Notícias'), memory: () => showMemory(history), modules: showModules, house: showHouse, settings: openSettings, diagnostics: showDiagnostics,
    conversas: () => { closeSheet(); openDrawer(); },
    agenda: () => showAgenda(),
    clap: () => { const s = getSettings(); saveSettings({ clap: { enabled: !s.clap.enabled } }).then((n) => applySettings(n, 'clap.enabled')); closeSheet(); },
    stop: () => { stopAll(); closeSheet(); },
  }),
};
document.addEventListener('click', (e) => {
  const sayBtn = e.target.closest('[data-say]'); if (sayBtn) handleInput(sayBtn.dataset.say, 'text');
  const openBtn = e.target.closest('[data-open]'); if (openBtn) PANELS[openBtn.dataset.open]?.();
});

// Atalhos de teclado (PC)
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (isSpeaking() || isPaused()) stopAll(); else if (isListening()) { stopListening(); setState('standby'); } else closeSheet(); return; }
  if (typing) return;
  if (currentSheet() === 'bible' && (e.key === 'ArrowRight' || e.key === 'PageDown')) { e.preventDefault(); bibleActions.next(); return; }
  if (currentSheet() === 'bible' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) { e.preventDefault(); bibleActions.prev(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); startListening({ manual: true }); }
  else if (k === '/') { e.preventDefault(); $('#command-input').focus(); }
  else if (k === 'p') togglePause();
  else if (k === 'b') handleInput('Bíblia');
  else if (k === 'n') handleInput('Notícias');
  else if (k === 'm') showMemory(history);
  else if (k === 's') openSettings();
  else if (k === 'd') showDiagnostics();
});

window.addEventListener('online', () => { toast('Conexão restabelecida.'); refreshStatus(); });
window.addEventListener('offline', updateBanner);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && getSettings()?.clap?.enabled) clientLog('palmas', 'App em segundo plano: o navegador pode suspender o microfone');
  if (!document.hidden) { refreshStatus(); updateChips(); }
});

// ============================================================ lembretes (servidor → navegador)
async function onReminder(evt) {
  // Rotina com ação (notícias, clima, meu dia…): executa o comando como se você tivesse pedido.
  if (evt.payload.command) {
    addMsg('system', `⏰ Rotina: ${evt.payload.text}`);
    notify('JARVIS — Rotina', evt.payload.text).catch(() => {});
    for (let i = 0; i < 60 && (busy || isListening()); i++) await new Promise((r) => setTimeout(r, 500)); // espera terminar o que estiver fazendo
    handleInput(evt.payload.command, 'routine');
    return;
  }
  const text = `⏰ Lembrete: ${evt.payload.text}`;
  addMsg('jarvis', text, { tag: 'TAREFAS' });
  sounds.activate();
  const shown = await notify('JARVIS — Lembrete', evt.payload.text);
  if (!shown && document.hidden) clientLog('tarefas', 'Lembrete sem notificação (permissão não concedida)');
  if (!document.hidden) say(`Lembrete: ${evt.payload.text}`);
  refreshMemoryMini();
}

// ============================================================ PWA: atualização
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    const offer = (w) => {
      $('#update-bar').hidden = false;
      $('#update-btn').onclick = () => w.postMessage('SKIP_WAITING');
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => clientLog('interface', `Service worker não registrado: ${e.message}`, 'warn'));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
}

// ============================================================ relógio
function tick() {
  const now = new Date();
  $('#clock-time').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('#clock-date').textContent = now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  $('#sys-uptime').textContent = `${Math.floor((Date.now() - startedAt) / 60000)} min`;
}

// ============================================================ inicialização
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function bootLog(text, ok = true) {
  const li = document.createElement('li'); li.className = ok ? 'ok' : 'warn'; li.textContent = text;
  $('#boot-log').appendChild(li);
  await wait(110);
}

async function boot() {
  core = createCore($('#core-canvas'));
  tick(); setInterval(tick, 1000);
  setupServiceWorker();
  await initMicState();
  try {
    lastStatus = await api.get('/api/status', { timeout: 15000 });
    applyServerSettings(lastStatus.settings);
    renderModules(lastStatus);
  } catch (err) {
    serverReachable = false;
    clientLog('interface', `Boot sem servidor: ${err.message}`, 'warn');
  }
  // Sequência de inicialização com o estado REAL de cada parte.
  const ai = lastStatus?.llm;
  await bootLog(serverReachable ? (ai?.configured ? `Cérebro online · ${ai.state || 'IA'} ${ai.providerName}` : 'Cérebro online · modo local inteligente (IA não configurada)') : 'Cérebro: servidor inacessível — funções locais', serverReachable);
  await bootLog(hearingSupported && window.isSecureContext ? 'Ouvido online.' : hearingSupported ? 'Ouvido: requer HTTPS.' : 'Ouvido indisponível neste navegador.', hearingSupported && window.isSecureContext);
  await bootLog(voiceSupported ? 'Voz online.' : 'Voz indisponível neste navegador.', voiceSupported);
  const bai = await checkBrowserAI().catch(() => null);
  if (!ai?.configured && bai?.availability === 'available') await bootLog('IA do navegador disponível (reserva gratuita).');
  await bootLog(serverReachable ? 'Memória online.' : 'Memória: aguardando servidor.', serverReachable);
  if (serverReachable && lastStatus?.online === false) await bootLog('Modo offline: sem internet no servidor.', false);
  await bootLog('JARVIS pronto.');
  $('#boot-text').textContent = 'SISTEMAS PRONTOS';
  applySettings(getSettings() || {}, null);
  updateBanner();
  if (serverReachable) {
    api.get(`/api/bible?pageSize=${pageSize()}`, { timeout: 20000 }).then(renderBibleMini).catch(() => {});
    refreshMemoryMini();
    restoreChat();
  }
  serverEvents((evt) => {
    bus.emit(EVENTS.SERVER_EVENT, evt);
    if (evt.type === 'REMINDER_DUE') onReminder(evt);
    if (evt.type === 'AI_BENCHMARK_START' && evt.payload?.auto) addMsg('system', '⚙ Ajustando a velocidade da IA ao seu aparelho (só na primeira vez, cerca de 1 minuto). Enquanto isso, as respostas da IA podem demorar.');
    if (evt.type === 'AI_BENCHMARK_DONE' && evt.payload?.text) { addMsg('jarvis', evt.payload.text, { tag: 'SISTEMA' }); if (evt.payload.speech) say(evt.payload.speech); }
    if (evt.type === 'MEMORY_UPDATED') refreshMemoryMini();
    if (evt.type === 'BATTERY_LOW') { const t = `🔋 Bateria em ${evt.payload?.percent}%. Coloque o celular para carregar (sem bateria o JARVIS desliga).`; addMsg('system', t); notify('JARVIS — Bateria fraca', t).catch(() => {}); if (!asleep) say(`Bateria em ${evt.payload?.percent} por cento. Coloque para carregar.`); }
    if (evt.type === 'MEMORY_LEARNED' && evt.payload?.items?.length) { addMsg('system', `🧠 Anotei: ${evt.payload.items.join(' · ')}`); refreshMemoryMini(); }
    if (['MEMORY_UPDATED', 'BIBLE_DAY_COMPLETED', 'NEWS_FETCHED', 'HOUSE_ACTION', 'LLM_ERROR'].includes(evt.type)) refreshStatus();
  });
  // Um toque inicial é exigido pelos navegadores para liberar áudio e microfone.
  const start = $('#boot-start');
  start.hidden = false;
  start.focus();
  start.addEventListener('click', async () => {
    unlockVoice(); sounds.unlock();
    $('#boot').classList.add('hide');
    setTimeout(() => $('#boot').remove(), 700);
    setState('standby');
    bus.emit(EVENTS.ASSISTANT_STARTED);
    const s = getSettings();
    if (s && wake) {
      try { await wake.start(s); } catch (e) { toast(e.message); }
    }
    applySettings(s, 'boot');
    const h = new Date().getHours();
    const nome = lastStatus?.personality?.nome_usuario;
    const greet = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${nome ? `, ${nome}` : ''}. JARVIS online.`;
    // Atalhos do app instalado (manifest "shortcuts")
    const cmd = new URLSearchParams(location.search).get('cmd');
    const SHORT = { biblia: 'Bíblia', noticias: 'Notícias', 'meu-dia': 'Meu dia' };
    if (SHORT[cmd]) { window.history.replaceState(null, '', '/'); setTimeout(() => handleInput(SHORT[cmd]), 400); }
    if (s?.ui?.startAsleep !== false && !SHORT[cmd]) {
      // Começa DORMINDO: só acorda com duas palmas (principal) ou "Jarvis".
      addMsg('system', `💤 ${!serverReachable ? 'Servidor inacessível — funções locais. ' : ''}JARVIS dormindo. Bata duas palmas ou diga “Jarvis” para me acordar.`, 'SISTEMA');
      sleepNow({ quiet: true });
      return;
    }
    addMsg('jarvis', `${greet} ${!serverReachable ? OFFLINE_NOTICE : ai?.configured ? `Como posso ajudar? (${ai.state})` : 'Estou no modo local inteligente (IA conversacional não configurada no servidor). Diga “ajuda” para ver os comandos.'}`, { tag: 'SISTEMA' });
    say(greet);
  }, { once: true });
}

boot();
window.addEventListener('beforeunload', () => { stopAll(); wake?.stop(); });
