// DIAGNÓSTICO JARVIS: semáforo por componente (toque para ver o motivo) e
// AUTO-DIAGNÓSTICO com testes reais (servidor + navegador).
import { $, $$, esc, fmtDateTime, confirmButton, toast } from './dom.js';
import { openSheet, currentSheet } from './sheet.js';
import { api } from '../core/api.js';
import { getSettings } from '../core/settings.js';
import { environmentChecks, micStatus, MIC_LABEL, testMicrophone, notificationState } from '../modules/device.js';
import { listVoices, voiceSupported, speak } from '../modules/voice.js';
import { wake } from '../modules/wake/index.js';

const DOT = { ok: '🟢', limited: '🟡', fail: '🔴', unknown: '⚪' };
const LABEL = { ok: 'OK', limited: 'LIMITADO', fail: 'INDISPONÍVEL', unknown: 'NÃO VERIFICADO' };
const ORDER = [['cerebro', 'CÉREBRO'], ['ouvido', 'OUVIDO'], ['voz', 'VOZ'], ['palmas', 'PALMAS'], ['memoria', 'MEMÓRIA'], ['biblia', 'BÍBLIA'], ['noticias', 'NOTÍCIAS'], ['cambio', 'CÂMBIO'], ['combustiveis', 'COMBUSTÍVEIS'], ['tarefas', 'TAREFAS'], ['internet', 'INTERNET'], ['ia', 'IA']];

/** Componentes do navegador (estado real, sem simular). */
export function clientComponents() {
  const env = environmentChecks();
  const s = getSettings() || {};
  const mic = micStatus();
  const ws = wake?.status() || {};
  return {
    ouvido: !env.recognition ? { status: 'fail', detail: `Reconhecimento de fala indisponível no ${env.browser}. Use Chrome/Edge/Android ou digite.` }
      : !env.https ? { status: 'fail', detail: 'Sem HTTPS: o navegador bloqueia o microfone fora de HTTPS/localhost.' }
      : mic === 'denied' ? { status: 'fail', detail: 'Permissão do microfone NEGADA. Libere nas configurações do site (cadeado na barra de endereço).' }
      : mic === 'unavailable' ? { status: 'fail', detail: 'Nenhum microfone disponível.' }
      : { status: navigator.onLine ? 'ok' : 'limited', detail: `${env.browser}: Web Speech API${navigator.onLine ? '' : ' — sem internet o reconhecimento do Chrome não funciona'} · microfone ${MIC_LABEL[mic]}` },
    voz: !env.synthesis ? { status: 'fail', detail: 'Síntese de voz indisponível neste navegador.' }
      : s.voice?.silent ? { status: 'limited', detail: 'Modo silencioso ativo (responde só na tela).' }
      : !s.voice?.enabled ? { status: 'limited', detail: 'Voz desligada nas configurações.' }
      : { status: listVoices('pt').length ? 'ok' : 'limited', detail: `${listVoices('pt').length} voz(es) em português no aparelho` },
    palmas: !s.clap?.enabled ? { status: 'limited', detail: 'Desligado nas configurações.' }
      : ws.clap?.running ? { status: document.hidden ? 'limited' : 'ok', detail: `${ws.detail} ${wake.limitations()[1] || ''}` }
      : { status: 'limited', detail: ws.detail || 'Pausado.' },
  };
}

function grid(components) {
  return `<div class="diag-grid">${ORDER.map(([id, name]) => {
    const c = components[id] || { status: 'unknown', detail: 'Sem informação' };
    return `<button class="diag-item ${c.status}" data-id="${id}" aria-label="${name}: ${LABEL[c.status]}"><span class="dot">${DOT[c.status]}</span><b>${name}</b><small>${LABEL[c.status]}</small></button>`;
  }).join('')}</div><div class="diag-reason" id="diag-reason" aria-live="polite">Toque em um componente para ver o motivo.</div>`;
}

let refreshTimer = null;
export async function showDiagnostics() {
  openSheet('diagnostics', 'DIAGNÓSTICO JARVIS', async (body) => {
    body.innerHTML = '<p class="muted">Verificando…</p>';
    const render = async () => {
      if (currentSheet() !== 'diagnostics') { clearInterval(refreshTimer); return; }
      const [status, logs] = await Promise.all([api.get('/api/status').catch(() => null), api.get('/api/logs?limit=120').catch(() => ({ logs: [] }))]);
      const comps = { ...(status?.components || { cerebro: { status: 'fail', detail: 'Servidor inacessível' }, internet: { status: navigator.onLine ? 'unknown' : 'fail', detail: 'Servidor inacessível' } }), ...clientComponents() };
      const env = environmentChecks();
      const yes = (b) => (b ? '🟢 OK' : '🔴 ERRO');
      const open = body.querySelector('#diag-reason')?.dataset.id;
      body.innerHTML = `
        ${grid(comps)}
        <div class="diag-actions"><button class="btn" id="run-selftest">🩺 Fazer diagnóstico completo</button><button class="btn" id="diag-mic">🎙 Testar microfone</button></div>
        <div class="meter" id="diag-mic-meter" hidden><span>Fale algo…</span><div class="meter-bar"><i id="diag-mic-level"></i></div></div>
        <fieldset class="fieldset"><legend>ANDROID / MICROFONE</legend>
          <div class="switch"><span>HTTPS</span><b>${yes(env.https)}</b></div>
          <div class="switch"><span>Permissão do microfone</span><b>${micStatus() === 'denied' ? '🔴 NEGADA' : micStatus() === 'unavailable' ? '🔴 INDISPONÍVEL' : '🟢 OK'}</b></div>
          <div class="switch"><span>Microfone</span><b>${env.micApi ? `🟢 ${MIC_LABEL[micStatus()]}` : '🔴 INDISPONÍVEL'}</b></div>
          <div class="switch"><span>Reconhecimento de fala</span><b>${env.recognition ? '🟢 OK' : '🔴 INDISPONÍVEL'}</b></div>
          <div class="switch"><span>Notificações</span><b>${{ granted: '🟢 PERMITIDAS', denied: '🔴 BLOQUEADAS', default: '🟡 NÃO SOLICITADAS', unsupported: '🔴 NÃO SUPORTADAS' }[notificationState()]}</b></div>
          <div class="switch"><span>App instalado (PWA)</span><b>${env.standalone ? '🟢 SIM' : '🟡 ABERTO NO NAVEGADOR'}</b></div>
          <p class="hint">Navegador: ${esc(env.browser)} · Detector de ativação: ${esc(wake?.name || 'nenhum')} · ${esc(wake?.limitations().join(' ') || '')}</p>
        </fieldset>
        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:14px"><h4 class="h4">LOGS RECENTES</h4>
          <div><select id="log-filter" class="inline-input"><option value="">Todos</option><option value="error">Erros</option><option value="warn">Avisos</option></select> <button class="btn small" id="log-clear">Limpar logs</button></div></div>
        <div class="log-list" id="log-list"></div>
        <p class="hint">${status ? `Servidor: ${status.online ? 'com internet' : 'SEM internet (modo offline)'} · IA: ${status.llm.configured ? `${esc(status.llm.providerName)} · ${esc(status.llm.model)}` : 'não configurada'} · Fuso: ${esc(status.timezone)} · v${esc(status.version)}` : 'Servidor inacessível.'} Atualiza a cada 10 s.</p>`;
      const reason = $('#diag-reason', body);
      $$('.diag-item', body).forEach((b) => b.addEventListener('click', () => { const c = comps[b.dataset.id]; reason.dataset.id = b.dataset.id; reason.textContent = `${b.querySelector('b').textContent}: ${c?.detail || 'sem informação'}`; }));
      if (open) $(`.diag-item[data-id="${open}"]`, body)?.click();
      const renderLogs = (list) => { $('#log-list', body).innerHTML = list.map((l) => `<div class="${l.level}">${fmtDateTime(l.at)} [${esc(l.level)}] ${esc(l.category)}: ${esc(l.message)}</div>`).join('') || '<div class="muted">Sem registros.</div>'; };
      renderLogs(logs.logs);
      $('#log-filter', body).addEventListener('change', async (e) => renderLogs((await api.get(`/api/logs?limit=150${e.target.value ? `&level=${e.target.value}` : ''}`)).logs));
      confirmButton($('#log-clear', body), async () => { await api.del('/api/logs?confirm=true'); renderLogs([]); }, 'Confirmar?');
      $('#run-selftest', body).addEventListener('click', () => runSelfTest());
      $('#diag-mic', body).addEventListener('click', async () => {
        clearInterval(refreshTimer);
        const meter = $('#diag-mic-meter', body); meter.hidden = false;
        const r = await testMicrophone({ onLevel: (v) => { const el = $('#diag-mic-level', body); if (el) el.style.width = `${Math.min(100, v * 160)}%`; } });
        toast(`${r.ok ? '🟢' : '🔴'} ${r.reason}`, 5000);
        refreshTimer = setInterval(render, 10000);
      });
    };
    await render();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(render, 10000);
  }, { onClose: () => clearInterval(refreshTimer) });
}

/**
 * AUTO-DIAGNÓSTICO: microfone, voz, internet, IA, memória, Bíblia, notícias,
 * câmbio, combustíveis e armazenamento — todos testados de verdade.
 * Retorna { results, summary }.
 */
export async function runSelfTest({ speakResult } = {}) {
  clearInterval(refreshTimer);
  const rows = [['microfone', 'Microfone'], ['voz', 'Voz'], ['internet', 'Internet'], ['ia', 'IA'], ['memoria', 'Memória'], ['tarefas', 'Tarefas'], ['biblia', 'Bíblia'], ['noticias', 'Notícias'], ['cambio', 'Câmbio'], ['combustiveis', 'Combustíveis'], ['armazenamento', 'Armazenamento']];
  const results = {};
  const paint = (body) => {
    body.innerHTML = `<table class="diag-table"><tr><th>TESTE</th><th>RESULTADO</th><th>DETALHE</th></tr>${rows.map(([id, name]) => {
      const r = results[id];
      return `<tr><td>${name}</td><td>${r ? `${DOT[r.status]} ${LABEL[r.status]}` : '⏳ testando…'}</td><td class="muted">${r ? esc(r.detail) : ''}${r?.ms != null ? ` · ${r.ms} ms` : ''}</td></tr>`;
    }).join('')}</table><p class="hint" id="selftest-sum"></p>`;
  };
  const body = openSheet('selftest', 'AUTO-DIAGNÓSTICO', paint);
  const server = api.get('/api/selftest', { timeout: 90000 }).then((r) => Object.assign(results, r.results)).catch((e) => {
    for (const id of ['internet', 'ia', 'memoria', 'tarefas', 'biblia', 'noticias', 'cambio', 'combustiveis', 'armazenamento']) results[id] = { status: 'fail', detail: `Servidor inacessível: ${e.message}` };
  });
  // Testes do navegador
  const t0 = performance.now();
  const mic = await testMicrophone({ ms: 1500 });
  results.microfone = { status: mic.ok ? 'ok' : mic.peak != null ? 'limited' : 'fail', detail: mic.reason, ms: Math.round(performance.now() - t0) };
  paint(body);
  const s = getSettings();
  results.voz = !voiceSupported ? { status: 'fail', detail: 'Síntese de voz indisponível' }
    : s.voice.silent ? { status: 'limited', detail: 'Modo silencioso ativo (voz não testada em áudio)' }
    : { status: listVoices('pt').length ? 'ok' : 'limited', detail: `${listVoices('pt').length} voz(es) pt; teste falado a seguir` };
  paint(body);
  await server;
  paint(body);
  const vals = Object.values(results);
  const fails = vals.filter((r) => r.status === 'fail').length;
  const lim = vals.filter((r) => r.status === 'limited').length;
  const summary = `Diagnóstico concluído. ${vals.length - fails - lim} OK, ${lim} limitado(s), ${fails} indisponível(is).`;
  const el = document.getElementById('selftest-sum'); if (el) el.textContent = summary;
  const spoken = `${summary}${fails ? ` Com problema: ${rows.filter(([id]) => results[id]?.status === 'fail').map(([, n]) => n).join(', ')}.` : ''}`;
  if (speakResult) await speakResult(spoken); else if (!s.voice.silent) speak(spoken);
  return { results, summary };
}
