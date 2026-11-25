// TESTE FINAL — simula um usuário real no navegador (Chromium via Playwright).
// Requer Playwright instalado (npx playwright install chromium), ou o Chromium
// do sistema via PLAYWRIGHT_CHROMIUM=/caminho.
//
// - Microfone: arquivo WAV com duas palmas (Chromium --use-file-for-fake-audio-capture).
// - Reconhecimento de fala: substituído por um simulador com frases roteirizadas
//   (o serviço real do navegador não roda em modo headless).
// - Síntese de voz: interceptada para verificar o que o JARVIS FALA.
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
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t }); console.log(`  ✔ ${name}`); }
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

function startServer() {
  const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', JARVIS_DATA_DIR: dataDir, ANTHROPIC_API_KEY: '', JARVIS_ACCESS_TOKEN: '' };
  const p = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => { if (String(d).includes('JARVIS online')) resolve(p); });
    p.stderr.on('data', (d) => process.stderr.write(d));
    setTimeout(() => reject(new Error('servidor não iniciou')), 10000);
  });
}

// ---------- simuladores injetados na página ----------
const INIT = () => {
  window.__spoken = [];
  window.__transcripts = [];
  window.__listenCount = 0;
  class FakeRecognition {
    start() {
      window.__listenCount++;
      setTimeout(() => this.onstart?.(), 30);
      const text = window.__transcripts.shift();
      setTimeout(() => {
        if (text) {
          const r = [{ transcript: text }]; r.isFinal = true;
          this.onresult?.({ resultIndex: 0, results: [r] });
        }
        setTimeout(() => this.onend?.(), 50);
      }, 400);
    }
    stop() {} abort() { this.onend?.(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  const synth = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: () => [{ name: 'Teste pt-BR', lang: 'pt-BR', localService: true }],
    speak(u) { if (u.text.trim()) window.__spoken.push(u.text); this.speaking = true; setTimeout(() => { this.speaking = false; u.onend?.(); }, 30); },
    cancel() { this.speaking = false; }, pause() {}, resume() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
};

async function say(page, text) {
  await page.evaluate((t) => window.__transcripts.push(t), text);
  const before = await page.evaluate(() => document.querySelectorAll('.msg.jarvis').length);
  await page.click((await page.isVisible('#overlay')) ? '#sheet-mic' : '#mic-btn');
  await page.waitForFunction((b) => document.querySelectorAll('.msg.jarvis').length > b, before, { timeout: 15000 });
  await page.waitForFunction(() => document.body.dataset.state !== 'thinking', null, { timeout: 15000 });
}
const lastJarvis = (page) => page.evaluate(() => [...document.querySelectorAll('.msg.jarvis')].pop()?.textContent || '');
const spoken = (page) => page.evaluate(() => window.__spoken.slice());
async function openApp(context) {
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|Failed to load resource/.test(m.text())) page.__errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('#boot-start:not([hidden])');
  await page.click('#boot-start');
  await page.waitForSelector('#boot', { state: 'detached' });
  return page;
}

const server = await startServer();
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'],
});
console.log('\nTESTE FINAL — JARVIS\n');
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  await ctx.addInitScript(INIT);
  let page;

  await step('1. Abrir o JARVIS', async () => { page = await openApp(ctx); });
  await step('2. Verificar interface (núcleo, módulos, relógio, sistema)', async () => {
    assert(await page.isVisible('#core-canvas'), 'núcleo ausente');
    assert((await page.textContent('#core-state')).match(/ONLINE|SPEAKING/), 'estado inicial inválido');
    assert(await page.locator('#module-grid li').count() === 11, 'módulos faltando');
    assert(/\d\d:\d\d/.test(await page.textContent('#clock-time')), 'relógio');
    await page.screenshot({ path: path.join(SHOTS, '01-interface.png') });
  });
  await step('3. Ativar com DUAS PALMAS (áudio real pelo microfone falso)', async () => {
    await page.evaluate(() => window.__transcripts.push('Que horas são?'));
    await page.waitForFunction(() => window.__spoken.includes('Sim?'), null, { timeout: 15000 });
    await page.waitForFunction(() => window.__listenCount >= 1, null, { timeout: 5000 });
  });
  await step('4–5. Pergunta por voz → resposta falada (hora)', async () => {
    await page.waitForFunction(() => window.__spoken.some((s) => /^Agora são/.test(s)), null, { timeout: 15000 });
    assert(/Agora são/.test(await lastJarvis(page)), 'resposta da hora não exibida');
  });
  await step('6–7. "Bíblia" → abre Gênesis 2 (leitura de hoje Gênesis 2–4)', async () => {
    await say(page, 'Bíblia');
    await page.waitForSelector('#bible-page .verse');
    assert((await page.textContent('#bible-page h3')) === 'Gênesis 2', 'capítulo errado');
    assert((await page.textContent('#reader-side')).includes('Gênesis 2–4'), 'plano errado');
    await page.screenshot({ path: path.join(SHOTS, '02-biblia.png') });
  });
  let firstVerseAfterNext;
  await step('8. "Passe a página" → avança', async () => {
    const before = await page.textContent('#bible-page .verse sup');
    await say(page, 'Passe a página');
    await page.waitForTimeout(600);
    firstVerseAfterNext = await page.textContent('#bible-page .verse sup');
    assert(Number(firstVerseAfterNext) > Number(before), `página não avançou (${before} → ${firstVerseAfterNext})`);
  });
  await step('9. "Volta" (contexto) → volta a página', async () => {
    await say(page, 'Volta');
    await page.waitForTimeout(600);
    assert((await page.textContent('#bible-page .verse sup')) === '1', 'não voltou');
    await say(page, 'Avança'); // deixa na página 2 para testar a persistência
    await page.waitForTimeout(600);
  });
  await step('10. Fechar o JARVIS', async () => { await page.close(); });
  await step('11–12. Abrir novamente → progresso mantido', async () => {
    page = await openApp(ctx);
    assert((await page.textContent('#bible-mini')).includes('Gênesis 2–4'), 'mini painel sem a leitura');
    await say(page, 'Continue de onde parei');
    await page.waitForSelector('#bible-page .verse');
    assert((await page.textContent('#bible-page .verse sup')) === firstVerseAfterNext, 'não retomou na mesma página');
    await page.keyboard.press('Escape');
  });
  await step('13. Conversa normal (sem IA configurada → resposta honesta)', async () => {
    await say(page, 'Oi JARVIS, tudo bem?');
    assert(/Estou online|configure a chave/.test(await lastJarvis(page)), await lastJarvis(page));
  });
  await step('14. Pergunta técnica (motor) → cálculo local correto', async () => {
    await say(page, 'Qual a potência com 300 Nm a 4000 rpm?');
    assert(/125,7 kW/.test(await lastJarvis(page)), await lastJarvis(page));
    await say(page, 'quanto é 15% de 230?');
    assert(/34,5/.test(await lastJarvis(page)), await lastJarvis(page));
  });
  await step('15–16. Desabafo → mudança de tom', async () => {
    await say(page, 'JARVIS, estou cansado hoje, foi um dia difícil.');
    assert((await page.textContent('#sys-tone')) === 'DESABAFO', `tom: ${await page.textContent('#sys-tone')}`);
    assert(/sinto muito/.test(await lastJarvis(page)), 'resposta não acolhedora');
    await say(page, 'Que dia é hoje?');
    assert((await page.textContent('#sys-tone')) === 'ORDEM', 'tom não mudou para ordem');
  });
  await step('Memória: lembrar, consultar e apagar com confirmação', async () => {
    await say(page, 'Lembre que meu carro é um Gol 2014');
    await say(page, 'O que você lembra sobre meu carro?');
    assert(/Gol 2014/.test(await lastJarvis(page)), 'memória não recuperada');
    await say(page, 'Esqueça que meu carro é um Gol');
    assert(/Tem certeza/.test(await lastJarvis(page)), 'não pediu confirmação');
    await page.click('.confirm-actions button:first-child');
    await page.waitForFunction(() => /Memória apagada/.test([...document.querySelectorAll('.msg.jarvis')].pop()?.textContent));
  });
  await step('17–18. Diagnóstico: logs (palmas, comandos) e permissões', async () => {
    await page.keyboard.press('d');
    await page.waitForSelector('.diag-table');
    const txt = await page.textContent('#sheet-body');
    assert(/Permissão do microfone/.test(txt) && /CONCEDIDA/.test(txt), 'permissão não exibida/concedida');
    assert(/palmas: Duas palmas detectadas/.test(txt), 'log de palmas ausente');
    assert(/comandos: Comando: bible\.open/.test(txt), 'log de comandos ausente');
    await page.screenshot({ path: path.join(SHOTS, '03-diagnostico.png') });
    await page.keyboard.press('Escape');
  });
  await step('19. Erros: servidor caindo → estado ERROR e mensagem clara', async () => {
    await page.route('**/api/input', (r) => r.abort());
    await page.fill('#command-input', 'que horas são');
    await page.press('#command-input', 'Enter');
    await page.waitForFunction(() => document.body.dataset.state === 'error');
    assert(/Sem conexão com o servidor/.test(await page.textContent('#transcript')), 'mensagem de erro');
    await page.unroute('**/api/input');
    assert(page.__errors.length === 0, `erros JS: ${page.__errors.join(' | ')}`);
  });
  await ctx.close();

  await step('20. Celular (Pixel 7): layout, dock, leitura e gesto de deslizar', async () => {
    const m = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'] });
    await m.addInitScript(INIT);
    const p = await openApp(m);
    assert(await p.isVisible('.dock'), 'dock ausente');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, 'rolagem horizontal no celular');
    await p.screenshot({ path: path.join(SHOTS, '04-celular.png') });
    await p.click('.dock button[data-say="Bíblia"]');
    await p.waitForSelector('#bible-page .verse');
    const before = await p.textContent('#bible-page .verse sup');
    const box = await p.locator('#bible-page').boundingBox();
    await p.dispatchEvent('#bible-page', 'touchstart', { touches: [{ identifier: 1, clientX: box.x + box.width - 20, clientY: box.y + 100 }] }).catch(() => {});
    await p.evaluate(() => {
      const el = document.getElementById('bible-page');
      const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(350)], changedTouches: [mk(350)] }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(120)] }));
    });
    await p.waitForTimeout(800);
    const after = await p.textContent('#bible-page .verse sup');
    assert(Number(after) > Number(before), `deslizar não virou a página (${before} → ${after})`);
    await p.screenshot({ path: path.join(SHOTS, '05-celular-biblia.png') });
    assert(p.__errors.length === 0, `erros JS: ${p.__errors.join(' | ')}`);
    await m.close();
  });
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} etapas aprovadas. Capturas em tests/e2e/screenshots/`);
process.exit(failed.length ? 1 : 0);
