// Painéis: memória, configurações, diagnóstico, módulos, casa e menu.
import { $, $$, esc, toast, fmtDateTime, confirmButton } from './dom.js';
import { openSheet } from './sheet.js';
import { api } from '../core/api.js';
import { getSettings, saveSettings } from '../core/settings.js';
import { listVoices } from '../modules/voice.js';
import { testMicrophone, notificationState, requestNotifications, notify } from '../modules/device.js';

const KIND_LABEL = { facts: 'MEMÓRIA PERSISTENTE', preferences: 'PREFERÊNCIAS', tasks: 'TAREFAS' };

// ---------------- MEMÓRIA ----------------
function dueLabel(t) {
  if (!t.dueAt) return '';
  const d = new Date(t.dueAt);
  const overdue = d < new Date() && t.status === 'pending';
  return ` <span class="badge ${overdue ? 'warn' : ''}">${overdue ? 'ATRASADA · ' : ''}${d.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', ...(t.hasTime ? { hour: '2-digit', minute: '2-digit' } : {}) })}</span>`;
}

function memItem(m, kind) {
  const task = kind === 'tasks';
  const status = task ? (m.status || (m.done ? 'done' : 'pending')) : null;
  return `<li data-id="${m.id}" class="${status === 'done' ? 'done' : ''} ${status === 'cancelled' ? 'cancelled' : ''}">
    ${task ? `<input type="checkbox" ${status === 'done' ? 'checked' : ''} aria-label="Concluída" ${status === 'cancelled' ? 'disabled' : ''}>` : ''}
    <span class="t">${esc(m.text)}${task ? dueLabel(m) : ''}${status === 'cancelled' ? ' <span class="badge">CANCELADA</span>' : ''}</span>
    ${m.protected ? '<button class="btn small" data-reveal>Mostrar</button>' : '<button class="btn small" data-edit>Editar</button>'}
    ${task && status === 'pending' ? '<button class="btn small" data-postpone title="Adiar para amanhã 9h">Adiar</button><button class="btn small" data-cancel>Cancelar</button>' : ''}
    <button class="btn small" data-del>Apagar</button>
  </li>`;
}

export async function showMemory(sessionHistory = []) {
  openSheet('memory', 'MEMÓRIA', async (body) => {
    body.innerHTML = '<p class="muted">Carregando…</p>';
    const [data, taskRes, bible] = await Promise.all([api.get('/api/memory').catch((e) => ({ error: e.message })), api.get('/api/tasks?all=1').catch(() => ({ tasks: [] })), api.get('/api/bible/settings').catch(() => null)]);
    if (data.error) { body.innerHTML = `<div class="err-box">${esc(data.error)}</div>`; return; }
    data.tasks = taskRes.tasks.filter((t) => t.status !== 'cancelled' || Date.now() - Date.parse(t.updatedAt || t.createdAt) < 7 * 86400000);
    const section = (kind, title) => `
      <fieldset class="fieldset"><legend>${title}</legend>
        <ul class="mem-list" data-kind="${kind}">${data[kind].length ? data[kind].map((m) => memItem(m, kind)).join('') : '<li class="muted">Vazio.</li>'}</ul>
        <form class="mem-add" data-kind="${kind}" style="display:flex;gap:8px;flex-wrap:wrap"><input class="inline-input" style="flex:1;min-width:160px" maxlength="1000" placeholder="Adicionar…" required>
          ${kind === 'tasks' ? '<input class="inline-input" type="datetime-local" aria-label="Data e hora (opcional)">' : ''}<button class="btn small">Adicionar</button></form>
      </fieldset>`;
    body.innerHTML = `
      <p class="hint">O JARVIS só guarda de forma permanente o que você autorizar (“lembre que…”). Senhas, cartões e documentos ficam <b>criptografados</b> e só aparecem após confirmação — nunca em voz alta.</p>
      ${section('tasks', 'TAREFAS E LEMBRETES')}<br>
      <div class="form-grid">${section('facts', 'MEMÓRIAS')}${section('preferences', 'PREFERÊNCIAS')}</div><br>
      <fieldset class="fieldset"><legend>PROGRESSO DA BÍBLIA</legend><p class="hint" style="margin:0">Próxima leitura começa em <b>${esc(bible?.position ? (bible.position.label || `${bible.position.book.toUpperCase()} ${bible.position.chapter}`) : '—')}</b> · ${bible?.chaptersPerDay ?? 3} capítulos por dia. Detalhes no leitor (diga “Bíblia”) e ajustes em Configurações.</p></fieldset><br>
      <fieldset class="fieldset"><legend>SESSÃO (conversa atual — não é salva em disco)</legend>
        <ul class="mem-list">${sessionHistory.slice(-10).map((h) => `<li><span class="t"><b>${h.role === 'user' ? 'Você' : 'JARVIS'}:</b> ${esc(h.text.slice(0, 160))}</span></li>`).join('') || '<li class="muted">Vazia.</li>'}</ul>
      </fieldset><br>
      <button class="btn danger" id="mem-clear">Apagar todas as memórias e tarefas</button>`;
    const reload = () => showMemory(sessionHistory);
    $$('.mem-list li[data-id]', body).forEach((li) => {
      const id = li.dataset.id;
      confirmButton($('[data-del]', li), async () => { await api.del(`/api/memory/${id}`); li.remove(); toast('Apagado.'); }, 'Confirmar exclusão?');
      $('[data-edit]', li)?.addEventListener('click', () => {
        const span = $('.t', li);
        const input = document.createElement('input'); input.className = 'inline-input'; input.value = span.textContent.replace(/\s+(seg|ter|qua|qui|sex|sáb|dom)\.?,.*$/i, ''); input.maxLength = 1000;
        span.replaceWith(input); input.focus();
        const save = async () => { await api.patch(`/api/memory/${id}`, { text: input.value }); toast('Editado.'); reload(); };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') reload(); });
        input.addEventListener('blur', save, { once: true });
      });
      const reveal = $('[data-reveal]', li);
      if (reveal) confirmButton(reveal, async () => { const r = await api.post(`/api/memory/${id}/reveal`, { confirm: true }); $('.t', li).textContent = `🔓 ${r.text}`; reveal.remove(); }, 'Mostrar mesmo?');
      $('input[type=checkbox]', li)?.addEventListener('change', async (e) => { await api.patch(`/api/tasks/${id}`, { action: e.target.checked ? 'done' : 'reopen' }); reload(); });
      $('[data-postpone]', li)?.addEventListener('click', async () => {
        const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
        await api.patch(`/api/tasks/${id}`, { action: 'postpone', dueAt: d.toISOString(), hasTime: true }); toast('Adiado para amanhã às 9h.'); reload();
      });
      const cancel = $('[data-cancel]', li);
      if (cancel) confirmButton(cancel, async () => { await api.patch(`/api/tasks/${id}`, { action: 'cancel' }); reload(); }, 'Cancelar mesmo?');
    });
    $$('.mem-add', body).forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const [input, when] = $$('input', f);
      try {
        if (f.dataset.kind === 'tasks') await api.post('/api/tasks', { text: input.value, ...(when?.value ? { dueAt: new Date(when.value).toISOString(), hasTime: true } : {}) });
        else await api.post('/api/memory', { kind: f.dataset.kind, text: input.value });
        reload();
      } catch (err) { toast(err.message); }
    }));
    confirmButton($('#mem-clear', body), async () => { await api.del('/api/memory?confirm=true'); reload(); toast('Todas as memórias foram apagadas.'); }, 'Tem certeza? Toque de novo');
  });
}

// ---------------- CONFIGURAÇÕES ----------------
export async function showSettings({ onChange } = {}) {
  const [s, personality, bible, booksRes, status, online, ttsInfo] = await Promise.all([
    Promise.resolve(getSettings()), api.get('/api/personality').catch(() => null), api.get('/api/bible/settings').catch(() => null), api.get('/api/bible/books').catch(() => ({ books: [] })), api.get('/api/status').catch(() => null),
    api.get('/api/ai/online').catch(() => null), api.get('/api/tts').catch(() => null),
  ]);
  const aiStatus = status?.llm;
  openSheet('settings', 'CONFIGURAÇÕES', (body) => {
    const voices = listVoices(s.voice.lang);
    body.innerHTML = `
    <div class="form-grid">
      <fieldset class="fieldset"><legend>INTELIGÊNCIA (IA)</legend>
        <p class="hint" style="margin-top:0">Agora: <b>${esc(aiStatus?.state || 'IA INDISPONÍVEL')}</b>${aiStatus?.configured ? ` · ${esc(aiStatus.providerName)} · ${esc(aiStatus.model)}` : ' · modo local (comandos funcionam)'}${aiStatus?.fallback ? ` · reserva sem internet: ${esc(aiStatus.fallback.name)} · ${esc(aiStatus.fallback.model)}` : ''}</p>
        <h4 class="h4">IA ONLINE GRATUITA — GROQ</h4>
        <p class="hint">Responde em cerca de 1 segundo. Plano grátis, sem cartão.</p>
        <ol class="hint groq-steps">
          <li>No Chrome, abra <b>console.groq.com</b> e entre com sua conta Google.</li>
          <li>Procure <b>API Keys</b> → <b>Create API Key</b>, dê o nome JARVIS e <b>copie a chave</b>.</li>
          <li>Cole abaixo e toque em <b>Salvar e testar</b>.</li>
        </ol>
        <div class="groq-row"><input id="groq-key" class="inline-input" type="password" placeholder="Cole aqui a chave do Groq" autocomplete="off" spellcheck="false" aria-label="Chave do Groq"><button class="btn small" id="groq-save" type="button">Salvar e testar</button></div>
        <p class="hint" id="groq-state">${online?.configured ? `🟢 Groq conectado · modelo <b>${esc(online.model)}</b>${online.source === 'env' ? ' (chave definida no .env do servidor)' : ''}` : '⚪ Groq não conectado.'}</p>
        ${online?.configured && online.source === 'saved' ? '<button class="btn small" id="groq-remove" type="button">Remover chave do Groq</button>' : ''}
        <p class="hint">A chave fica só no seu aparelho, criptografada, e nunca aparece de novo na tela. Com o Groq, as perguntas feitas à IA passam pelos servidores do Groq. Comandos, memória, Bíblia e tarefas continuam no aparelho. Sem internet ou no limite grátis, a IA do celular responde no lugar.</p>
      </fieldset>
      <fieldset class="fieldset"><legend>VOZ</legend>
        <label class="switch">Responder por voz <input type="checkbox" data-k="voice.enabled" ${s.voice.enabled ? 'checked' : ''}></label>
        <div class="field"><label>Voz do JARVIS</label><select data-k="voice.engine">${[['celular', 'Voz do celular (natural, funciona sem internet)'], ['neural', 'Voz neural online (experimental)'], ['espeak', 'Voz robótica offline (eSpeak)']].map(([v, l]) => `<option value="${v}" ${(['neural', 'espeak'].includes(s.voice.engine) ? s.voice.engine : 'celular') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <details class="hint voice-help"><summary><b>Como deixar a voz MASCULINA</b> (voz do celular)</summary>
          <ol>
            <li>Abra as <b>Configurações do Android</b> → <b>Configurações adicionais</b> → <b>Idiomas e entrada</b> → <b>Saída de texto para fala</b> (ou procure “texto para fala” na lupa das Configurações).</li>
            <li>Em <b>Mecanismo preferido</b>, escolha <b>Serviços de fala do Google</b> (se não tiver, instale “Serviços de fala do Google” na Play Store).</li>
            <li>Toque na <b>engrenagem ⚙</b> ao lado → <b>Instalar dados de voz</b> → <b>Português (Brasil)</b>.</li>
            <li>Ouça as vozes (▶) e marque uma <b>masculina</b> — toque em baixar se pedir.</li>
            <li>Volte aqui, <b>feche e abra o Chrome</b> e toque em <b>Testar voz</b>.</li>
          </ol>
        </details>
        ${s.voice.engine === 'neural' ? `<div class="field"><label>Voz neural</label><select data-k="voice.neuralVoice">${(ttsInfo?.voices || [{ id: 'pt-BR-AntonioNeural', name: 'Antônio (português do Brasil)' }]).map((v) => `<option value="${esc(v.id)}" ${v.id === (s.voice.neuralVoice || 'pt-BR-AntonioNeural') ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
        <p class="hint">Experimental: serviço gratuito e não oficial do Edge; o texto falado passa pela Microsoft e o serviço pode recusar (403). Se falhar, usa a voz do celular.</p>` : ''}
        <div class="field"><label>Voz do celular</label><select data-k="voice.voiceName"><option value="">Automática (${esc(s.voice.lang)})</option>${voices.map((v) => `<option ${v.name === s.voice.voiceName ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Velocidade: <span data-out="voice.rate">${s.voice.rate}</span></label><input type="range" min="0.6" max="1.8" step="0.05" value="${s.voice.rate}" data-k="voice.rate" data-num></div>
        <div class="field"><label>Volume: <span data-out="voice.volume">${s.voice.volume}</span></label><input type="range" min="0" max="1" step="0.05" value="${s.voice.volume}" data-k="voice.volume" data-num></div>
        <div class="field"><label>Idioma da voz e do ouvido</label><select data-k="voice.lang" data-mirror="hearing.lang">${['pt-BR', 'pt-PT', 'en-US', 'es-ES'].map((l) => `<option ${l === s.voice.lang ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Máximo de caracteres falados</label><input type="number" min="100" max="3000" step="50" value="${s.voice.maxSpokenChars}" data-k="voice.maxSpokenChars" data-num></div>
        <label class="switch">Modo silencioso (só texto) <input type="checkbox" data-k="voice.silent" ${s.voice.silent ? 'checked' : ''}></label>
        <label class="switch">Interromper dizendo “pare” <input type="checkbox" data-k="voice.bargeIn" ${s.voice.bargeIn ? 'checked' : ''}></label>
        <div class="field"><label>Tom (pitch): <span data-out="voice.pitch">${s.voice.pitch}</span></label><input type="range" min="0.5" max="1.5" step="0.05" value="${s.voice.pitch}" data-k="voice.pitch" data-num></div>
        <button class="btn small" id="test-voice" type="button">Testar voz</button>
      </fieldset>
      <fieldset class="fieldset"><legend>MICROFONE / OUVIDO</legend>
        <div class="field"><label>Transcrição da voz</label><select data-k="hearing.engine"><option value="auto" ${s.hearing.engine !== 'browser' ? 'selected' : ''}>Whisper pelo Groq (entende voz baixa; precisa da chave do Groq)</option><option value="browser" ${s.hearing.engine === 'browser' ? 'selected' : ''}>Reconhecimento do Google (do navegador)</option></select></div>
        <p class="hint">${online?.configured ? '🟢 Groq conectado: a sua voz é gravada aqui e transcrita pelo Whisper no Groq (o áudio passa pelos servidores do Groq).' : '⚪ Sem a chave do Groq, o JARVIS usa o reconhecimento do Google.'}</p>
        <label class="switch">Conversa contínua (ouve de novo após perguntas) <input type="checkbox" data-k="hearing.continuousConversation" ${s.hearing.continuousConversation ? 'checked' : ''}></label>
        <label class="switch">Ativação por voz (“Jarvis, …”) <input type="checkbox" data-k="hearing.wakeWord" ${s.hearing.wakeWord ? 'checked' : ''}></label>
        <p class="hint">A ativação por voz mantém o reconhecimento do navegador ligado — no Chrome o áudio é processado pelo serviço do Google. Deixe desligado se preferir privacidade máxima.</p>
        <div class="field"><label>Silêncio para encerrar (ms): <span data-out="hearing.silenceMs">${s.hearing.silenceMs}</span></label><input type="range" min="800" max="4000" step="100" value="${s.hearing.silenceMs}" data-k="hearing.silenceMs" data-num></div>
        <button class="btn small" id="test-mic" type="button">🎙 Testar microfone (3 s)</button>
        <div class="meter" id="set-mic-meter" hidden><span>Fale algo…</span><div class="meter-bar"><i id="set-mic-level"></i></div></div>
      </fieldset>
      <fieldset class="fieldset"><legend>PALMAS</legend>
        <label class="switch">Ativar com duas palmas <input type="checkbox" data-k="clap.enabled" ${s.clap.enabled ? 'checked' : ''}></label>
        <div class="field"><label>Sensibilidade: <span data-out="clap.sensitivity">${s.clap.sensitivity}</span></label><input type="range" min="0" max="1" step="0.05" value="${s.clap.sensitivity}" data-k="clap.sensitivity" data-num></div>
        <div class="field"><label>Intervalo mínimo entre palmas (ms): <span data-out="clap.minGapMs">${s.clap.minGapMs}</span></label><input type="range" min="60" max="400" step="10" value="${s.clap.minGapMs}" data-k="clap.minGapMs" data-num></div>
        <div class="field"><label>Volume mínimo da palma (limiar manual, 0 = automático): <span data-out="clap.thresholdOverride">${s.clap.thresholdOverride}</span></label><input type="range" min="0" max="0.6" step="0.01" value="${s.clap.thresholdOverride}" data-k="clap.thresholdOverride" data-num></div>
        <div class="field"><label>Intervalo máximo entre palmas (ms): <span data-out="clap.maxGapMs">${s.clap.maxGapMs}</span></label><input type="range" min="300" max="1500" step="50" value="${s.clap.maxGapMs}" data-k="clap.maxGapMs" data-num></div>
        <div class="field"><label>Duração máxima de uma palma (ms): <span data-out="clap.maxClapMs">${s.clap.maxClapMs}</span></label><input type="range" min="40" max="250" step="10" value="${s.clap.maxClapMs}" data-k="clap.maxClapMs" data-num></div>
        <div class="field"><label>Tempo de espera após ativar (ms): <span data-out="clap.cooldownMs">${s.clap.cooldownMs}</span></label><input type="range" min="1000" max="8000" step="250" value="${s.clap.cooldownMs}" data-k="clap.cooldownMs" data-num></div>
        <p class="hint">Calibre com o medidor “Nível do microfone” (painel Sistema): a linha laranja é o limiar atual. <b>Limitação:</b> para detecção contínua de palmas com a tela bloqueada, o navegador pode interromper o microfone em segundo plano — deixe o JARVIS aberto (use “Manter tela ligada”).</p>
      </fieldset>
      <fieldset class="fieldset"><legend>INTERFACE</legend>
        <div class="field"><label>Tema</label><select data-k="ui.theme">${[['ciano', 'Ciano'], ['ambar', 'Âmbar'], ['verde', 'Verde']].map(([v, l]) => `<option value="${v}" ${v === s.ui.theme ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Modo</label><select data-k="ui.mode"><option value="desempenho" ${s.ui.mode === 'desempenho' ? 'selected' : ''}>Desempenho (visual completo)</option><option value="economico" ${s.ui.mode === 'economico' ? 'selected' : ''}>Econômico (menos CPU/bateria)</option></select></div>
        <label class="switch">Começar dormindo (acorda com 2 palmas ou “Jarvis”) <input type="checkbox" data-k="ui.startAsleep" ${s.ui.startAsleep !== false ? 'checked' : ''}></label>
        <label class="switch">Animações <input type="checkbox" data-k="ui.animations" ${s.ui.animations ? 'checked' : ''}></label>
        <label class="switch">Partículas <input type="checkbox" data-k="ui.particles" ${s.ui.particles ? 'checked' : ''}></label>
        <label class="switch">Manter tela ligada com o JARVIS aberto <input type="checkbox" data-k="ui.keepAwake" ${s.ui.keepAwake ? 'checked' : ''}></label>
      </fieldset>
      <fieldset class="fieldset"><legend>NOTIFICAÇÕES</legend>
        <p class="hint" style="margin-top:0">Estado: <b id="notif-state">${{ granted: 'permitidas', denied: 'bloqueadas no navegador', default: 'não solicitadas', unsupported: 'não suportadas neste navegador' }[notificationState()]}</b>. Lembretes são avisados enquanto o JARVIS estiver aberto (inclusive em segundo plano, se o navegador permitir). Com o app totalmente fechado, não há aviso — isso exigiria um servidor de push.</p>
        <button class="btn small" id="notif-btn" type="button" ${notificationState() === 'unsupported' ? 'disabled' : ''}>Permitir notificações</button>
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
      const meter = $('#set-mic-meter', body); meter.hidden = false;
      const r = await testMicrophone({ onLevel: (v) => { $('#set-mic-level', body).style.width = `${Math.min(100, v * 160)}%`; } });
      toast(`${r.ok ? '🟢' : '🔴'} ${r.reason}`, 5000);
    });
    $('#groq-save', body).addEventListener('click', async () => {
      const input = $('#groq-key', body);
      const key = input.value.trim();
      if (!key) { toast('Cole a chave do Groq primeiro.'); input.focus(); return; }
      const btn = $('#groq-save', body); btn.disabled = true; btn.textContent = 'Testando…';
      try {
        const r = await api.post('/api/ai/online', { key });
        input.value = '';
        $('#groq-state', body).innerHTML = `🟢 Groq conectado · modelo <b>${esc(r.model)}</b>. Pronto: a IA agora responde rápido.`;
        toast('IA online (Groq) conectada.', 4000);
      } catch (err) {
        $('#groq-state', body).textContent = `🔴 ${err.message}`;
      } finally { btn.disabled = false; btn.textContent = 'Salvar e testar'; }
    });
    const groqRemove = $('#groq-remove', body);
    if (groqRemove) confirmButton(groqRemove, async () => { await api.del('/api/ai/online?confirm=true'); $('#groq-state', body).textContent = '⚪ Groq removido. A IA do celular volta a responder.'; groqRemove.remove(); }, 'Confirmar remoção?');
    $('#notif-btn', body).addEventListener('click', async () => {
      const r = await requestNotifications();
      $('#notif-state', body).textContent = { granted: 'permitidas', denied: 'bloqueadas no navegador', default: 'não solicitadas', unsupported: 'não suportadas' }[r];
      if (r === 'granted') notify('JARVIS', 'Notificações ativadas. Vou avisar seus lembretes aqui.');
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

// ---------------- MÓDULOS ----------------
export async function showModules() {
  openSheet('modules', 'MÓDULOS', async (body) => {
    const [status, cmds] = await Promise.all([api.get('/api/status'), api.get('/api/commands')]);
    const byModule = {};
    for (const c of cmds.commands) (byModule[c.module] ||= []).push(c);
    body.innerHTML = `<div class="form-grid">${status.modules.map((m) => `
      <fieldset class="fieldset"><legend>${esc(m.name)}</legend>
        <p class="hint" style="margin-top:0">Status: <b>${esc(m.label || m.status)}</b> · ${esc(m.info)}</p>
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
    const items = [['📖', 'Bíblia', 'bible'], ['📰', 'Notícias', 'news'], ['🧠', 'Memória', 'memory'], ['🧩', 'Módulos', 'modules'], ['🏠', 'Casa', 'house'], ['⚙️', 'Configurações', 'settings'], ['🩺', 'Diagnóstico', 'diagnostics'], ['💬', 'Conversas', 'conversas'], ['👏', 'Palmas on/off', 'clap'], ['🔇', 'Parar fala', 'stop']];
    body.innerHTML = `<div class="menu-grid">${items.map(([i, l, k]) => `<button data-k="${k}"><span>${i}</span>${l}</button>`).join('')}</div>`;
    $$('[data-k]', body).forEach((b) => b.addEventListener('click', () => handlers[b.dataset.k]?.()));
  });
}
