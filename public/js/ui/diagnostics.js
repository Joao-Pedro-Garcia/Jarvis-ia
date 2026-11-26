// DIAGNÓSTICO JARVIS: semáforo por componente (toque para ver o motivo) e
// AUTO-DIAGNÓSTICO com testes reais (servidor + navegador).
// Regra: nada aparece como OK sem evidência real (teste executado ou evento
// confirmado pelo navegador). Sem evidência: NÃO VERIFICADO, com o motivo.
import { $, $$, esc, fmtDateTime, confirmButton, toast } from './dom.js';
import { openSheet, currentSheet } from './sheet.js';
import { api } from '../core/api.js';
import { getSettings } from '../core/settings.js';
import { environmentChecks, micStatus, MIC_LABEL, testMicrophone, notificationState, micPermission, storageCheck, pwaCheck, httpsState, requestNotifications, NOTIFICATION_HELP, notify } from '../modules/device.js';
import { voiceSupported, speak, testVoice, lastPlaybackAt, waitVoices, listVoices } from '../modules/voice.js';
import { clapDiagnostics, testClaps } from '../modules/clap.js';
import { browserAIState } from '../modules/browser-ai.js';
import { wake } from '../modules/wake/index.js';

const DOT = { ok: '🟢', limited: '🟡', fail: '🔴', error: '⛔', unknown: '⚪' };
const LABEL = { ok: 'OK', limited: 'LIMITADO', fail: 'INDISPONÍVEL', error: 'ERRO', unknown: 'NÃO VERIFICADO' };
const ORDER = [['cerebro', 'CÉREBRO'], ['ouvido', 'OUVIDO'], ['voz', 'VOZ'], ['palmas', 'PALMAS'], ['memoria', 'MEMÓRIA'], ['biblia', 'BÍBLIA'], ['noticias', 'NOTÍCIAS'], ['cambio', 'CÂMBIO'], ['combustiveis', 'COMBUSTÍVEIS'], ['tarefas', 'TAREFAS'], ['internet', 'INTERNET'], ['ia', 'IA'], ['microfone', 'MICROFONE'], ['permissoes', 'PERMISSÕES'], ['pwa', 'PWA'], ['armazenamento', 'ARMAZENAMENTO']];
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Resultados dos testes reais feitos neste aparelho (sessão atual).
const tests = {};
export const lastTests = () => ({ ...tests });

/** Componentes do navegador (estado real, sem simular). */
export async function clientComponents() {
  const env = environmentChecks();
  const s = getSettings() || {};
  const mic = micStatus();
  const perm = await micPermission();
  const https = httpsState();
  const notif = notificationState();
  const [store, pwa] = await Promise.all([storageCheck(), pwaCheck()]);
  const cd = clapDiagnostics();
  const ws = wake?.status() || {};
  const c = {};

  c.ouvido = !env.recognition ? { status: 'fail', detail: `Reconhecimento de voz não suportado neste navegador (${env.browser}). Use Chrome, Edge ou o navegador do Android — ou digite seus comandos.` }
    : https.status !== 'ok' ? { status: 'fail', detail: https.detail }
    : perm === 'denied' || mic === 'denied' ? { status: 'fail', detail: 'Permissão do microfone NEGADA. Libere no cadeado da barra de endereço → Permissões → Microfone.' }
    : mic === 'unavailable' ? { status: 'fail', detail: 'Nenhum microfone disponível.' }
    : !navigator.onLine ? { status: 'limited', detail: `${env.browser}: sem internet o reconhecimento de fala do Chrome não funciona. Use texto.` }
    : perm === 'prompt' ? { status: 'limited', detail: `${env.browser}: Web Speech API presente, mas a permissão do microfone ainda não foi concedida (toque no microfone ou em "Testar microfone").` }
    : { status: 'ok', detail: `${env.browser}: Web Speech API presente, permissão concedida · idioma ${s.hearing?.lang || 'pt-BR'} · microfone ${MIC_LABEL[mic]}` };

  if (tests.voz) c.voz = { ...tests.voz, detail: `${tests.voz.detail} (teste real às ${hhmm(tests.voz.at)})` };
  else if (!env.synthesis) c.voz = { status: 'fail', detail: 'Síntese de voz indisponível neste navegador: respostas só em texto.' };
  else if (s.voice?.silent) c.voz = { status: 'limited', detail: 'Modo silencioso ativo (responde só na tela).' };
  else if (!s.voice?.enabled) c.voz = { status: 'limited', detail: 'Voz desligada nas configurações.' };
  else if (lastPlaybackAt()) { await waitVoices(300); const pt = listVoices('pt').length; c.voz = { status: pt ? 'ok' : 'limited', detail: `O navegador confirmou fala às ${hhmm(lastPlaybackAt())}. ${pt ? `${pt} voz(es) em português.` : 'Nenhuma voz em português instalada: fala com voz de outro idioma.'}` }; }
  else c.voz = { status: 'unknown', detail: 'Ainda sem fala confirmada pelo navegador. Toque em "Testar voz".' };

  if (tests.palmas && Date.now() - Date.parse(tests.palmas.at) < 30 * 60000) c.palmas = { ...tests.palmas, detail: `${tests.palmas.detail} (teste real às ${hhmm(tests.palmas.at)})` };
  else if (!s.clap?.enabled) c.palmas = { status: 'limited', detail: 'Desligado nas configurações. Ative em Configurações → Palmas, ou toque em "Testar palmas".' };
  else if (cd.running && cd.audioContext === 'running') c.palmas = { status: document.hidden ? 'limited' : 'ok', detail: `Detector ativo (${cd.mode === 'worklet' ? 'AudioWorklet' : 'AnalyserNode'}, AudioContext ${cd.audioContext}, limiar ${cd.threshold.toFixed(2)}, pico ouvido ${cd.maxPeak.toFixed(2)})${cd.lastDetection ? ` · última detecção ${hhmm(cd.lastDetection)}` : ''}. ${document.hidden ? 'App em segundo plano: o navegador pode suspender o microfone.' : 'Funciona com o JARVIS aberto e em primeiro plano.'}` };
  else if (cd.running) c.palmas = { status: 'limited', detail: `Detector ligado, mas o AudioContext está "${cd.audioContext}". Toque na tela para liberar o áudio.` };
  else c.palmas = { status: 'limited', detail: ws.detail || 'Pausado (microfone em uso pelo reconhecimento de fala).' };

  if (tests.microfone) c.microfone = { ...tests.microfone, detail: `${tests.microfone.detail} (teste real às ${hhmm(tests.microfone.at)})` };
  else if (!env.micApi) c.microfone = { status: 'fail', detail: 'Este navegador não oferece acesso ao microfone.' };
  else if (perm === 'denied') c.microfone = { status: 'fail', detail: 'Permissão NEGADA. Libere no cadeado da barra de endereço.' };
  else c.microfone = { status: 'unknown', detail: `Permissão: ${{ granted: 'concedida', prompt: 'ainda não pedida', unknown: 'desconhecida' }[perm] || perm}. O acesso real ainda não foi testado: toque em "Testar microfone".` };

  const permIssues = [];
  if (https.status !== 'ok') permIssues.push(https.detail);
  if (perm === 'denied') permIssues.push('Microfone: NEGADO.');
  if (notif === 'denied') permIssues.push('Notificações: BLOQUEADAS (veja como ativar abaixo).');
  if (notif === 'default') permIssues.push('Notificações: ainda não pedidas.');
  if (perm === 'prompt') permIssues.push('Microfone: ainda não pedido.');
  c.permissoes = { status: perm === 'denied' || https.status !== 'ok' ? 'fail' : permIssues.length ? 'limited' : 'ok',
    detail: `${https.detail} Microfone: ${{ granted: 'concedido', prompt: 'não pedido', denied: 'NEGADO', unknown: 'desconhecido' }[perm]}. Notificações: ${{ granted: 'permitidas', denied: 'BLOQUEADAS', default: 'não pedidas', unsupported: 'não suportadas' }[notif]}.${permIssues.length ? ` Pendências: ${permIssues.join(' ')}` : ''}` };

  c.pwa = !pwa.serviceWorker ? { status: 'fail', detail: 'Navegador sem service worker: sem modo offline nem instalação.' }
    : !pwa.manifest ? { status: 'error', detail: 'Manifest inválido ou inacessível.' }
    : !pwa.swActive ? { status: 'limited', detail: 'Service worker ainda não ativo (recarregue a página uma vez).' }
    : { status: 'ok', detail: `Manifest OK · ${pwa.icons} ícones 192/512 · service worker ativo${pwa.swWaiting ? ' · NOVA VERSÃO aguardando (toque em Atualizar)' : ''} · ${pwa.standalone ? 'rodando como app instalado' : 'aberto no navegador (instalável pelo menu "Instalar app")'}.` };

  c.armazenamento = !store.localStorage ? { status: 'fail', detail: 'O navegador bloqueou o armazenamento local (modo privado?). Seus dados continuam salvos no servidor.' }
    : { status: 'ok', detail: `Armazenamento local do navegador OK (leitura e escrita testadas)${store.quota ? ` · usando ${(store.usage / 1048576).toFixed(1)} MB de ${(store.quota / 1048576).toFixed(0)} MB` : ''}${store.persisted ? ' · persistente' : ''}. Progresso, memória e tarefas ficam salvos no servidor (data/).` };
  return c;
}

function grid(components) {
  return `<div class="diag-grid">${ORDER.map(([id, name]) => {
    const c = components[id] || { status: 'unknown', detail: 'Sem informação' };
    return `<button class="diag-item ${c.status}" data-id="${id}" aria-label="${name}: ${LABEL[c.status]}"><span class="dot">${DOT[c.status]}</span><b>${name}</b><small>${esc(c.state && c.status !== 'ok' && c.status !== 'unknown' ? c.state : LABEL[c.status])}</small></button>`;
  }).join('')}</div><div class="diag-reason" id="diag-reason" aria-live="polite">Toque em um componente para ver o motivo.</div>`;
}

function notifBlock() {
  const st = notificationState();
  return `<fieldset class="fieldset"><legend>NOTIFICAÇÕES</legend>
    <p class="hint" style="margin-top:0">Estado: <b id="notif-diag-state">${{ granted: '🟢 PERMITIDAS', denied: '🔴 BLOQUEADAS', default: '🟡 NÃO SOLICITADAS', unsupported: '🔴 NÃO SUPORTADAS' }[st]}</b></p>
    <p class="hint" id="notif-help">${esc(NOTIFICATION_HELP[st])}</p>
    <div class="diag-actions">${st !== 'unsupported' && st !== 'granted' ? '<button class="btn" id="notif-enable">🔔 ATIVAR NOTIFICAÇÕES</button>' : ''}<button class="btn small" id="notif-recheck">Verificar de novo</button>${st === 'granted' ? '<button class="btn small" id="notif-test">Enviar notificação de teste</button>' : ''}</div></fieldset>`;
}

let refreshTimer = null;
let paused = false;
export async function showDiagnostics() {
  openSheet('diagnostics', 'DIAGNÓSTICO JARVIS', async (body) => {
    body.innerHTML = '<p class="muted">Verificando…</p>';
    const render = async () => {
      if (currentSheet() !== 'diagnostics') { clearInterval(refreshTimer); return; }
      if (paused) return;
      const [status, logs, client] = await Promise.all([api.get('/api/status').catch(() => null), api.get('/api/logs?limit=120').catch(() => ({ logs: [] })), clientComponents()]);
      const comps = { ...(status?.components || { cerebro: { status: 'fail', detail: 'Servidor inacessível' }, internet: { status: navigator.onLine ? 'unknown' : 'fail', detail: 'Servidor inacessível' } }), ...client };
      const bai = browserAIState();
      if (comps.ia && comps.ia.status === 'fail' && bai.availability === 'available') comps.ia = { status: 'limited', detail: `${comps.ia.detail} · IA DO NAVEGADOR disponível neste aparelho e usada como reserva.`, state: 'IA DO NAVEGADOR' };
      else if (comps.ia) comps.ia = { ...comps.ia, detail: `${comps.ia.detail} · IA do navegador: ${bai.reason}` };
      const env = environmentChecks();
      const perm = await micPermission();
      const open = body.querySelector('#diag-reason')?.dataset.id;
      const https = httpsState();
      body.innerHTML = `
        ${grid(comps)}
        <div class="diag-actions"><button class="btn" id="run-selftest">🩺 Fazer diagnóstico completo</button><button class="btn" id="diag-mic">🎙 Testar microfone</button><button class="btn" id="diag-voice">🔊 Testar voz</button><button class="btn" id="diag-clap">👏 Testar palmas</button></div>
        <div class="meter" id="diag-mic-meter" hidden><span id="diag-meter-label">Fale algo…</span><div class="meter-bar"><i id="diag-mic-level"></i><b id="diag-clap-th"></b></div></div>
        <div class="diag-reason" id="diag-test-out" hidden></div>
        ${notifBlock()}
        <fieldset class="fieldset"><legend>ANDROID / MICROFONE</legend>
          <div class="switch"><span>HTTPS</span><b>${https.status === 'ok' ? (location.protocol === 'https:' ? '🟢 OK' : '🟢 LOCALHOST (desenvolvimento)') : '🔴 SEM HTTPS'}</b></div>
          <div class="switch"><span>Permissão do microfone</span><b>${{ granted: '🟢 CONCEDIDA', prompt: '🟡 AINDA NÃO PEDIDA', denied: '🔴 NEGADA', unknown: '⚪ DESCONHECIDA' }[perm]}</b></div>
          <div class="switch"><span>Microfone agora</span><b>${!env.micApi ? '🔴 INDISPONÍVEL' : { active: '🟢 OUVINDO', inactive: '⚪ EM ESPERA (não está ouvindo)', denied: '🔴 SEM PERMISSÃO', unavailable: '🔴 INDISPONÍVEL' }[micStatus()]}</b></div>
          <div class="switch"><span>Reconhecimento de fala</span><b>${env.recognition ? '🟢 SUPORTADO' : '🔴 NÃO SUPORTADO'}</b></div>
          <div class="switch"><span>App instalado (PWA)</span><b>${env.standalone ? '🟢 SIM' : '🟡 ABERTO NO NAVEGADOR'}</b></div>
          <p class="hint">Navegador: ${esc(env.browser)} · Detector de ativação: ${esc(wake?.name || 'nenhum')} · ${esc(wake?.limitations().join(' ') || '')}</p>
        </fieldset>
        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:14px"><h4 class="h4">LOGS RECENTES</h4>
          <div><select id="log-filter" class="inline-input"><option value="">Todos</option><option value="error">Erros</option><option value="warn">Avisos</option></select> <button class="btn small" id="log-clear">Limpar logs</button></div></div>
        <div class="log-list" id="log-list"></div>
        <p class="hint">${status ? `Servidor: internet ${esc(status.internet?.label || (status.online ? 'ONLINE' : 'OFFLINE'))} · ${esc(status.llm.state || '')}${status.llm.configured ? ` (${esc(status.llm.providerName)} · ${esc(status.llm.model)})` : ''} · Fuso: ${esc(status.timezone)} · v${esc(status.version)}` : 'Servidor inacessível.'} Atualiza a cada 10 s.</p>`;
      const reason = $('#diag-reason', body);
      $$('.diag-item', body).forEach((b) => b.addEventListener('click', () => { const c = comps[b.dataset.id]; reason.dataset.id = b.dataset.id; reason.textContent = `${b.querySelector('b').textContent}: ${LABEL[c?.status || 'unknown']} — ${c?.detail || 'sem informação'}`; }));
      if (open) $(`.diag-item[data-id="${open}"]`, body)?.click();
      const renderLogs = (list) => { $('#log-list', body).innerHTML = list.map((l) => `<div class="${l.level}">${fmtDateTime(l.at)} [${esc(l.level)}] ${esc(l.category)}: ${esc(l.message)}</div>`).join('') || '<div class="muted">Sem registros.</div>'; };
      renderLogs(logs.logs);
      $('#log-filter', body).addEventListener('change', async (e) => renderLogs((await api.get(`/api/logs?limit=150${e.target.value ? `&level=${e.target.value}` : ''}`)).logs));
      confirmButton($('#log-clear', body), async () => { await api.del('/api/logs?confirm=true'); renderLogs([]); }, 'Confirmar?');
      $('#run-selftest', body).addEventListener('click', () => runSelfTest());
      const out = $('#diag-test-out', body);
      const show = (r) => { out.hidden = false; out.textContent = `${DOT[r.status]} ${LABEL[r.status]} — ${r.detail}`; };
      const exclusive = async (fn) => { paused = true; try { await fn(); } finally { paused = false; } };
      $('#diag-mic', body).addEventListener('click', () => exclusive(async () => {
        const meter = $('#diag-mic-meter', body); meter.hidden = false; $('#diag-meter-label', body).textContent = 'Fale algo…';
        const r = await testMicrophone({ onLevel: (v) => { const el = $('#diag-mic-level', body); if (el) el.style.width = `${Math.min(100, v * 160)}%`; } });
        tests.microfone = { status: r.ok ? 'ok' : r.steps.access === 'ok' ? 'limited' : 'fail', detail: r.reason, at: new Date().toISOString(), levelDb: r.levelDb };
        show(tests.microfone); meter.hidden = true;
        toast(`${DOT[tests.microfone.status]} ${r.reason}`, 6000);
      }));
      $('#diag-voice', body).addEventListener('click', () => exclusive(async () => {
        out.hidden = false; out.textContent = '🔊 Testando a voz (reprodução e interrupção)…';
        const r = await testVoice();
        tests.voz = { status: r.status, detail: r.detail, at: new Date().toISOString(), checks: r.checks };
        show(tests.voz);
        toast(`${DOT[r.status]} Voz: ${LABEL[r.status]}`, 4000);
      }));
      $('#diag-clap', body).addEventListener('click', () => exclusive(async () => {
        const meter = $('#diag-mic-meter', body); meter.hidden = false;
        $('#diag-meter-label', body).textContent = 'Bata DUAS palmas agora (8 s)…';
        const r = await testClaps(getSettings().clap, { onLevel: (peak, th) => { const el = $('#diag-mic-level', body); if (el) el.style.width = `${Math.min(100, peak * 100)}%`; const t = $('#diag-clap-th', body); if (t) t.style.left = `${Math.min(99, th * 100)}%`; } });
        const why = r.error ? r.error : r.detected ? `PALMS_DETECTED: duas palmas reconhecidas (${r.mode === 'worklet' ? 'AudioWorklet' : 'AnalyserNode'}, AudioContext ${r.audioContext}, pico ${r.maxPeak.toFixed(2)} / limiar ${r.threshold.toFixed(2)}).`
          : r.claps ? `Ouvi ${r.claps} batida(s), mas não o padrão de duas palmas (intervalo entre ${getSettings().clap.minGapMs} e ${getSettings().clap.maxGapMs} ms). Tente de novo.`
          : `Nenhuma palma reconhecida em 8 s. Pico de som ${r.maxPeak.toFixed(2)} contra limiar ${r.threshold?.toFixed(2)}${r.maxPeak < (r.threshold || 1) ? ' — som abaixo do limiar: aumente a sensibilidade ou bata mais perto do microfone.' : '.'} AudioContext: ${r.audioContext || '—'}.`;
        tests.palmas = { status: r.error ? 'fail' : r.detected ? 'ok' : 'limited', detail: why, at: new Date().toISOString() };
        show(tests.palmas); meter.hidden = true;
        toast(`${DOT[tests.palmas.status]} Palmas: ${r.detected ? 'PALMS_DETECTED' : LABEL[tests.palmas.status]}`, 5000);
      }));
      const recheck = () => { const st = notificationState(); $('#notif-diag-state', body).textContent = { granted: '🟢 PERMITIDAS', denied: '🔴 BLOQUEADAS', default: '🟡 NÃO SOLICITADAS', unsupported: '🔴 NÃO SUPORTADAS' }[st]; $('#notif-help', body).textContent = NOTIFICATION_HELP[st]; return st; };
      $('#notif-enable', body)?.addEventListener('click', async () => { const r = await requestNotifications(); recheck(); toast(r === 'granted' ? '🔔 Notificações permitidas.' : r === 'denied' ? 'Notificações bloqueadas: siga as instruções na tela.' : 'Permissão não concedida.', 5000); if (r === 'granted') notify('JARVIS', 'Notificações ativadas.'); });
      $('#notif-recheck', body).addEventListener('click', () => { const st = recheck(); toast(`Notificações: ${{ granted: 'permitidas', denied: 'bloqueadas', default: 'não solicitadas', unsupported: 'não suportadas' }[st]}`); });
      $('#notif-test', body)?.addEventListener('click', async () => { const shown = await notify('JARVIS — teste', 'Se você está vendo isto, as notificações funcionam.'); toast(shown ? 'Notificação enviada ao sistema.' : 'O sistema recusou a notificação.'); });
    };
    await render();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(render, 10000);
  }, { onClose: () => clearInterval(refreshTimer) });
}

/**
 * AUTO-DIAGNÓSTICO: microfone, voz, internet, IA, memória, Bíblia, notícias,
 * câmbio, combustíveis, armazenamento, PWA e permissões — todos testados de verdade.
 * Palmas exigem bater palmas: ficam como NÃO VERIFICADO aqui (use "Testar palmas").
 * Retorna { results, summary }.
 */
export async function runSelfTest({ speakResult } = {}) {
  clearInterval(refreshTimer);
  const rows = [['microfone', 'Microfone'], ['voz', 'Voz'], ['ouvido', 'Ouvido'], ['palmas', 'Palmas'], ['permissoes', 'Permissões'], ['pwa', 'PWA'], ['internet', 'Internet'], ['ia', 'IA'], ['memoria', 'Memória'], ['tarefas', 'Tarefas'], ['biblia', 'Bíblia'], ['noticias', 'Notícias'], ['cambio', 'Câmbio'], ['combustiveis', 'Combustíveis'], ['armazenamento', 'Armazenamento']];
  const results = {};
  const paint = (body) => {
    body.innerHTML = `<table class="diag-table"><tr><th>TESTE</th><th>RESULTADO</th><th>DETALHE</th></tr>${rows.map(([id, name]) => {
      const r = results[id];
      return `<tr><td>${name}</td><td>${r ? `${DOT[r.status]} ${LABEL[r.status]}` : '⏳ testando…'}</td><td class="muted">${r ? esc(r.detail) : ''}${r?.ms != null ? ` · ${r.ms} ms` : ''}</td></tr>`;
    }).join('')}</table><p class="hint" id="selftest-sum"></p>`;
  };
  const body = openSheet('selftest', 'AUTO-DIAGNÓSTICO', paint);
  const server = api.get('/api/selftest', { timeout: 90000 }).then((r) => {
    const { armazenamento, ...rest } = r.results;
    Object.assign(results, rest);
    results.armazenamentoServidor = armazenamento;
  }).catch((e) => {
    for (const id of ['internet', 'ia', 'memoria', 'tarefas', 'biblia', 'noticias', 'cambio', 'combustiveis']) results[id] = { status: 'fail', detail: `Servidor inacessível: ${e.message}` };
  });
  const s = getSettings();
  // Testes do navegador (em sequência: microfone e voz não podem se sobrepor)
  try {
    let t0 = performance.now();
    const mic = await testMicrophone({ ms: 1500 });
    results.microfone = { status: mic.ok ? 'ok' : mic.steps.access === 'ok' ? 'limited' : 'fail', detail: mic.reason, ms: Math.round(performance.now() - t0) };
    tests.microfone = { ...results.microfone, at: new Date().toISOString() };
    paint(body);
    t0 = performance.now();
    if (s.voice.silent) results.voz = { status: 'limited', detail: 'Modo silencioso ativo: reprodução não testada em áudio.' };
    else {
      // Voz própria do JARVIS (servidor) primeiro; a voz do navegador é a reserva.
      const own = s.voice.engine === 'celular' ? null : await api.get(`/api/tts/test?voice=${encodeURIComponent(s.voice.neuralVoice || '')}`, { timeout: 15000 }).catch((e) => ({ ok: false, error: e.message }));
      const v = await testVoice();
      if (own?.ok) results.voz = { status: 'ok', detail: `Voz própria do JARVIS funcionando (masculina, gerada em ${own.ms} ms). Reserva (voz do celular): ${v.detail}` };
      else if (own) results.voz = { status: 'limited', detail: `Voz própria do JARVIS falhou: ${own.error}. ${own.espeak ? 'Reserva: eSpeak (offline, masculina).' : 'Falando com a voz do celular:'} ${v.detail}` };
      else results.voz = { status: v.status, detail: v.detail };
      results.voz.ms = Math.round(performance.now() - t0);
      tests.voz = { ...results.voz, at: new Date().toISOString() };
    }
    paint(body);
    const cc = await clientComponents();
    results.ouvido = cc.ouvido; results.permissoes = cc.permissoes; results.pwa = cc.pwa;
    results.palmas = tests.palmas ? { ...tests.palmas } : { status: 'unknown', detail: `Exige bater palmas: use "Testar palmas" no diagnóstico. Estado atual: ${cc.palmas.detail}` };
    results.armazenamento = cc.armazenamento;
  } catch (err) {
    results.voz ??= { status: 'error', detail: `Erro no teste do navegador: ${err.message}` };
  }
  paint(body);
  await server;
  if (results.armazenamentoServidor) {
    const sv = results.armazenamentoServidor;
    results.armazenamento = { status: sv.status === 'ok' && results.armazenamento?.status === 'ok' ? 'ok' : sv.status === 'ok' ? 'limited' : sv.status, detail: `Servidor: ${sv.detail} · Navegador: ${results.armazenamento?.detail || '—'}` };
    delete results.armazenamentoServidor;
  }
  paint(body);
  const vals = rows.map(([id]) => results[id]).filter(Boolean);
  const count = (st) => vals.filter((r) => r.status === st).length;
  const fails = count('fail'), lim = count('limited'), errs = count('error'), unk = count('unknown');
  const summary = `Diagnóstico concluído. ${count('ok')} OK, ${lim} limitado(s), ${fails} indisponível(is)${errs ? `, ${errs} com erro` : ''}${unk ? `, ${unk} não verificado(s)` : ''}.`;
  const el = document.getElementById('selftest-sum'); if (el) el.textContent = summary;
  const spoken = `${summary}${fails + errs ? ` Com problema: ${rows.filter(([id]) => ['fail', 'error'].includes(results[id]?.status)).map(([, n]) => n).join(', ')}.` : ''}`;
  if (speakResult) await speakResult(spoken); else if (!s.voice.silent && voiceSupported) speak(spoken);
  return { results, summary };
}
