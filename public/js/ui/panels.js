// Painéis: memória, configurações, diagnóstico, módulos, casa e menu.
import { $, $$, esc, toast, fmtDateTime, confirmButton } from './dom.js';
import { openSheet } from './sheet.js';
import { api } from '../core/api.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { listVoices, voiceSupported } from '../modules/voice.js';
import { hearingSupported, wakeStatus } from '../modules/hearing.js';
import { clapStatus } from '../modules/clap.js';

const KIND_LABEL = { facts: 'MEMÓRIA PERSISTENTE', preferences: 'PREFERÊNCIAS', tasks: 'TAREFAS' };

// ---------------- MEMÓRIA ----------------
export async function showMemory(sessionHistory = []) {
  openSheet('memory', 'MEMÓRIA', async (body) => {
    body.innerHTML = '<p class="muted">Carregando…</p>';
    const data = await api.get('/api/memory').catch((e) => ({ error: e.message }));
    if (data.error) { body.innerHTML = `<div class="err-box">${esc(data.error)}</div>`; return; }
    const section = (kind) => `
      <fieldset class="fieldset"><legend>${KIND_LABEL[kind]}</legend>
        <ul class="mem-list" data-kind="${kind}">${data[kind].length ? data[kind].map((m) => `
          <li data-id="${m.id}" class="${m.done ? 'done' : ''}">
            ${kind === 'tasks' ? `<input type="checkbox" ${m.done ? 'checked' : ''} aria-label="Concluída">` : ''}
            <span class="t">${esc(m.text)}</span>
            <button class="btn small" data-edit>Editar</button>
            <button class="btn small" data-del>Apagar</button>
          </li>`).join('') : '<li class="muted">Vazio.</li>'}</ul>
        <form class="mem-add" data-kind="${kind}" style="display:flex;gap:8px"><input class="inline-input" style="flex:1" maxlength="1000" placeholder="Adicionar…" required><button class="btn small">Adicionar</button></form>
      </fieldset>`;
    body.innerHTML = `
      <p class="hint">O JARVIS só guarda de forma permanente o que você autorizar (“lembre que…”). Senhas, cartões e documentos são bloqueados ou exigem confirmação.</p>
      <div class="form-grid">${section('facts')}${section('preferences')}</div><br>${section('tasks')}<br>
      <fieldset class="fieldset"><legend>MEMÓRIA DE SESSÃO (conversa atual — não é salva em disco)</legend>
        <ul class="mem-list">${sessionHistory.slice(-10).map((h) => `<li><span class="t"><b>${h.role === 'user' ? 'Você' : 'JARVIS'}:</b> ${esc(h.text.slice(0, 160))}</span></li>`).join('') || '<li class="muted">Vazia.</li>'}</ul>
      </fieldset><br>
      <button class="btn danger" id="mem-clear">Apagar todas as memórias</button>`;
    $$('.mem-list li[data-id]', body).forEach((li) => {
      const id = li.dataset.id;
      confirmButton($('[data-del]', li), async () => { await api.del(`/api/memory/${id}`); li.remove(); toast('Memória apagada.'); }, 'Confirmar exclusão?');
      $('[data-edit]', li).addEventListener('click', () => {
        const span = $('.t', li);
        const input = document.createElement('input'); input.className = 'inline-input'; input.value = span.textContent; input.maxLength = 1000;
        span.replaceWith(input); input.focus();
        const save = async () => { const item = await api.patch(`/api/memory/${id}`, { text: input.value }); const s = document.createElement('span'); s.className = 't'; s.textContent = item.text; input.replaceWith(s); toast('Memória editada.'); };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') showMemory(sessionHistory); });
        input.addEventListener('blur', save, { once: true });
      });
      $('input[type=checkbox]', li)?.addEventListener('change', async (e) => { await api.patch(`/api/memory/${id}`, { done: e.target.checked }); li.classList.toggle('done', e.target.checked); });
    });
    $$('.mem-add', body).forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('input', f);
      try { await api.post('/api/memory', { kind: f.dataset.kind, text: input.value }); showMemory(sessionHistory); } catch (err) { toast(err.message); }
    }));
    confirmButton($('#mem-clear', body), async () => { await api.del('/api/memory?confirm=true'); showMemory(sessionHistory); toast('Todas as memórias foram apagadas.'); }, 'Tem certeza? Toque de novo');
  });
}

// ---------------- CONFIGURAÇÕES ----------------
export async function showSettings({ onChange } = {}) {
  const [s, personality, bible, booksRes] = await Promise.all([
    Promise.resolve(getSettings()), api.get('/api/personality').catch(() => null), api.get('/api/bible/settings').catch(() => null), api.get('/api/bible/books').catch(() => ({ books: [] })),
  ]);
  openSheet('settings', 'CONFIGURAÇÕES', (body) => {
    const voices = listVoices(s.voice.lang);
    body.innerHTML = `
    <div class="form-grid">
      <fieldset class="fieldset"><legend>VOZ</legend>
        <label class="switch">Responder por voz <input type="checkbox" data-k="voice.enabled" ${s.voice.enabled ? 'checked' : ''}></label>
        <div class="field"><label>Voz</label><select data-k="voice.voiceName"><option value="">Automática (${esc(s.voice.lang)})</option>${voices.map((v) => `<option ${v.name === s.voice.voiceName ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Velocidade: <span data-out="voice.rate">${s.voice.rate}</span></label><input type="range" min="0.6" max="1.8" step="0.05" value="${s.voice.rate}" data-k="voice.rate" data-num></div>
        <div class="field"><label>Volume: <span data-out="voice.volume">${s.voice.volume}</span></label><input type="range" min="0" max="1" step="0.05" value="${s.voice.volume}" data-k="voice.volume" data-num></div>
        <div class="field"><label>Idioma da voz e do ouvido</label><select data-k="voice.lang" data-mirror="hearing.lang">${['pt-BR', 'pt-PT', 'en-US', 'es-ES'].map((l) => `<option ${l === s.voice.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Máximo de caracteres falados</label><input type="number" min="100" max="3000" step="50" value="${s.voice.maxSpokenChars}" data-k="voice.maxSpokenChars" data-num></div>
        <button class="btn small" id="test-voice" type="button">Testar voz</button>
      </fieldset>
      <fieldset class="fieldset"><legend>MICROFONE / OUVIDO</legend>
        <label class="switch">Conversa contínua (ouve de novo após perguntas) <input type="checkbox" data-k="hearing.continuousConversation" ${s.hearing.continuousConversation ? 'checked' : ''}></label>
        <label class="switch">Ativação por voz (“Jarvis, …”) <input type="checkbox" data-k="hearing.wakeWord" ${s.hearing.wakeWord ? 'checked' : ''}></label>
        <p class="hint">A ativação por voz mantém o reconhecimento do navegador ligado — no Chrome o áudio é processado pelo serviço do Google. Deixe desligado se preferir privacidade máxima.</p>
        <div class="field"><label>Silêncio para encerrar (ms): <span data-out="hearing.silenceMs">${s.hearing.silenceMs}</span></label><input type="range" min="800" max="4000" step="100" value="${s.hearing.silenceMs}" data-k="hearing.silenceMs" data-num></div>
        <button class="btn small" id="test-mic" type="button">Testar permissão do microfone</button>
      </fieldset>
      <fieldset class="fieldset"><legend>PALMAS</legend>
        <label class="switch">Ativar com duas palmas <input type="checkbox" data-k="clap.enabled" ${s.clap.enabled ? 'checked' : ''}></label>
        <div class="field"><label>Sensibilidade: <span data-out="clap.sensitivity">${s.clap.sensitivity}</span></label><input type="range" min="0" max="1" step="0.05" value="${s.clap.sensitivity}" data-k="clap.sensitivity" data-num></div>
        <div class="field"><label>Intervalo máximo entre palmas (ms): <span data-out="clap.maxGapMs">${s.clap.maxGapMs}</span></label><input type="range" min="300" max="1500" step="50" value="${s.clap.maxGapMs}" data-k="clap.maxGapMs" data-num></div>
        <div class="field"><label>Tempo de espera após ativar (ms): <span data-out="clap.cooldownMs">${s.clap.cooldownMs}</span></label><input type="range" min="1000" max="8000" step="250" value="${s.clap.cooldownMs}" data-k="clap.cooldownMs" data-num></div>
        <p class="hint">Use o medidor “Nível do microfone” (painel Sistema) para calibrar: a linha laranja é o limiar atual.</p>
      </fieldset>
      <fieldset class="fieldset"><legend>INTERFACE</legend>
        <div class="field"><label>Tema</label><select data-k="ui.theme">${[['ciano', 'Ciano'], ['ambar', 'Âmbar'], ['verde', 'Verde']].map(([v, l]) => `<option value="${v}" ${v === s.ui.theme ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Modo</label><select data-k="ui.mode"><option value="desempenho" ${s.ui.mode === 'desempenho' ? 'selected' : ''}>Desempenho (visual completo)</option><option value="economico" ${s.ui.mode === 'economico' ? 'selected' : ''}>Econômico (menos CPU/bateria)</option></select></div>
        <label class="switch">Animações <input type="checkbox" data-k="ui.animations" ${s.ui.animations ? 'checked' : ''}></label>
        <label class="switch">Partículas <input type="checkbox" data-k="ui.particles" ${s.ui.particles ? 'checked' : ''}></label>
      </fieldset>
      <fieldset class="fieldset"><legend>BÍBLIA</legend>
        <div class="field"><label>Capítulos por dia</label><input type="number" min="1" max="20" value="${bible?.chaptersPerDay ?? 3}" id="b-cpd"></div>
        <div class="field"><label>Versículos por página (0 = automático)</label><input type="number" min="0" max="40" value="${s.bible.pageSizeOverride}" data-k="bible.pageSizeOverride" data-num></div>
        <div class="field"><label>Redefinir posição da próxima leitura</label>
          <div style="display:flex;gap:8px"><select id="b-book" class="inline-input" style="flex:1">${booksRes.books.map((b) => `<option value="${esc(b.abbrev)}" ${b.abbrev === bible?.position?.book ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
          <input id="b-ch" type="number" min="1" value="${bible?.position?.chapter ?? 2}" class="inline-input" style="width:80px"></div></div>
        <button class="btn small" id="b-save" type="button">Salvar Bíblia</button>
      </fieldset>
      <fieldset class="fieldset"><legend>PERSONALIDADE</legend>
        <div class="field"><label>Seu nome (como o JARVIS te chama)</label><input type="text" id="p-user" maxlength="40" value="${esc(personality?.nome_usuario || '')}"></div>
        <div class="field"><label>Humor: <span id="p-h-out">${personality?.nivel_humor ?? 0.5}</span></label><input type="range" id="p-humor" min="0" max="1" step="0.05" value="${personality?.nivel_humor ?? 0.5}"></div>
        <div class="field"><label>Formalidade: <span id="p-f-out">${personality?.formalidade ?? 0.35}</span></label><input type="range" id="p-formal" min="0" max="1" step="0.05" value="${personality?.formalidade ?? 0.35}"></div>
        <div class="field"><label>Detalhamento</label><select id="p-detail">${['baixo', 'medio', 'alto'].map((d) => `<option ${d === personality?.nivel_detalhamento ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <button class="btn small" id="p-save" type="button">Salvar personalidade</button>
      </fieldset>
      <fieldset class="fieldset"><legend>PRIVACIDADE E SEGURANÇA</legend>
        <label class="switch">Permitir pesquisa na web pela IA <input type="checkbox" data-k="privacy.allowWebSearch" ${s.privacy.allowWebSearch ? 'checked' : ''}></label>
        <label class="switch">Modo seguro (confirma tudo, bloqueia a casa) <input type="checkbox" data-k="security.safeMode" ${s.security.safeMode ? 'checked' : ''}></label>
        <p class="hint">Chaves de API ficam apenas no servidor (.env). Os logs não guardam o conteúdo completo das conversas.</p>
      </fieldset>
    </div>`;
    const setPath = (obj, path, value) => { const [a, b] = path.split('.'); return { [a]: { [b]: value } }; };
    $$('[data-k]', body).forEach((el) => {
      const ev = el.type === 'range' ? 'input' : 'change';
      el.addEventListener(ev, async () => {
        const v = el.type === 'checkbox' ? el.checked : el.dataset.num !== undefined ? Number(el.value) : el.value;
        const out = $(`[data-out="${el.dataset.k}"]`, body); if (out) out.textContent = v;
        let patch = setPath({}, el.dataset.k, v);
        if (el.dataset.mirror) patch = { ...patch, ...setPath({}, el.dataset.mirror, v) };
        clearTimeout(el._t);
        el._t = setTimeout(async () => { const next = await saveSettings(patch); onChange?.(next, el.dataset.k); }, el.type === 'range' ? 250 : 0);
      });
    });
    $('#test-voice', body).addEventListener('click', () => onChange?.(getSettings(), 'test-voice'));
    $('#test-mic', body).addEventListener('click', async () => {
      try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); toast('Microfone liberado ✔'); } catch (e) { toast(`Microfone bloqueado: ${e.name}`); }
    });
    $('#b-save', body).addEventListener('click', async () => {
      await api.put('/api/bible/settings', { chaptersPerDay: Number($('#b-cpd', body).value), position: { book: $('#b-book', body).value, chapter: Number($('#b-ch', body).value) } });
      toast('Configurações da Bíblia salvas.');
    });
    $('#p-humor', body).addEventListener('input', (e) => { $('#p-h-out', body).textContent = e.target.value; });
    $('#p-formal', body).addEventListener('input', (e) => { $('#p-f-out', body).textContent = e.target.value; });
    $('#p-save', body).addEventListener('click', async () => {
      await api.put('/api/personality', { nome_usuario: $('#p-user', body).value.trim(), nivel_humor: Number($('#p-humor', body).value), formalidade: Number($('#p-formal', body).value), nivel_detalhamento: $('#p-detail', body).value });
      toast('Personalidade salva.');
    });
  });
}

// ---------------- DIAGNÓSTICO ----------------
async function micPermission() {
  try { const p = await navigator.permissions.query({ name: 'microphone' }); return p.state; } catch { return 'desconhecido'; }
}

export async function showDiagnostics() {
  openSheet('diagnostics', 'DIAGNÓSTICO', async (body) => {
    body.innerHTML = '<p class="muted">Verificando componentes…</p>';
    const [status, logs, perm] = await Promise.all([api.get('/api/status').catch((e) => ({ error: e.message })), api.get('/api/logs?limit=150').catch(() => ({ logs: [] })), micPermission()]);
    if (status.error) { body.innerHTML = `<div class="err-box">Servidor inacessível: ${esc(status.error)}</div>`; return; }
    const st = (cls, label) => `<span class="st ${cls}">${label}</span>`;
    const map = { online: st('ok', 'ONLINE'), client: st('ok', 'NAVEGADOR'), local: st('warn', 'MODO LOCAL'), offline: st('bad', 'OFFLINE'), unavailable: st('off', 'INDISPONÍVEL'), off: st('off', 'DESLIGADO') };
    const clap = clapStatus(); const wake = wakeStatus();
    const client = [
      ['Reconhecimento de fala (OUVIDO)', hearingSupported ? st('ok', 'SUPORTADO') : st('bad', 'NÃO SUPORTADO'), hearingSupported ? 'Web Speech API (requer internet no Chrome).' : 'Use Chrome, Edge ou Android. Texto continua disponível.'],
      ['Síntese de voz (VOZ)', voiceSupported ? st('ok', 'SUPORTADO') : st('bad', 'NÃO SUPORTADO'), `${listVoices('pt').length} voz(es) em português instaladas.`],
      ['Permissão do microfone', perm === 'granted' ? st('ok', 'CONCEDIDA') : perm === 'denied' ? st('bad', 'NEGADA') : st('warn', String(perm).toUpperCase()), window.isSecureContext ? 'Contexto seguro (HTTPS/localhost).' : 'ATENÇÃO: microfone exige HTTPS ou localhost.'],
      ['Detector de palmas', clap.running ? st('ok', 'ATIVO') : clap.enabled ? st('warn', 'PAUSADO') : st('off', 'DESLIGADO'), typeof AudioWorkletNode !== 'undefined' ? 'AudioWorklet disponível.' : 'Usando modo reserva (AnalyserNode).'],
      ['Ativação por voz', wake.running ? st('ok', 'OUVINDO') : wake.enabled ? st('warn', 'AGUARDANDO') : st('off', 'DESLIGADA'), ''],
      ['Internet (navegador)', navigator.onLine ? st('ok', 'ONLINE') : st('bad', 'OFFLINE'), ''],
      ['Modo offline (Service Worker)', navigator.serviceWorker?.controller ? st('ok', 'ATIVO') : st('warn', 'INATIVO'), 'Interface fica disponível sem internet após a 1ª visita.'],
    ];
    body.innerHTML = `
      <table class="diag-table"><tr><th>MÓDULO</th><th>STATUS</th><th>DETALHES</th><th>ÚLTIMA AÇÃO</th></tr>
        ${status.modules.map((m) => `<tr><td>${esc(m.name)}</td><td>${map[m.status] || esc(m.status)}</td><td>${esc(m.info)}</td><td class="muted">${m.last ? `${esc(m.last.event)} · ${fmtDateTime(m.last.at)}` : '—'}</td></tr>`).join('')}
      </table><br>
      <table class="diag-table"><tr><th>NAVEGADOR / DISPOSITIVO</th><th>STATUS</th><th>DETALHES</th></tr>
        ${client.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="muted">${esc(c)}</td></tr>`).join('')}
      </table><br>
      <p class="hint">Servidor: ${status.online ? 'com internet' : 'SEM internet'} · IA: ${status.llm.configured ? esc(status.llm.model) : 'não configurada'} · Fuso: ${esc(status.timezone)} · Versão ${esc(status.version)}</p>
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><h4 style="font:600 11px var(--mono);letter-spacing:.2em;color:var(--accent)">LOGS RECENTES</h4>
        <div><select id="log-filter" class="inline-input"><option value="">Todos</option><option value="error">Erros</option><option value="warn">Avisos</option></select> <button class="btn small" id="log-clear">Limpar logs</button></div></div>
      <div class="log-list" id="log-list"></div>`;
    const renderLogs = (list) => { $('#log-list', body).innerHTML = list.map((l) => `<div class="${l.level}">${fmtDateTime(l.at)} [${esc(l.level)}] ${esc(l.category)}: ${esc(l.message)}</div>`).join('') || '<div class="muted">Sem registros.</div>'; };
    renderLogs(logs.logs);
    $('#log-filter', body).addEventListener('change', async (e) => renderLogs((await api.get(`/api/logs?limit=150${e.target.value ? `&level=${e.target.value}` : ''}`)).logs));
    confirmButton($('#log-clear', body), async () => { await api.del('/api/logs?confirm=true'); renderLogs([]); }, 'Confirmar?');
  });
}

// ---------------- MÓDULOS ----------------
export async function showModules() {
  openSheet('modules', 'MÓDULOS', async (body) => {
    const [status, cmds] = await Promise.all([api.get('/api/status'), api.get('/api/commands')]);
    const byModule = {};
    for (const c of cmds.commands) (byModule[c.module] ||= []).push(c);
    body.innerHTML = `<div class="form-grid">${status.modules.map((m) => `
      <fieldset class="fieldset"><legend>${esc(m.name)}</legend>
        <p class="hint" style="margin-top:0">Status: <b>${esc(m.status)}</b> · ${esc(m.info)}</p>
        <p class="hint">Última ação: ${m.last ? `${esc(m.last.event)} ${m.last.detail ? `(${esc(m.last.detail)})` : ''} · ${fmtDateTime(m.last.at)}` : '—'}</p>
        ${(byModule[m.name] || []).map((c) => `<div class="hint">• <b>${esc(c.description)}</b>${c.permission !== 'safe' ? ` <span class="badge warn">${c.permission === 'confirm' ? 'CONFIRMAÇÃO' : 'RESTRITO'}</span>` : ''}<br><span class="muted">${c.aliases.map((a) => `“${esc(a)}”`).join(', ')}</span></div>`).join('')}
      </fieldset>`).join('')}</div>`;
  });
}

// ---------------- CASA ----------------
export async function showHouse() {
  openSheet('house', 'CASA', async (body) => {
    const st = await api.get('/api/house').catch((e) => ({ available: false, reason: e.message, categories: [], integrations: [] }));
    body.innerHTML = `
      ${!st.available ? `<div class="err-box">${esc(st.reason)}</div><br>` : ''}
      <div class="form-grid">${st.categories.map((c) => `<fieldset class="fieldset"><legend>${esc(c.name.toUpperCase())}</legend>
        ${c.available ? c.devices.map((d) => `<div class="switch"><span>${esc(d.name)}</span><span class="st ok">${esc(d.state)}${d.unit ? ` ${esc(d.unit)}` : ''}</span></div>`).join('') : '<span class="st off">INDISPONÍVEL</span>'}
      </fieldset>`).join('')}</div>
      <p class="hint">Integrações: ${st.integrations.map((i) => `${esc(i.name)} (${i.configured ? 'configurada' : 'não configurada'})`).join(', ')}. Nenhum dispositivo é simulado: só aparece o que existir de verdade.</p>`;
  });
}

// ---------------- MENU (celular) ----------------
export function showMenu(handlers) {
  openSheet('menu', 'MENU', (body) => {
    const items = [['📖', 'Bíblia', 'bible'], ['📰', 'Notícias', 'news'], ['🧠', 'Memória', 'memory'], ['🧩', 'Módulos', 'modules'], ['🏠', 'Casa', 'house'], ['⚙️', 'Configurações', 'settings'], ['🩺', 'Diagnóstico', 'diagnostics'], ['👏', 'Palmas on/off', 'clap'], ['🔇', 'Parar fala', 'stop']];
    body.innerHTML = `<div class="menu-grid">${items.map(([i, l, k]) => `<button data-k="${k}"><span>${i}</span>${l}</button>`).join('')}</div>`;
    $$('[data-k]', body).forEach((b) => b.addEventListener('click', () => handlers[b.dataset.k]?.()));
  });
}
