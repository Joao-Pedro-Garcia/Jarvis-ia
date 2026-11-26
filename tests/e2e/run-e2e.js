// TESTE FINAL (Fase 2) — simula um usuário real no navegador (Chromium/Playwright).
//
// O QUE É REAL: servidor, cérebro, Bíblia, memória, tarefas, agendador de
// lembretes, notificação via Service Worker, PWA, Web Audio + AudioWorklet +
// detector de palmas (alimentado por um WAV pelo microfone falso do Chromium),
// teste de microfone (getUserMedia), modo offline do navegador, reinício do servidor.
// O QUE É SIMULADO: reconhecimento de fala (frases roteirizadas — o serviço real
// não roda sem tela) e síntese de voz (interceptada para registrar o que é falado).
// FONTES EXTERNAS: dependem da rede onde o teste roda; se estiverem bloqueadas,
// o teste verifica o comportamento correto de indisponibilidade (sem inventar dados).
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeClapWav } from './make-wav.js';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { console.error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium'); process.exit(2); }
const { chromium, devices } = playwright;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, 'tests', 'e2e', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
async function step(name, fn) {
  try { const note = await fn(); results.push({ name, ok: true, note }); console.log(`  ✔ ${name}${note ? ` — ${note}` : ''}`); }
  catch (err) { results.push({ name, ok: false, error: err.message }); console.log(`  ✘ ${name}\n      ${err.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// ---------- servidor isolado ----------
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-e2e-'));
const realBible = path.join(ROOT, 'data', 'bible', 'acf.json');
fs.mkdirSync(path.join(dataDir, 'bible'), { recursive: true });
if (fs.existsSync(realBible)) fs.copyFileSync(realBible, path.join(dataDir, 'bible', 'acf.json'));
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ clap: { enabled: true, sensitivity: 0.6 } }));
const wav = path.join(dataDir, 'claps.wav');
makeClapWav(wav);

let server;
function startServer() {
  const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', JARVIS_DATA_DIR: dataDir, ANTHROPIC_API_KEY: '', AI_PROVIDER: '', AI_API_KEY: '', JARVIS_ACCESS_TOKEN: '', JARVIS_REMINDER_INTERVAL_MS: '1000' };
  const p = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => { if (String(d).includes('JARVIS online')) resolve(p); });
    p.stderr.on('data', (d) => process.stderr.write(d));
    setTimeout(() => reject(new Error('servidor não iniciou')), 10000);
  });
}

// ---------- simuladores injetados na página (só fala) ----------
const INIT = () => {
  window.__spoken = [];
  window.__transcripts = [];
  window.__bargeQueue = [];
  window.__listenCount = 0;
  window.__cancelled = 0;
  class FakeRecognition {
    start() {
      // Durante a fala do JARVIS, o reconhecimento é o de "interrupção por voz".
      if (window.speechSynthesis.speaking) {
        const t = window.__bargeQueue.shift();
        if (t) setTimeout(() => { const r = [{ transcript: t }]; r.isFinal = true; this.onresult?.({ resultIndex: 0, results: [r] }); }, 120);
        return;
      }
      window.__listenCount++;
      setTimeout(() => this.onstart?.(), 30);
      const text = window.__transcripts.shift();
      setTimeout(() => {
        if (text) { const r = [{ transcript: text }]; r.isFinal = true; this.onresult?.({ resultIndex: 0, results: [r] }); }
        setTimeout(() => this.onend?.(), 50);
      }, 400);
    }
    stop() {} abort() { this.onend?.(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  let cur = null;
  const synth = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: () => [{ name: 'Teste pt-BR', lang: 'pt-BR', localService: true }],
    speak(u) { if (u.text.trim()) window.__spoken.push(u.text); this.speaking = true; cur = u; setTimeout(() => u.onstart?.(), 5); u.__t = setTimeout(() => { this.speaking = false; cur = null; u.onend?.(); }, 250); },
    cancel() { if (cur) { clearTimeout(cur.__t); window.__cancelled++; const c = cur; setTimeout(() => c.onerror?.({ error: 'interrupted' }), 0); } this.speaking = false; cur = null; },
    pause() { this.paused = true; }, resume() { this.paused = false; },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
};

async function say(page, text) {
  // Marca as respostas já existentes e espera uma resposta NOVA (não depende da
  // contagem, que não sobe quando a tela atinge o limite de mensagens).
  await page.evaluate(() => document.querySelectorAll('.msg.jarvis').forEach((m) => { m.dataset.seen = '1'; }));
  const answered = () => page.evaluate(() => !!document.querySelector('.msg.jarvis:not([data-seen])'));
  // Só toca no microfone com o JARVIS realmente parado: sem falar, sem ouvir e sem
  // "ativando microfone" (após uma pergunta ele volta a ouvir sozinho — conversa
  // contínua — e um toque nessa hora encerra a escuta). O microfone falso também
  // repete duas palmas a cada 6 s; se a frase não for ouvida, tenta de novo (até 3 vezes).
  const idle = () => page.waitForFunction(() => document.body.dataset.state === 'standby'
    && !/ATIVANDO/.test(document.getElementById('core-sub').textContent) && !window.speechSynthesis.speaking, null, { timeout: 30000 }).catch(() => {});
  for (let attempt = 1; ; attempt++) {
    await idle();
    await page.waitForTimeout(150);
    await idle();
    if (await answered()) break;
    await page.evaluate((t) => { if (!window.__transcripts.includes(t)) window.__transcripts.push(t); }, text);
    await page.click((await page.isVisible('#overlay')) ? '#sheet-mic' : '#mic-btn');
    const ok = await page.waitForFunction(() => !!document.querySelector('.msg.jarvis:not([data-seen])') || document.body.dataset.state === 'thinking', null, { timeout: 8000 }).then(() => true, () => false);
    if (ok) break;
    if (attempt >= 3) throw new Error(`frase não ouvida após 3 tentativas: "${text}"`);
  }
  await page.waitForFunction(() => !!document.querySelector('.msg.jarvis:not([data-seen])'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.body.dataset.state !== 'thinking', null, { timeout: 30000 });
}
const lastJarvis = (page) => page.evaluate(() => [...document.querySelectorAll('.msg.jarvis')].pop()?.textContent || '');
async function openApp(context) {
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) page.__errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('#boot-start:not([hidden])');
  await page.click('#boot-start');
  await page.waitForSelector('#boot', { state: 'detached' });
  return page;
}
const closeSheets = (page) => page.evaluate(() => document.getElementById('sheet-close')?.click());

server = await startServer();
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'],
});
console.log('\nTESTE FINAL — JARVIS (v2.1)\n');
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone', 'notifications'] });
  await ctx.addInitScript(INIT);
  let page;

  await step('1. Abrir', async () => { page = await ctx.newPage(); page.__errors = []; page.on('pageerror', (e) => page.__errors.push(e.message)); await page.goto(BASE); });
  await step('2. Inicializar (sequência de sistemas)', async () => {
    await page.waitForSelector('#boot-start:not([hidden])');
    const log = await page.textContent('#boot-log');
    assert(/Cérebro online/.test(log) && /Voz online/.test(log) && /Memória online/.test(log) && /JARVIS pronto/.test(log), log);
    await page.click('#boot-start');
    await page.waitForSelector('#boot', { state: 'detached' });
    return log.replace(/\s+/g, ' ').slice(0, 90);
  });
  await step('3. Diagnóstico com semáforo (16 componentes, motivo ao tocar)', async () => {
    await page.keyboard.press('d');
    await page.waitForSelector('.diag-grid');
    assert(await page.locator('.diag-item').count() === 16, 'faltam componentes');
    await page.click('.diag-item[data-id="ia"]');
    assert(/Não configurada/.test(await page.textContent('#diag-reason')), 'motivo da IA');
    await page.screenshot({ path: path.join(SHOTS, '01-diagnostico.png') });
  });
  await step('4. Permitir microfone + teste REAL de microfone (getUserMedia)', async () => {
    await page.click('#diag-mic');
    await page.waitForSelector('.toast:not([hidden])', { timeout: 8000 });
    const t = await page.textContent('#toast');
    assert(/Microfone captando som/.test(t), t);
    await closeSheets(page);
    return 'áudio do microfone falso do Chromium';
  });
  await step('5. Testar voz (configurações → Testar voz)', async () => {
    await page.keyboard.press('s');
    await page.waitForSelector('#test-voice');
    await page.click('#test-voice');
    await page.waitForFunction(() => window.__spoken.includes('Olá. Esta é a minha voz atual.'));
    await closeSheets(page);
    return 'síntese interceptada (SIMULADA)';
  });
  await step('6–7. Duas palmas (áudio real) → "Sim?" → pergunta por voz → resposta falada', async () => {
    await page.evaluate(() => window.__transcripts.push('Que horas são?'));
    await page.waitForFunction(() => window.__spoken.includes('Sim?'), null, { timeout: 20000 });
    await page.waitForFunction(() => window.__spoken.some((s) => /^Agora são/.test(s)), null, { timeout: 15000 });
  });
  await step('8. Interrupção: "pare" durante a fala interrompe na hora', async () => {
    await page.evaluate(() => { window.__bargeQueue.push('pare'); window.__cancelled = 0; });
    await page.fill('#command-input', 'status'); await page.press('#command-input', 'Enter');
    await page.waitForFunction(() => window.__cancelled > 0, null, { timeout: 10000 });
    await page.waitForFunction(() => document.body.dataset.state === 'standby');
    return 'reconhecimento de "pare" SIMULADO; parada da fala real';
  });
  let firstVerseAfterNext;
  await step('9. Abrir Bíblia (Gênesis 2–4)', async () => {
    await say(page, 'Bíblia');
    await page.waitForSelector('#bible-page .verse');
    assert((await page.textContent('#bible-page h3')) === 'Gênesis 2', 'capítulo errado');
    assert((await page.textContent('#reader-side')).includes('Gênesis 2–4'), 'plano errado');
  });
  await step('10. Avançar página ("avance", por contexto)', async () => {
    const before = await page.textContent('#bible-page .verse sup');
    await say(page, 'avance'); await page.waitForTimeout(600);
    firstVerseAfterNext = await page.textContent('#bible-page .verse sup');
    assert(Number(firstVerseAfterNext) > Number(before), 'não avançou');
  });
  await step('11. Voltar ("volta uma") e avançar de novo', async () => {
    await say(page, 'volta uma'); await page.waitForTimeout(600);
    assert((await page.textContent('#bible-page .verse sup')) === '1', 'não voltou');
    await say(page, 'passe a página'); await page.waitForTimeout(600);
    const w = await (await say(page, 'onde parei?'), lastJarvis(page));
    assert(/Gênesis 2, versículo \d+, página 2/.test(w), w);
  });
  await step('12. Fechar', async () => { await page.close(); });
  await step('13–14. Reabrir → progresso mantido (mesma página)', async () => {
    page = await openApp(ctx);
    await say(page, 'continue minha leitura');
    await page.waitForSelector('#bible-page .verse');
    assert((await page.textContent('#bible-page .verse sup')) === firstVerseAfterNext, 'não retomou');
    await closeSheets(page);
  });
  await step('15. Notícias (dados reais se a rede permitir; senão, indisponibilidade honesta)', async () => {
    await say(page, 'Notícias');
    await page.waitForSelector('.news-grid', { timeout: 60000 });
    const t = await page.textContent('#sheet-body');
    const real = /R\$ \d/.test(t);
    assert(real || /Não consegui confirmar a cotação atual/.test(t), 'câmbio sem valor e sem aviso');
    await page.screenshot({ path: path.join(SHOTS, '02-noticias.png') });
    await closeSheets(page);
    return real ? 'fontes reais acessíveis' : 'fontes externas BLOQUEADAS neste ambiente → avisos corretos, nada inventado';
  });
  await step('16. Consultar dólar', async () => {
    await say(page, 'quanto está o dólar?');
    const t = await lastJarvis(page);
    assert(/Dólar: R\$ \d/.test(t) || /Não consegui confirmar a cotação atual/.test(t), t);
    await closeSheets(page);
  });
  await step('17. Consultar gasolina', async () => {
    await say(page, 'quanto está a gasolina?');
    const t = await lastJarvis(page);
    assert(/Gasolina comum: R\$/.test(t) || /Não consegui confirmar os preços atuais/.test(t), t);
    await closeSheets(page);
  });
  await step('18–19. Criar e consultar memória', async () => {
    await say(page, 'Lembre que meu carro é um Gol 2014');
    await say(page, 'O que você lembra sobre meu carro?');
    assert(/Gol 2014/.test(await lastJarvis(page)), 'memória não recuperada');
  });
  await step('20–21. Criar tarefa com horário e consultar', async () => {
    await say(page, 'Me lembra de estudar às 19h');
    assert(/Lembrete criado: Estudar, (hoje|amanhã) às 19h00/.test(await lastJarvis(page)), await lastJarvis(page));
    await say(page, 'Quais são minhas tarefas?');
    assert(/Estudar/.test(await lastJarvis(page)), 'tarefa não listada');
  });
  await step('Lembrete vencido → aviso na tela (+ notificação do sistema se permitida)', async () => {
    await page.evaluate(() => fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Tomar água', dueAt: new Date(Date.now() - 500).toISOString(), hasTime: true }) }));
    await page.waitForFunction(() => /⏰ Lembrete: Tomar água/.test(document.getElementById('transcript').textContent), null, { timeout: 10000 });
    const perm = await page.evaluate(() => Notification.permission);
    if (perm !== 'granted') return `notificação do sistema NÃO TESTADA: o Chromium headless nega a permissão (estado: ${perm})`;
    const n = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((x) => x.body));
    assert(n.includes('Tomar água'), `notificação não exibida (${JSON.stringify(n)})`);
    return 'notificação exibida via Service Worker';
  });
  await step('22. Modo silencioso (não fala, mas responde na tela) e volta a falar', async () => {
    await say(page, 'JARVIS, fique silencioso');
    const before = await page.evaluate(() => window.__spoken.length);
    await say(page, 'que horas são?');
    assert(/Agora são/.test(await lastJarvis(page)), 'sem resposta na tela');
    assert((await page.evaluate(() => window.__spoken.length)) === before, 'falou em modo silencioso');
    assert(await page.isVisible('.chip-silent'), 'indicador de silêncio ausente');
    await say(page, 'volte a falar');
    await page.waitForFunction(() => window.__spoken.includes('Voltei a falar.'));
  });
  await step('23. Pergunta técnica (cálculo local)', async () => {
    await say(page, 'Qual a potência com 300 Nm a 4000 rpm?');
    assert(/125,7 kW/.test(await lastJarvis(page)), await lastJarvis(page));
  });
  await step('24. Modo offline: sem rede → banner, contas locais e última página da Bíblia', async () => {
    await ctx.setOffline(true);
    try {
    await page.fill('#command-input', 'quanto é 7 vezes 8?'); await page.press('#command-input', 'Enter');
    await page.waitForFunction(() => /7 × 8 = 56/.test(document.getElementById('transcript').textContent), null, { timeout: 15000 });
    assert(/SERVIDOR INACESSÍVEL/.test(await page.textContent('#banner')), 'banner offline ausente');
    await page.waitForFunction(() => document.getElementById('jarvis-status').textContent === 'OFFLINE', null, { timeout: 10000 }).catch(() => {});
    assert((await page.textContent('#jarvis-status')) === 'OFFLINE', `estado no topo: ${await page.textContent('#jarvis-status')}`);
    await page.fill('#command-input', 'quanto tempo para 150 km a 90 km/h'); await page.press('#command-input', 'Enter');
    await page.waitForFunction(() => /1 h 40 min/.test(document.getElementById('transcript').textContent), null, { timeout: 15000 });
    await page.fill('#command-input', 'Bíblia'); await page.press('#command-input', 'Enter');
    await page.waitForSelector('#bible-page .verse');
    assert(/última página salva/.test(await page.textContent('#transcript')), 'sem página em cache');
    await page.screenshot({ path: path.join(SHOTS, '03-offline.png') });
    await closeSheets(page);
    } finally { await ctx.setOffline(false); }
    await page.fill('#command-input', 'que dia é hoje?'); await page.press('#command-input', 'Enter');
    await page.waitForFunction(() => document.getElementById('banner').hidden, null, { timeout: 15000 });
  });
  await step('25. "Faça um diagnóstico" → testes reais → "Diagnóstico concluído"', async () => {
    await say(page, 'JARVIS, faça um diagnóstico');
    await page.waitForFunction(() => /Diagnóstico concluído/.test(document.getElementById('selftest-sum')?.textContent || ''), null, { timeout: 120000 });
    const sum = await page.textContent('#selftest-sum');
    await page.screenshot({ path: path.join(SHOTS, '04-autodiagnostico.png') });
    await closeSheets(page);
    return sum;
  });
  await step('Ajuda e status por voz', async () => {
    await say(page, 'JARVIS, ajuda.'); assert(/Bíblia/.test(await lastJarvis(page)) && /Silêncio/.test(await lastJarvis(page)), 'ajuda');
    await say(page, 'JARVIS, status.'); assert(/Microfone:/.test(await lastJarvis(page)) && /IA: não configurada/.test(await lastJarvis(page)), 'status');
  });
  await step('28. Cálculo de MOTOR: 80 km/h durante 12 minutos', async () => {
    await say(page, 'JARVIS, se eu andar a 80 km/h durante 12 minutos, quantos quilômetros percorro?');
    const t = await lastJarvis(page); assert(/16 km/.test(t) && /d = v × t/.test(t), t); return t.slice(0, 70);
  });
  await step('29. Cálculo de ENGENHARIA: força, custo de viagem e rpm', async () => {
    await say(page, 'qual a força para 10 kg a 9,8 m/s2'); assert(/98 N/.test(await lastJarvis(page)), await lastJarvis(page));
    await say(page, 'quanto gasto em 300 km com 10 km/l e gasolina a 6,20'); assert(/R\$ 186,00/.test(await lastJarvis(page)), await lastJarvis(page));
    await say(page, 'converta 100 km/h para m/s'); assert(/27,7778 m\/s/.test(await lastJarvis(page)), await lastJarvis(page));
  });
  await step('30. Conversa sem IA: desabafo acolhido, revisão e tarefa em duas etapas', async () => {
    await say(page, 'estou mal hoje'); assert(/sinto muito/i.test(await lastJarvis(page)), await lastJarvis(page));
    await say(page, 'faça uma revisão'); assert(/Revisão/.test(await lastJarvis(page)), await lastJarvis(page));
    await page.fill('#command-input', 'crie uma tarefa'); await page.press('#command-input', 'Enter');
    await page.waitForFunction(() => /Qual é a tarefa/.test(document.getElementById('transcript').textContent), null, { timeout: 15000 });
    await page.fill('#command-input', 'trocar o óleo do carro'); await page.press('#command-input', 'Enter');
    await page.waitForFunction(() => /Tarefa anotada: Trocar o óleo do carro/.test(document.getElementById('transcript').textContent), null, { timeout: 15000 });
  });
  await step('31. Estado no topo e camada INTERNET', async () => {
    await page.waitForFunction(() => !['FALANDO', 'PROCESSANDO', 'OUVINDO'].includes(document.getElementById('jarvis-status').textContent), null, { timeout: 15000 });
    const badge = await page.textContent('#jarvis-status');
    assert(['ONLINE', 'LIMITADO', 'OFFLINE'].includes(badge), badge);
    const net = await page.evaluate(() => fetch('/api/internet').then((r) => r.json()));
    assert(['online', 'limited', 'offline'].includes(net.state), JSON.stringify(net));
    return `topo: ${badge} · internet do servidor: ${net.state} (${net.probes.map((p) => `${p.id} ${p.ok ? 'ok' : 'falhou'}`).join(', ')})`;
  });
  await step('32. Diagnóstico: testar voz, testar palmas (áudio real) e notificações', async () => {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('d');
    await page.waitForSelector('#diag-voice');
    await page.click('#diag-voice');
    await page.waitForFunction(() => /^(🟢|🟡|🔴)/.test(document.getElementById('diag-test-out')?.textContent || ''), null, { timeout: 20000 });
    const voice = await page.textContent('#diag-test-out');
    assert(/interrupção OK/.test(voice), voice);
    await page.click('#diag-clap');
    await page.waitForFunction(() => /Palmas:/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 20000 });
    const clap = await page.textContent('#diag-test-out');
    assert(/PALMS_DETECTED/.test(clap), clap);
    const help = await page.textContent('#notif-help');
    assert(help.length > 30, 'sem instruções de notificação');
    await closeSheets(page);
    return `voz SIMULADA (síntese falsa do teste) · palmas: áudio real do microfone falso · notificações: ${(await page.evaluate(() => Notification.permission))}`;
  });
  await step('33. Botão PARAR FALA interrompe a resposta', async () => {
    await page.evaluate(() => { window.__cancelled = 0; });
    await page.fill('#command-input', 'ajuda'); await page.press('#command-input', 'Enter');
    await page.waitForSelector('#stop-speech:not([hidden])', { timeout: 10000 });
    await page.click('#stop-speech');
    await page.waitForSelector('#stop-speech', { state: 'hidden', timeout: 5000 });
    assert(await page.evaluate(() => window.__cancelled) > 0, 'fala não foi cancelada');
  });
  await step('34. Recarregar a página → progresso mantido', async () => {
    await page.reload();
    await page.waitForSelector('#boot-start:not([hidden])');
    await page.click('#boot-start');
    await page.waitForSelector('#boot', { state: 'detached' });
    await say(page, 'onde parei?'); assert(/Gênesis 2, versículo \d+/.test(await lastJarvis(page)), await lastJarvis(page));
  });
  await step('Configuração persistente (tema âmbar)', async () => {
    await page.evaluate(() => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ui: { theme: 'ambar' } }) }));
  });
  assert(page.__errors.length === 0, `erros JS: ${page.__errors.join(' | ')}`);
  await page.close();

  await step('26. Reiniciar o servidor', async () => {
    server.kill(); await new Promise((r) => setTimeout(r, 500));
    server = await startServer();
  });
  await step('27. Persistência após reinício: memória, tarefas, Bíblia e configurações', async () => {
    page = await openApp(ctx);
    assert((await page.getAttribute('body', 'data-theme')) === 'ambar', 'configuração perdida');
    await say(page, 'O que você lembra sobre meu carro?'); assert(/Gol 2014/.test(await lastJarvis(page)), 'memória perdida');
    await say(page, 'Quais são minhas tarefas?'); assert(/Estudar/.test(await lastJarvis(page)), 'tarefa perdida');
    await say(page, 'onde parei?'); assert(/Gênesis 2, versículo \d+, página 2/.test(await lastJarvis(page)), 'Bíblia perdida');
    assert(page.__errors.length === 0, `erros JS: ${page.__errors.join(' | ')}`);
    await page.close();
  });
  await ctx.close();

  await step('Celular (Pixel 7 emulado): layout, gesto, PWA instalável', async () => {
    const m = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'] });
    await m.addInitScript(INIT);
    const p = await openApp(m);
    assert(await p.isVisible('.dock'), 'dock ausente');
    assert(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'rolagem horizontal');
    const pwa = await p.evaluate(async () => {
      const man = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
      const icons = await Promise.all(man.icons.filter((i) => i.type === 'image/png').map(async (i) => ({ sizes: i.sizes, ok: (await fetch(i.src)).ok })));
      const reg = await navigator.serviceWorker.ready;
      return { display: man.display, name: man.short_name, icons, sw: !!reg.active, start: man.start_url };
    });
    assert(pwa.display === 'standalone' && pwa.sw && pwa.icons.some((i) => i.sizes === '192x192' && i.ok) && pwa.icons.some((i) => i.sizes === '512x512' && i.ok), JSON.stringify(pwa));
    await p.screenshot({ path: path.join(SHOTS, '05-celular.png') });
    await p.click('.dock button[data-say="Bíblia"]');
    await p.waitForSelector('#bible-page .verse');
    const before = await p.textContent('#bible-page .verse sup');
    await p.evaluate(() => {
      const el = document.getElementById('bible-page');
      const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(350)], changedTouches: [mk(350)] }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(120)] }));
    });
    await p.waitForTimeout(800);
    assert(Number(await p.textContent('#bible-page .verse sup')) !== Number(before), 'deslizar não virou a página');
    await p.screenshot({ path: path.join(SHOTS, '06-celular-biblia.png') });
    assert(p.__errors.length === 0, `erros JS: ${p.__errors.join(' | ')}`);
    await m.close();
    return 'manifest standalone, ícones 192/512, service worker ativo (instalação física NÃO testada)';
  });
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} etapas aprovadas. Capturas em tests/e2e/screenshots/`);
process.exit(failed.length ? 1 : 0);
