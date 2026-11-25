// CASA — arquitetura de integrações domésticas.
// Nenhum dispositivo é inventado: sem integração configurada, tudo aparece
// como INDISPONÍVEL. Integração real incluída: Home Assistant (API REST oficial,
// https://developers.home-assistant.io/docs/api/rest/). Para adicionar outra
// (Tuya, SmartThings, MQTT…), crie um adaptador com a mesma interface e
// registre em ADAPTERS.
import { fetchWithTimeout } from '../../core/http-client.js';
import { log } from '../../core/logger.js';
import { similarity, normalize } from '../../core/text.js';
import { bus, EVENTS } from '../../core/events.js';

export const CATEGORIES = [
  { id: 'light', name: 'Iluminação', domains: ['light'] },
  { id: 'climate', name: 'Temperatura', domains: ['climate', 'sensor'] },
  { id: 'switch', name: 'Tomadas', domains: ['switch'] },
  { id: 'media', name: 'Televisão', domains: ['media_player'] },
  { id: 'computer', name: 'Computador', domains: ['button', 'switch'] },
  { id: 'sensor', name: 'Sensores', domains: ['sensor', 'binary_sensor'] },
  { id: 'automation', name: 'Automações', domains: ['automation', 'script', 'scene'] },
];

// Ações que exigem confirmação (impacto relevante / difícil de reverter).
const CRITICAL = [/desligar.*(computador|pc|servidor)/, /trancar|destrancar|fechadura|alarme|portao|garagem/];

const homeAssistant = {
  id: 'home_assistant',
  name: 'Home Assistant',
  configured: () => !!(process.env.HOME_ASSISTANT_URL && process.env.HOME_ASSISTANT_TOKEN),
  headers: () => ({ Authorization: `Bearer ${process.env.HOME_ASSISTANT_TOKEN}`, 'Content-Type': 'application/json' }),
  async devices() {
    const res = await fetchWithTimeout(`${process.env.HOME_ASSISTANT_URL.replace(/\/$/, '')}/api/states`, { headers: this.headers(), timeout: 8000 });
    const states = await res.json();
    return states
      .filter((s) => /^(light|switch|climate|media_player|sensor|binary_sensor|button|script|scene|automation|fan|cover)\./.test(s.entity_id))
      .map((s) => ({ id: s.entity_id, domain: s.entity_id.split('.')[0], name: s.attributes?.friendly_name || s.entity_id, state: s.state, unit: s.attributes?.unit_of_measurement }));
  },
  async call(domain, service, entityId, data = {}) {
    await fetchWithTimeout(`${process.env.HOME_ASSISTANT_URL.replace(/\/$/, '')}/api/services/${domain}/${service}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify({ entity_id: entityId, ...data }), timeout: 8000,
    });
  },
};

const ADAPTERS = [homeAssistant];

export function integrations() {
  return ADAPTERS.map((a) => ({ id: a.id, name: a.name, configured: a.configured() }));
}

export async function status() {
  const active = ADAPTERS.filter((a) => a.configured());
  if (!active.length) {
    return { available: false, reason: 'Nenhuma integração doméstica configurada (defina HOME_ASSISTANT_URL e HOME_ASSISTANT_TOKEN no .env).', categories: CATEGORIES.map((c) => ({ ...c, available: false, devices: [] })), integrations: integrations() };
  }
  try {
    const devices = (await Promise.all(active.map((a) => a.devices().then((d) => d.map((x) => ({ ...x, adapter: a.id })))))).flat();
    return {
      available: true,
      categories: CATEGORIES.map((c) => {
        const list = devices.filter((d) => c.domains.includes(d.domain) && (c.id !== 'computer' || /pc|computador|desktop|notebook/i.test(d.name)));
        return { ...c, available: list.length > 0, devices: list.slice(0, 50) };
      }),
      integrations: integrations(),
    };
  } catch (err) {
    log.error('casa', `Home Assistant indisponível: ${err.message}`);
    return { available: false, reason: `Home Assistant configurado, mas inacessível: ${err.message}`, categories: CATEGORIES.map((c) => ({ ...c, available: false, devices: [] })), integrations: integrations() };
  }
}

/** Interpreta "ligar luz da sala", "desligar tv", "temperatura do quarto". */
export function parseHouseCommand(t) {
  const on = /\b(liga|ligar|acende|acender|ativa|ativar|abre|abrir)\b/.test(t);
  const off = /\b(desliga|desligar|apaga|apagar|desativa|desativar|fecha|fechar)\b/.test(t);
  const target = t.replace(/\b(jarvis|por favor|liga|ligar|acende|acender|ativa|ativar|desliga|desligar|apaga|apagar|desativa|desativar|abre|abrir|fecha|fechar|o|a|os|as|do|da|de)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return { action: on ? 'turn_on' : off ? 'turn_off' : 'query', target, critical: CRITICAL.some((re) => re.test(t)) };
}

export async function execute({ action, target }) {
  const active = ADAPTERS.filter((a) => a.configured());
  if (!active.length) return { ok: false, text: 'O módulo CASA ainda não tem nenhuma integração real configurada, então não há dispositivos para controlar. Configure o Home Assistant no arquivo .env para ativar.' };
  const st = await status();
  if (!st.available) return { ok: false, text: st.reason };
  const all = st.categories.flatMap((c) => c.devices);
  const scored = all.map((d) => ({ d, s: similarity(target, d.name) + (normalize(d.name).includes(target) ? 0.5 : 0) })).sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (!best || best.s < 0.2) return { ok: false, text: `Não encontrei um dispositivo correspondente a "${target}".` };
  const dev = best.d;
  if (action === 'query') return { ok: true, text: `${dev.name}: ${dev.state}${dev.unit ? ` ${dev.unit}` : ''}.` };
  const adapter = ADAPTERS.find((a) => a.id === dev.adapter);
  const domain = ['light', 'switch', 'fan', 'media_player', 'climate', 'automation'].includes(dev.domain) ? dev.domain : 'homeassistant';
  const service = dev.domain === 'button' ? 'press' : dev.domain === 'script' || dev.domain === 'scene' ? 'turn_on' : action;
  await adapter.call(dev.domain === 'button' ? 'button' : domain, service, dev.id);
  bus.emitEvent(EVENTS.HOUSE_ACTION, { device: dev.id, action });
  log.info('casa', `${action} em ${dev.id}`);
  return { ok: true, text: `${action === 'turn_on' ? 'Ligado' : 'Desligado'}: ${dev.name}.` };
}
