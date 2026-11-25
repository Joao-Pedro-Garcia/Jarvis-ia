// Status de cada módulo para o painel de MÓDULOS e a tela de DIAGNÓSTICO.
import { bus } from './events.js';
import * as llm from '../brain/llm.js';
import * as bibleProvider from '../modules/bible/provider.js';
import * as house from '../modules/house/house.js';
import { internetStatus, INTERNET_LABEL } from './http-client.js';
import { getSettings } from './settings.js';
import { recentLogs } from './logger.js';
import { getHealth } from './health.js';
import * as tasks from '../modules/tasks/tasks.js';

const last = {};
const MAP = {
  BIBLE_OPENED: 'biblia', PAGE_NEXT: 'biblia', PAGE_PREVIOUS: 'biblia', BIBLE_DAY_COMPLETED: 'biblia',
  MEMORY_UPDATED: 'memoria', NEWS_FETCHED: 'noticias', LLM_ERROR: 'cerebro', HOUSE_ACTION: 'casa',
  VOICE_RECEIVED: 'ouvido', TEXT_RECEIVED: 'cerebro', COMMAND_EXECUTED: 'cerebro', SETTINGS_UPDATED: 'sistema',
};
bus.on('*', (evt) => {
  const mod = MAP[evt.type];
  if (mod) last[mod] = { event: evt.type, at: evt.at, detail: evt.payload?.name || evt.payload?.ref?.book || evt.payload?.action || '' };
});
export function noteClientEvent(module, event) { last[module] = { event, at: new Date().toISOString() }; }

// Rótulos em português (painel MÓDULOS).
export const MODULE_LABEL = { online: 'ONLINE', offline: 'OFFLINE', local: 'MODO LOCAL', client: 'NO NAVEGADOR', off: 'DESLIGADO', unavailable: 'AGUARDANDO CONFIGURAÇÃO', limited: 'LIMITADO' };
// Semáforo do diagnóstico: ok | limited | fail (INDISPONÍVEL) | error (ERRO) | unknown
export const STATUS_LABEL = { ok: 'OK', limited: 'LIMITADO', fail: 'INDISPONÍVEL', error: 'ERRO', unknown: 'NÃO VERIFICADO' };

function externalService(id, net, name) {
  if (net.state === 'offline') return { status: 'fail', detail: 'Servidor sem internet — use o cache identificado ou tente mais tarde.' };
  const h = getHealth(id);
  if (!h) return { status: 'unknown', detail: `${name}: ainda não consultado nesta execução. Peça "${id === 'noticias' ? 'Notícias' : id === 'cambio' ? 'câmbio' : 'quanto está a gasolina'}" ou rode o diagnóstico completo.` };
  if (h.status === 'fail') return { status: 'fail', detail: `SERVIÇO EXTERNO INDISPONÍVEL — ${h.detail}`, at: h.at };
  return { ...h };
}

export async function modulesStatus() {
  const net = await internetStatus();
  const online = net.online;
  const s = getSettings();
  await llm.refresh().catch(() => {});
  const llmS = llm.status();
  const bible = bibleProvider.status();
  const houseOn = house.integrations().some((i) => i.configured);
  const m = (id, name, status, info, extra = {}) => ({ id, name, status, label: MODULE_LABEL[status] || status, info, last: last[id] || null, ...extra });
  const netDetail = net.state === 'online' ? `ONLINE · latência ${net.latencyMs} ms` : net.state === 'limited' ? `INTERNET LIMITADA · ${net.probes.filter((p) => p.ok).length}/${net.probes.length} pontos de teste responderam${net.latencyMs ? ` · latência ${net.latencyMs} ms` : ''}` : 'OFFLINE · nenhum ponto de teste respondeu — modo offline';
  const iaDetail = llmS.kind === 'local' ? `IA LOCAL — ${llmS.providerName} · modelo ${llmS.model} (gratuita, roda neste computador)`
    : llmS.kind === 'online' ? `IA ONLINE — ${llmS.providerName} · ${llmS.model} (serviço externo opcional; pode ter custo)`
    : `Não configurada. ${llmS.invalidProvider ? `AI_PROVIDER inválido: ${process.env.AI_PROVIDER}. ` : ''}${llmS.localProbe?.reason ? `Procurei IA local: ${llmS.localProbe.reason}. ` : ''}Modo local inteligente ativo: comandos, cálculos, memória e conversa básica funcionam. Para conversa livre gratuita, instale o Ollama (veja o README).`;
  const components = {
    cerebro: { status: 'ok', detail: `Orquestrador e comandos locais ativos (${llmS.configured ? llmS.state : 'modo local inteligente'})` },
    ia: llmS.configured ? { status: llmS.lastError ? 'limited' : 'ok', detail: `${iaDetail}${llmS.lastError ? ` · último erro: ${llmS.lastError.message}` : ''}`, state: llmS.state } : { status: 'fail', detail: iaDetail, state: llmS.state },
    internet: { status: net.state === 'online' ? 'ok' : net.state === 'limited' ? 'limited' : 'fail', detail: netDetail, state: INTERNET_LABEL[net.state] },
    memoria: { status: 'ok', detail: 'Armazenamento local (data/memory.json)' },
    tarefas: { status: 'ok', detail: `${tasks.list().length} pendente(s) · agendador de lembretes ativo` },
    biblia: bible.offline ? { status: 'ok', detail: 'Texto salvo localmente (funciona offline); progresso salvo no servidor' } : { status: online ? 'limited' : 'fail', detail: online ? 'Texto será baixado no primeiro uso' : 'Texto ainda não baixado e sem internet' },
    noticias: externalService('noticias', net, 'Notícias'),
    cambio: externalService('cambio', net, 'Câmbio'),
    combustiveis: externalService('combustiveis', net, 'Combustíveis'),
    casa: houseOn ? { status: 'ok', detail: 'Home Assistant configurado' } : { status: 'limited', detail: 'AGUARDANDO CONFIGURAÇÃO — nenhuma integração doméstica; nenhum dispositivo é simulado.' },
    motor: { status: 'ok', detail: 'Cálculos automotivos locais (funcionam offline)' },
    engenharia: { status: 'ok', detail: 'Cálculos, conversões e física locais (funcionam offline)' },
  };
  return {
    online,
    internet: { state: net.state, label: INTERNET_LABEL[net.state], latencyMs: net.latencyMs, probes: net.probes, at: net.at },
    components,
    modules: [
      m('cerebro', 'CÉREBRO', llmS.configured ? 'online' : 'local', llmS.configured ? `${llmS.state}: ${llmS.providerName} · ${llmS.model}${llmS.lastError ? ` · último erro: ${llmS.lastError.message}` : ''}` : 'Modo local inteligente: comandos, cálculos e conversa básica. Conversa livre requer IA local (Ollama) ou online.'),
      m('ouvido', 'OUVIDO', 'client', 'Reconhecimento de fala do navegador (Web Speech API).'),
      m('voz', 'VOZ', s.voice.enabled ? 'client' : 'off', `Síntese de voz local do navegador · velocidade ${s.voice.rate}`),
      m('palmas', 'PALMAS', s.clap.enabled ? 'client' : 'off', `Duas palmas · sensibilidade ${s.clap.sensitivity}`),
      m('casa', 'CASA', houseOn ? 'online' : 'unavailable', houseOn ? 'DISPONÍVEL · Home Assistant configurado' : 'AGUARDANDO CONFIGURAÇÃO — nenhuma integração; nenhum dispositivo é simulado.'),
      m('engenharia', 'ENGENHARIA', 'online', `Cálculos, física e conversões locais${llmS.configured ? ' + IA técnica' : ''}`),
      m('motor', 'MOTOR', 'online', `Cálculos automotivos locais${llmS.configured ? ' + IA técnica' : ''}`),
      m('biblia', 'BÍBLIA', bible.offline ? 'online' : (online ? 'online' : 'offline'), bible.offline ? 'Texto salvo localmente (offline).' : 'Texto será baixado no primeiro uso.'),
      m('noticias', 'NOTÍCIAS', online ? (net.state === 'limited' ? 'limited' : 'online') : 'offline', 'Câmbio, combustíveis (ANP) e feeds jornalísticos.'),
      m('memoria', 'MEMÓRIA', 'online', 'Armazenamento local em data/memory.json.'),
      m('tarefas', 'TAREFAS', 'online', `${tasks.list().length} pendente(s); lembretes com agendador.`),
      m('sistema', 'SISTEMA', 'online', `Internet: ${INTERNET_LABEL[net.state]} · modo seguro: ${s.security.safeMode ? 'ativo' : 'desligado'} · erros recentes: ${recentLogs({ level: 'error', limit: 50 }).length}`),
    ],
  };
}
