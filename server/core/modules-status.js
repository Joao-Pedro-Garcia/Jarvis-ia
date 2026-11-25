// Status de cada módulo para o painel de MÓDULOS e a tela de DIAGNÓSTICO.
import { bus } from './events.js';
import * as llm from '../brain/llm.js';
import * as bibleProvider from '../modules/bible/provider.js';
import * as house from '../modules/house/house.js';
import { isOnline } from './http-client.js';
import { getSettings } from './settings.js';
import { recentLogs } from './logger.js';

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

export async function modulesStatus() {
  const online = await isOnline();
  const s = getSettings();
  const llmS = llm.status();
  const bible = bibleProvider.status();
  const houseIntegrations = house.integrations();
  const m = (id, name, status, info, extra = {}) => ({ id, name, status, info, last: last[id] || null, ...extra });
  return {
    online,
    modules: [
      m('cerebro', 'CÉREBRO', llmS.configured ? (online ? 'online' : 'offline') : 'local', llmS.configured ? `IA: ${llmS.model}${llmS.lastError ? ` · último erro: ${llmS.lastError.message}` : ''}` : 'Modo local: comandos funcionam; conversa livre requer ANTHROPIC_API_KEY.'),
      m('ouvido', 'OUVIDO', 'client', 'Reconhecimento de fala do navegador (Web Speech API).'),
      m('voz', 'VOZ', s.voice.enabled ? 'client' : 'off', `Síntese de voz local do navegador · velocidade ${s.voice.rate}`),
      m('palmas', 'PALMAS', s.clap.enabled ? 'client' : 'off', `Duas palmas · sensibilidade ${s.clap.sensitivity}`),
      m('casa', 'CASA', houseIntegrations.some((i) => i.configured) ? 'online' : 'unavailable', houseIntegrations.some((i) => i.configured) ? 'Home Assistant configurado' : 'Nenhuma integração configurada — funções indisponíveis.'),
      m('engenharia', 'ENGENHARIA', 'online', `Cálculos e conversões locais${llmS.configured ? ' + IA técnica' : ''}`),
      m('motor', 'MOTOR', 'online', `Cálculos automotivos locais${llmS.configured ? ' + IA técnica' : ''}`),
      m('biblia', 'BÍBLIA', bible.offline ? 'online' : (online ? 'online' : 'offline'), bible.offline ? 'Texto salvo localmente (offline).' : 'Texto será baixado no primeiro uso.'),
      m('noticias', 'NOTÍCIAS', online ? 'online' : 'offline', 'Câmbio, combustíveis (ANP) e feeds jornalísticos.'),
      m('memoria', 'MEMÓRIA', 'online', 'Armazenamento local em data/memory.json.'),
      m('sistema', 'SISTEMA', 'online', `Modo seguro: ${s.security.safeMode ? 'ativo' : 'desligado'} · erros recentes: ${recentLogs({ level: 'error', limit: 50 }).length}`),
    ],
  };
}
