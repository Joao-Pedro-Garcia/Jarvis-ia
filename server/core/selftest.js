// AUTO-DIAGNÓSTICO (parte do servidor): executa testes REAIS e rápidos.
// Microfone e voz são testados no navegador (public/js/ui/selftest.js).
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';
import { internetStatus, INTERNET_LABEL } from './http-client.js';
import * as llm from '../brain/llm.js';
import * as memory from '../modules/memory/memory.js';
import * as tasks from '../modules/tasks/tasks.js';
import { getChapter, status as bibleStatus } from '../modules/bible/provider.js';
import { getExchange } from '../modules/news/exchange.js';
import { getFuel } from '../modules/news/fuel.js';
import { fetchAll } from '../modules/news/feeds.js';

const OK = 'ok', LIMITED = 'limited', FAIL = 'fail';

async function timed(fn) { const t = Date.now(); try { const r = await fn(); return { ...r, ms: Date.now() - t }; } catch (err) { return { status: FAIL, detail: err.message, ms: Date.now() - t }; } }

export async function runSelfTest({ includeAI = true } = {}) {
  const net = await internetStatus({ force: true });
  const online = net.online;
  await llm.refresh({ force: true }).catch(() => {});
  const checks = {
    armazenamento: () => timed(async () => {
      const f = path.join(DATA_DIR, `.selftest-${process.pid}`);
      fs.writeFileSync(f, 'ok'); const ok = fs.readFileSync(f, 'utf8') === 'ok'; fs.rmSync(f);
      return { status: ok ? OK : FAIL, detail: ok ? `Leitura e escrita em ${DATA_DIR}` : 'Falha de leitura' };
    }),
    internet: () => timed(async () => ({ status: net.state === 'online' ? OK : net.state === 'limited' ? LIMITED : FAIL, detail: `${INTERNET_LABEL[net.state]} · ${net.probes.map((p) => `${p.id} ${p.ok ? `${p.ms} ms` : p.error}`).join(' · ')}` })),
    ia: () => timed(async () => {
      const st = llm.status();
      if (!st.configured) return { status: FAIL, detail: `IA INDISPONÍVEL — nenhuma IA local encontrada${st.localProbe?.reason ? ` (${st.localProbe.reason})` : ''}. Modo local inteligente ativo.` };
      if (!includeAI) return { status: OK, detail: `${st.state} — ${st.providerName} · ${st.model} (sem chamada de teste)` };
      // IA local: teste real e gratuito. IA online: só com ?ai=1 explícito (gasta tokens).
      if (st.kind === 'online' && !st.free && includeAI !== 'force') return { status: OK, detail: `${st.state} — ${st.providerName} · ${st.model} (configurada; teste real não executado para não gastar créditos)` };
      const p = await llm.ping();
      return { status: p.ok ? OK : LIMITED, detail: `${st.state} — ${st.providerName} · ${st.model} respondeu em ${p.ms} ms` };
    }),
    memoria: () => timed(async () => { const m = memory.list(); return { status: OK, detail: `${m.facts.length} memórias, ${m.preferences.length} preferências` }; }),
    tarefas: () => timed(async () => ({ status: OK, detail: `${tasks.list().length} pendente(s); agendador de lembretes ativo` })),
    biblia: () => timed(async () => {
      const ch = await getChapter('gn', 1);
      return { status: ch.verses.length === 31 ? OK : LIMITED, detail: `${ch.translation} · ${bibleStatus().offline ? 'salva offline' : 'via internet'}` };
    }),
    cambio: () => timed(async () => {
      const ex = await getExchange();
      return ex.ok ? { status: ex.note ? LIMITED : OK, detail: `${ex.rates.map((r) => `${r.code} ${r.value.toFixed(2)}`).join(' · ')} (${ex.rates[0].source})` } : { status: FAIL, detail: ex.error };
    }),
    combustiveis: () => timed(async () => {
      const f = await getFuel('TO');
      return f.ok ? { status: f.outdated || f.partial ? LIMITED : OK, detail: `${f.source} · período ${f.period.from} a ${f.period.to}` } : { status: FAIL, detail: `${f.error} ${(f.reasons || []).join(' | ')}` };
    }),
    noticias: () => timed(async () => {
      const fe = await fetchAll();
      return { status: fe.okSources === fe.totalSources ? OK : fe.okSources ? LIMITED : FAIL, detail: `${fe.okSources}/${fe.totalSources} fontes · ${fe.items.length} matérias recentes` };
    }),
  };
  const entries = await Promise.all(Object.entries(checks).map(async ([id, fn]) => [id, await fn()]));
  return { at: new Date().toISOString(), results: Object.fromEntries(entries) };
}
