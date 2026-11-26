// SISTEMA DE COMANDOS extensível.
// Cada comando possui: name, module, description, aliases (frases de exemplo),
// patterns (intenção), context (quando depende da conversa), params,
// permission ('safe' | 'confirm' | 'restricted'), action e confirmText.
// Para adicionar um comando novo, chame registerCommand({...}) — veja o README.
import * as reading from '../modules/bible/reading.js';
import { findReference, refLabel } from '../modules/bible/books.js';
import * as news from '../modules/news/news.js';
import * as weather from '../modules/weather/weather.js';
import * as memory from '../modules/memory/memory.js';
import * as house from '../modules/house/house.js';
import { tryMath, formatNumber } from '../modules/engineering/math.js';
import { tryConvert } from '../modules/engineering/units.js';
import { tryEngineCalc } from '../modules/engine/engine.js';
import { solvePhysics } from '../../shared/physics.js';
import { setMode } from './local-mind.js';
import { formatTimeSpoken, formatDateLong } from '../core/time.js';
import { parseOrdinal, normalize, recoverOriginal } from '../core/text.js';
import { getSettings, updateSettings } from '../core/settings.js';
import * as llm from './llm.js';
import { isOnline } from '../core/http-client.js';
import * as tasks from '../modules/tasks/tasks.js';
import { parseWhen, zonedParts } from '../core/when.js';
import * as bibleProvider from '../modules/bible/provider.js';

const registry = [];

export function registerCommand(cmd) {
  const required = ['name', 'module', 'patterns', 'action'];
  for (const k of required) if (!cmd[k]) throw new Error(`Comando sem campo obrigatório: ${k}`);
  registry.push({ permission: 'safe', priority: 50, aliases: [], description: '', ...cmd });
  registry.sort((a, b) => b.priority - a.priority);
}

export function listCommands() {
  return registry.map(({ name, module, description, aliases, permission }) => ({ name, module, description, aliases, permission }));
}

/** Detecta a intenção: percorre os comandos por prioridade. */
export function detect(t, sess) {
  for (const cmd of registry) {
    if (cmd.context && !cmd.context(sess)) continue;
    for (const re of cmd.patterns) {
      const m = typeof re === 'function' ? re(t, sess) : t.match(re);
      if (m) return { cmd, match: m, params: cmd.params ? cmd.params(t, m, sess) : {} };
    }
  }
  return null;
}

const bibleActive = (s) => s.context.activeModule === 'bible'
  // Bíblia usada por último (e não fechada): "avance"/"volte" continuam valendo.
  || (!s.context.activeModule && s.context.lastResult?.module === 'BÍBLIA' && s.context.lastResult.intent !== 'bible.close');
const newsActive = (s) => !!news.getLastSummary() && s.context.activeModule === 'news';
const bibleUi = (view) => ({ panel: 'bible', bible: view });
const say = (text, extra = {}) => ({ text, ...extra });

// ======================= SISTEMA =======================
registerCommand({
  name: 'system.stop', module: 'VOZ', priority: 100, description: 'Interrompe a fala',
  aliases: ['Para', 'Silêncio', 'Pare de falar'],
  patterns: [/^(para|pare|parar|silencio|chega|stop|cala a boca|fica quieto|interromp\w*)( de falar| ai| agora)?$/],
  action: async () => say('Ok.', { speech: '', clientActions: ['stopSpeech'] }),
});

registerCommand({
  name: 'system.time', module: 'SISTEMA', priority: 90, description: 'Informa a hora',
  aliases: ['Que horas são?'],
  patterns: [/\b(que horas sao|que hora e|que horas e|me (diz|diga|fala) as horas|horas agora|qual (e )?a hora)\b/],
  action: async () => { const t = formatTimeSpoken(); return say(`Agora são ${t.text}.`); },
});

registerCommand({
  name: 'system.date', module: 'SISTEMA', priority: 90, description: 'Informa a data',
  aliases: ['Que dia é hoje?'],
  patterns: [/\b(que dia (e|eh) hoje|qual (e )?a data|data de hoje|hoje e que dia|em que dia estamos)\b/],
  action: async () => say(`Hoje é ${formatDateLong()}.`),
});

registerCommand({
  name: 'system.offline', module: 'SISTEMA', priority: 85, description: 'Lista funções locais e online',
  aliases: ['O que funciona sem internet?'],
  patterns: [/\b(o que funciona (sem internet|offline)|funcoes offline|estou sem internet|caiu a internet|modo offline)\b/],
  action: async () => {
    const online = await isOnline();
    return say(`${online ? 'A internet está funcionando agora.' : 'Estou sem internet agora.'} Funcionam sem internet: horário, data, contas, conversões, cálculos de motor, memória, tarefas, plano de leitura e a Bíblia já baixada, e a voz do JARVIS. Precisam de internet: conversa com a IA, notícias, câmbio, combustíveis e — no Chrome — o reconhecimento de voz.`, { ui: { panel: 'diagnostics' } });
  },
});

export const HELP_TEXT = [
  '📖 Bíblia — "Bíblia", "onde parei?", "passe a página", "volta", "leia"',
  '📰 Notícias — "Notícias", "quanto está o dólar?", "quanto está a gasolina?"',
  '✅ Tarefas — "me lembra de estudar às 19h", "minhas tarefas", "concluí essa", "adia para amanhã"',
  '🧠 Memória — "lembre que…", "o que você lembra sobre…", "esqueça isso"',
  '🗓 Rotina — "meu dia"',
  '🌤 Clima — "como está o dia hoje?", "vai chover?", "previsão para amanhã"',
  '🏠 Casa — "ligar a luz da sala" (requer Home Assistant)',
  '🔧 Engenharia — "15% de 230", "converter 10 km em milhas", "12 volts e 4 ohms"',
  '🚗 Motor — "potência com 300 Nm a 4000 rpm", "me ajuda com esse motor"',
  '📊 Status / 🩺 Diagnóstico — "status", "faça um diagnóstico"',
  '🔇 Silêncio — "fique silencioso", "volte a falar", "pare"',
];

registerCommand({
  name: 'system.help', module: 'SISTEMA', priority: 80, description: 'Mostra os principais comandos',
  aliases: ['Ajuda', 'O que você consegue fazer?'],
  patterns: [/^(ajuda|help|comandos|me ajuda com os comandos|socorro com os comandos)$/, /\b(o que voce (sabe|consegue|pode) fazer|quais (sao )?(os )?(seus )?comandos|lista de comandos|me mostra os comandos|como (eu )?uso voce)\b/],
  action: async () => say(`Principais comandos:\n${HELP_TEXT.join('\n')}`, {
    speech: 'Posso cuidar da sua leitura da Bíblia, notícias, tarefas e lembretes, memória, rotina do dia, engenharia, motores e a casa. Também respondo a status, diagnóstico e silêncio. A lista está na tela.',
    data: { commands: HELP_TEXT },
  }),
});

registerCommand({
  name: 'system.status', module: 'SISTEMA', priority: 80, description: 'Status geral do sistema',
  aliases: ['Status', 'Como você está?'],
  patterns: [/^(status|status do sistema|relatorio de status|como estao os sistemas)$/, /\bstatus (geral|do jarvis|dos sistemas)\b/],
  action: async (_, ctx) => {
    const online = await isOnline();
    const ai = llm.status();
    const c = ctx.client || {};
    const pend = tasks.list();
    const bible = reading.plainState();
    const s = getSettings();
    const mic = { active: 'ativo', inactive: 'pronto', denied: 'sem permissão', unavailable: 'indisponível' }[c.mic] || 'estado desconhecido';
    const lines = [
      `Sistema: online${s.security.safeMode ? ' (modo seguro)' : ''}${s.voice.silent ? ', modo silencioso' : ''}.`,
      `Internet: ${online ? 'conectada' : 'indisponível — modo offline'}.`,
      `IA: ${ai.configured ? `${ai.state} — ${ai.providerName}, modelo ${ai.model}${ai.lastError ? ` (último erro: ${ai.lastError.message})` : ''}` : 'não configurada — modo local inteligente (IA INDISPONÍVEL)'}.`,
      `Microfone: ${mic}. Reconhecimento de fala: ${c.hearing === false ? 'indisponível neste navegador' : 'disponível'}.`,
      `Voz: ${c.voice === false ? 'indisponível' : s.voice.silent ? 'silenciada' : 'ativa'}.`,
      `Memória: ${memory.list('facts').length} memórias, ${memory.list('preferences').length} preferências.`,
      `Bíblia: ${bible.plan && !bible.plan.completedAt ? `leitura ${bible.plan.label} em andamento` : `próxima leitura em ${refLabel(bible.position)}`}; sequência de ${bible.streak} dia(s); texto ${bibleProvider.status().offline ? 'salvo offline' : 'ainda não baixado'}.`,
      `Notícias: ${online ? 'fontes acessíveis' : 'indisponíveis sem internet'}.`,
      `Tarefas: ${pend.length} pendente(s).`,
    ];
    return say(lines.join('\n'), { speech: lines.slice(0, 3).concat(lines[8]).join(' '), data: { online, ai, pending: pend.length } });
  },
});

registerCommand({
  name: 'system.silent_on', module: 'VOZ', priority: 95, description: 'Modo silencioso (só texto)', mutates: true,
  aliases: ['Fique silencioso', 'Modo silencioso'],
  patterns: [/\b(fique|fica|ficar|entr\w+ (em|no)) (em )?(silencio(so)?|modo silencioso|mudo)\b/, /\b(ativ\w+|lig\w+) (o )?modo silencioso\b/, /^modo silencioso$/, /\bnao fale mais\b/],
  action: async () => { updateSettings({ voice: { silent: true } }); return say('Modo silencioso ativado. Continuo respondendo na tela.', { speech: '', clientActions: ['stopSpeech'] }); },
});

registerCommand({
  name: 'voice.show', module: 'VOZ', priority: 90, description: 'Mostra a voz atual',
  aliases: ['Mostre sua voz', 'Teste sua voz'],
  patterns: [/\b(mostr\w+|test\w+|quero ouvir|deixa eu ouvir) (a )?(sua|tua) voz\b/, /\bcomo (e|eh) (a )?(sua|tua) voz\b/],
  action: async () => say('Esta é a minha voz atual. Para trocar por uma voz masculina, abra Configurações, Voz, e veja como deixar a voz masculina.'),
});

registerCommand({
  name: 'voice.male', module: 'VOZ', priority: 90, description: 'Como deixar a voz masculina',
  aliases: ['Voz masculina', 'Mude sua voz'],
  patterns: [/\bvoz (masculina|de homem|grossa|mais grave)\b/, /\b(mud\w+|troc\w+|alter\w+) (a )?(sua|tua) voz\b/],
  action: async () => say('A voz vem do Android. Para deixar MASCULINA:\n1. Configurações do Android → Configurações adicionais → Idiomas e entrada → Saída de texto para fala.\n2. Mecanismo preferido: Serviços de fala do Google.\n3. Engrenagem ⚙ → Instalar dados de voz → Português (Brasil).\n4. Ouça as vozes (▶) e escolha uma masculina.\n5. Feche e abra o Chrome e diga "mostre sua voz".', {
    speech: 'A voz vem do Android. Os passos para deixar masculina estão na tela.',
  }),
});

registerCommand({
  name: 'system.silent_off', module: 'VOZ', priority: 95, description: 'Volta a falar', mutates: true,
  aliases: ['Volte a falar'],
  patterns: [/\b(volt\w+ a falar|pode falar|fal\w+ de novo|desativ\w+ (o )?modo silencioso|sair do modo silencioso|sai do silencio)\b/],
  action: async () => { updateSettings({ voice: { silent: false, enabled: true } }); return say('Voltei a falar.'); },
});

registerCommand({
  name: 'voice.pause', module: 'VOZ', priority: 99, description: 'Pausa a fala',
  aliases: ['Pausa'],
  patterns: [/^(pausa|pause|pausar|espera|espera ai|aguarda)$/],
  action: async () => say('Pausado.', { speech: '', clientActions: ['pauseSpeech'] }),
});

registerCommand({
  name: 'voice.resume', module: 'VOZ', priority: 99, description: 'Continua a fala pausada',
  aliases: ['Continua a falar'],
  patterns: [/^(continua a falar|pode continuar|continue falando|retoma|retomar a fala|despausa)$/],
  action: async () => say('Continuando.', { speech: '', clientActions: ['resumeSpeech'] }),
});

registerCommand({
  name: 'system.selftest', module: 'SISTEMA', priority: 85, description: 'Auto-diagnóstico completo',
  aliases: ['Faça um diagnóstico'],
  patterns: [/\b(faca|faz|fazer|rode|roda|execute|inicie) (um |o )?(auto ?diagnostico|diagnostico|teste (do|de) sistemas?|checagem)\b/, /^(auto ?diagnostico|diagnostico completo|teste o sistema|testar sistemas?)$/],
  action: async () => say('Iniciando diagnóstico completo…', { ui: { panel: 'selftest' } }),
});

registerCommand({
  name: 'routine.day', module: 'ROTINA', priority: 79, description: 'Resumo do seu dia',
  aliases: ['Meu dia', 'O que tenho hoje?'],
  patterns: [/^(o )?meu dia$/, /\b(como (esta|vai ser) (o )?meu dia|resumo do (meu )?dia|o que (eu )?tenho (pra|para) hoje|minha agenda( de hoje)?|agenda de hoje|planeja meu dia)\b/],
  action: async (_, ctx) => {
    const t = tasks.today();
    const bible = await reading.current(ctx.pageSize).catch(() => null);
    const online = await isOnline();
    const ex = online ? await news.exchangeFast() : null;
    const lines = ['Seu dia, por prioridade:'];
    const speech = [];
    if (t.overdue.length) { lines.push(`⚠ Atrasadas: ${t.overdue.map((x) => tasks.describe(x)).join('; ')}`); speech.push(`Você tem ${t.overdue.length} tarefa${t.overdue.length > 1 ? 's' : ''} atrasada${t.overdue.length > 1 ? 's' : ''}.`); }
    if (t.today.length) { lines.push(`⏰ Hoje: ${t.today.map((x) => tasks.describe(x)).join('; ')}`); speech.push(`Para hoje: ${t.today.map((x) => tasks.describe(x)).join('; ')}.`); }
    if (t.undated.length) lines.push(`📝 Sem data: ${t.undated.map((x) => x.text).join('; ')}`);
    if (!t.overdue.length && !t.today.length) speech.push('Nenhum compromisso marcado para hoje.');
    if (bible?.plan) {
      const done = !!bible.plan.completedAt && bible.plan.isToday;
      lines.push(`📖 Bíblia: ${done ? `leitura de hoje concluída (${bible.plan.label})` : `${bible.plan.label} — ${bible.plan.done}/${bible.plan.total} capítulos`} · sequência ${bible.streak} dia(s)`);
      speech.push(done ? 'A leitura bíblica de hoje já está concluída.' : `Leitura bíblica: ${bible.plan.label}.`);
    } else if (bible) { lines.push(`📖 Bíblia: próxima leitura começa em ${bible.position.label}`); speech.push(`Leitura bíblica pendente, começando em ${bible.position.label}.`); }
    const w = await weather.weatherFast(2000); // cache + tempo limite: não atrasa sem internet
    if (w?.ok && !w.stale) { const d = w.days[0]; lines.push(`🌤 Clima em ${w.city}: ${w.now.temp} °C agora, ${d.desc}, ${d.min}–${d.max} °C${d.rainChance != null ? `, chuva ${d.rainChance}%` : ''}`); speech.push(weather.weatherHook(w)); }
    if (ex?.ok) { const usd = ex.rates.find((r) => r.code === 'USD'); if (usd) lines.push(`💰 Dólar: R$ ${usd.value.toFixed(2).replace('.', ',')} (${new Date(usd.updatedAt).toLocaleTimeString('pt-BR', { timeZone: process.env.JARVIS_TIMEZONE || 'America/Araguaina', hour: '2-digit', minute: '2-digit' })})`); }
    if (t.upcoming.length) lines.push(`📅 Próximos: ${t.upcoming.map((x) => tasks.describe(x)).join('; ')}`);
    lines.push(online ? '📰 Diga "Notícias" para o resumo do dia.' : '📡 Sem internet: notícias e câmbio indisponíveis.');
    return say(lines.join('\n'), { speech: speech.join(' '), data: { tasks: t, bible: bible?.plan || null } });
  },
});

registerCommand({
  name: 'ui.open', module: 'SISTEMA', priority: 75, description: 'Abre um painel da interface',
  aliases: ['Abrir configurações', 'Mostrar diagnóstico', 'Abrir memória'],
  patterns: [/\b(abr\w+|mostr\w+|exib\w+|ver)\b.{0,12}\b(configurac\w+|ajustes|diagnostico|logs|memorias?|modulos|casa)\b/],
  params: (t) => {
    const map = { configurac: 'settings', ajustes: 'settings', diagnostico: 'diagnostics', logs: 'diagnostics', memori: 'memory', modulos: 'modules', casa: 'house' };
    const key = Object.keys(map).find((k) => t.includes(k));
    return { panel: map[key] };
  },
  action: async ({ panel }) => say({ settings: 'Abrindo configurações.', diagnostics: 'Abrindo o diagnóstico.', memory: 'Abrindo a memória.', modules: 'Módulos na tela.', house: 'Abrindo o módulo Casa.' }[panel], { ui: { panel } }),
});

registerCommand({
  name: 'security.safe_on', module: 'SISTEMA', priority: 78, description: 'Ativa o modo seguro',
  aliases: ['Ativar modo seguro'],
  patterns: [/\b(ativ\w+|ligar?|liga) (o )?modo seguro\b/],
  action: async () => { updateSettings({ security: { safeMode: true } }); return say('Modo seguro ativado: toda ação vai pedir confirmação e o controle da casa fica bloqueado.'); },
});

registerCommand({
  name: 'security.safe_off', module: 'SISTEMA', priority: 78, description: 'Desativa o modo seguro', permission: 'confirm',
  aliases: ['Desativar modo seguro'],
  patterns: [/\b(desativ\w+|deslig\w+|sair do) (o )?modo seguro\b/],
  confirmText: () => 'Tem certeza que deseja desativar o modo seguro?',
  action: async () => { updateSettings({ security: { safeMode: false } }); return say('Modo seguro desativado.'); },
});

// ======================= BÍBLIA =======================
registerCommand({
  name: 'bible.open_ref', module: 'BÍBLIA', priority: 72, description: 'Abre uma referência específica (leitura livre)',
  aliases: ['Abra João 3', 'Ler Salmo 23'],
  patterns: [(t) => {
    if (!/\b(abr\w+|ler|leia|mostr\w+|vai para|ir para|quero ler)\b/.test(t)) return null;
    const ref = findReference(t);
    return ref && ref.explicitChapter ? ref : null;
  }],
  params: (t, ref) => ({ ref }),
  action: async ({ ref }, ctx) => { const v = await reading.openReference(ref, ctx.pageSize); ctx.sess.context.activeModule = 'bible'; return say(v.error || v.message, { ui: bibleUi(v) }); },
});

registerCommand({
  name: 'bible.next_reading', mutates: true, module: 'BÍBLIA', priority: 71, description: 'Adianta a próxima leitura (sob pedido)',
  aliases: ['Próxima leitura', 'Adiantar leitura'],
  patterns: [/\b(proxima leitura|adiant\w+ (a )?(proxima )?leitura|proximo trecho|ler o proximo trecho|leitura de amanha)\b/],
  action: async (_, ctx) => { const v = await reading.startNextReading(ctx.pageSize); ctx.sess.context.activeModule = 'bible'; return say(v.message, { ui: bibleUi(v) }); },
});

registerCommand({
  name: 'bible.complete', module: 'BÍBLIA', priority: 71, permission: 'confirm', description: 'Marca a leitura do dia como concluída',
  aliases: ['Concluir leitura', 'Terminei a leitura'],
  patterns: [/\b(conclu\w+|termin\w+|finaliz\w+|marca\w* como lida) (a |minha )?leitura\b/, /\bterminei de ler\b/],
  confirmText: () => 'Confirma marcar a leitura de hoje como concluída? A posição vai avançar.',
  action: async (_, ctx) => { const v = await reading.completeToday(ctx.pageSize); return say(v.message, { ui: bibleUi(v) }); },
});

registerCommand({
  name: 'bible.where', module: 'BÍBLIA', priority: 70, description: 'Diz onde parou',
  aliases: ['Onde parei?', 'Qual capítulo?'],
  patterns: [(t) => (/\bonde (eu )?parei\b/.test(t) && !/\b(continu|retom|segu)\w*/.test(t) ? [t] : null), /\b(qual|que|em que) (e a )?leitura de hoje\b/, /\bem que capitulo\b/, /\b(qual|que) capitulo\b/],
  action: async (_, ctx) => {
    const v = await reading.current(ctx.pageSize);
    return say(reading.whereAmI(ctx.pageSize), { ui: ctx.sess.context.activeModule === 'bible' ? bibleUi(v) : undefined, data: { ref: v.ref, verse: v.verses[0]?.n ?? null, page: v.pageIndex + 1, pageCount: v.pageCount } });
  },
});

registerCommand({
  name: 'bible.read_aloud', module: 'BÍBLIA', priority: 70, description: 'Lê a página atual em voz alta (modo leitura)',
  aliases: ['Leia', 'Leia para mim', 'Ler em voz alta'],
  patterns: [/^(leia|le|ler|leia (a pagina|pra mim|para mim|isso|o texto|em voz alta)|le pra mim|ler em voz alta|modo leitura)$/],
  action: async (_, ctx) => {
    if (ctx.sess.context.activeModule !== 'bible') await reading.openDaily(ctx.pageSize);
    ctx.sess.context.activeModule = 'bible';
    const { view, text } = await reading.pageText(ctx.pageSize);
    if (!text) return say(view.error, { ui: bibleUi(view) });
    return say(`Lendo ${view.ref.label}, página ${view.pageIndex + 1} de ${view.pageCount}.`, { speech: text, speechMode: 'reading', ui: bibleUi(view) });
  },
});

registerCommand({
  name: 'bible.close', module: 'BÍBLIA', priority: 70, description: 'Fecha o leitor',
  aliases: ['Fechar a Bíblia'],
  patterns: [/\b(fech\w+|sair d\w|encerr\w+) (a |da )?biblia\b/, /\b(fech\w+|sair d\w) (a |da )?leitura\b/],
  action: async (_, ctx) => { ctx.sess.context.activeModule = null; return say('Leitura fechada. Seu progresso está salvo.', { ui: { panel: 'close-bible' } }); },
});

registerCommand({
  name: 'bible.next_chapter', module: 'BÍBLIA', priority: 69, description: 'Próximo capítulo',
  aliases: ['Próximo capítulo'],
  patterns: [/\bproximo capitulo\b/, /\b(avanc\w+|pul\w+|pass\w+|vai para o) (o |para o )?(proximo )?capitulo\b/],
  action: async (_, ctx) => { const v = await reading.changeChapter('next', ctx.pageSize); ctx.sess.context.activeModule = 'bible'; return say(v.message || v.ref.label, { ui: bibleUi(v) }); },
});

registerCommand({
  name: 'bible.prev_chapter', module: 'BÍBLIA', priority: 69, description: 'Capítulo anterior',
  aliases: ['Voltar capítulo', 'Capítulo anterior'],
  patterns: [/\bcapitulo anterior\b/, /\b(volt\w+|retorn\w+) (o |um |para o |ao )?capitulo( anterior)?\b/],
  action: async (_, ctx) => { const v = await reading.changeChapter('prev', ctx.pageSize); ctx.sess.context.activeModule = 'bible'; return say(v.message || v.ref.label, { ui: bibleUi(v) }); },
});

registerCommand({
  name: 'bible.next_page', module: 'BÍBLIA', priority: 68, description: 'Passa a página',
  aliases: ['Passe a página', 'Próxima página', 'Avança', 'Próxima'],
  patterns: [
    /\b(pass\w*|vir\w+|avanc\w+|segu\w+|vai pra|vai para|ir para|mud\w+) (a |de |para a |pra )?(proxima )?pagina\b/, /\bproxima pagina\b/, /\bpagina seguinte\b/,
    (t, s) => (bibleActive(s) && /^(proxima|proximo|avanca|avance|avancar|segue|seguir|pode passar|passa|passe|vai|continua|continue|adiante|mais|pra frente|para frente|vira|vira a pagina|proxima ai)$/.test(t) ? [t] : null),
  ],
  action: async (_, ctx) => { const v = await reading.turnPage('next', ctx.pageSize); ctx.sess.context.activeModule = 'bible'; return say(v.message || `Página ${v.pageIndex + 1} de ${v.pageCount}.`, { speech: v.message || '', ui: bibleUi(v), animate: 'next' }); },
});

registerCommand({
  name: 'bible.prev_page', module: 'BÍBLIA', priority: 68, description: 'Volta a página',
  aliases: ['Volta a página', 'Página anterior', 'Voltar'],
  patterns: [
    /\b(volt\w+|retorn\w+) (a |uma |para a |pra )?pagina\b/, /\bpagina anterior\b/,
    (t, s) => (bibleActive(s) && /^(volta|volte|voltar|anterior|retorna|retornar|para tras|pra tras|volta ai|volta uma|volta uma pagina|volta um pouco)$/.test(t) ? [t] : null),
  ],
  action: async (_, ctx) => { const v = await reading.turnPage('prev', ctx.pageSize); ctx.sess.context.activeModule = 'bible'; return say(v.message || `Página ${v.pageIndex + 1} de ${v.pageCount}.`, { speech: v.message || '', ui: bibleUi(v), animate: 'prev' }); },
});

registerCommand({
  name: 'bible.open', module: 'BÍBLIA', priority: 66, description: 'Abre/continua a leitura diária',
  aliases: ['Bíblia', 'Quero ler a Bíblia', 'Vamos continuar minha leitura', 'Continue de onde parei', 'Continuar Bíblia'],
  patterns: [
    /^(a |minha )?biblia( sagrada)?$/,
    /\b(ler|leitura|abr\w+|continu\w+|retom\w+|bora|vamos)\b.{0,20}\bbiblia\b/, /\bbiblia\b.{0,15}\b(continu\w+|leitura|ler)\b/,
    /\b(continu\w+|retom\w+|segu\w+) (com )?(a |minha )?leitura\b/, /\bcontinu\w+ de onde (eu )?parei\b/, /\bleitura (de hoje|do dia|diaria)\b/,
    // "continue" sozinho, sem outro contexto aberto: retoma a leitura de onde parou.
    (t, s) => (/^(continue|continua|continuar|retome|retoma|retomar)$/.test(t) && !bibleActive(s) && s.context.activeModule !== 'news' ? [t] : null),
  ],
  action: async (_, ctx) => {
    const v = await reading.openDaily(ctx.pageSize);
    ctx.sess.context.activeModule = 'bible';
    return say(v.error || v.message, { ui: bibleUi(v) });
  },
});

// ======================= NOTÍCIAS =======================
function currencyOf(t) {
  if (/\bdolar\b/.test(t)) return 'USD';
  if (/\beuro\b/.test(t)) return 'EUR';
  if (/\blibra\b/.test(t) && !/\blibra(s)? (de|pe)\b/.test(t)) return 'GBP';
  return null;
}

registerCommand({
  name: 'news.detail', module: 'NOTÍCIAS', priority: 67, description: 'Aprofunda uma notícia do último resumo',
  aliases: ['Detalhe a segunda notícia', 'Fala mais da primeira'],
  context: (s) => !!news.getLastSummary(),
  patterns: [/\b(detalh\w*|aprofund\w*|explic\w*|fal\w* mais|mais sobre|cont\w* mais|me fala d\w)\b.{0,20}\b(primeir\w|segund\w|terceir\w|quart\w|quint\w|\d+(a|o|ª|º)?|curiosidade|ultima)\b.{0,20}\b(noticia|do brasil|do mundo|curiosidade)?/],
  params: (t) => {
    const w = (t.match(/\b(primeir\w|segund\w|terceir\w|quart\w|quint\w|\d+)/) || [])[1];
    const n = w ? parseOrdinal(w.replace(/(a|o)$/, (x) => x)) ?? parseOrdinal(w) : 1;
    const section = /curiosidade/.test(t) ? 'curiosity' : /mundo|internacional/.test(t) ? 'world' : /brasil/.test(t) ? 'brazil' : null;
    return { n: n || 1, section };
  },
  action: async ({ n, section }, ctx) => {
    const story = news.findStory(n, section);
    if (!story) return say('Não encontrei essa notícia no último resumo. Diga "Notícias" para atualizar.');
    ctx.sess.context.activeModule = 'news';
    if (!llm.available()) {
      return say(`${story.title}. ${story.summary || ''} Fontes: ${story.sources.join(', ')}. (Sem a IA configurada, mostro apenas o resumo da fonte.)`, { speech: `${story.title}. ${story.summary || ''}`, ui: { panel: 'news-detail', story } });
    }
    try {
      const { text } = await llm.complete({
        system: 'Você é o JARVIS. Explique a notícia em português, de forma clara, em até 6 frases faladas, sem ler URLs. Use pesquisa web para confirmar e atualizar fatos; diga a data das informações e se o caso ainda está em desenvolvimento. Se não conseguir confirmar algo, diga.',
        messages: [{ role: 'user', content: `Aprofunde esta notícia: "${story.title}". Resumo original: ${story.summary}. Fontes: ${story.sources.join(', ')}. Publicada em ${story.publishedAt}. Link: ${story.link}` }],
        webSearch: getSettings().privacy.allowWebSearch, maxTokens: 1200, effort: 'low',
      });
      return say(text, { ui: { panel: 'news-detail', story } });
    } catch (err) {
      return say(`${story.title}. ${story.summary} (Não consegui aprofundar agora: ${err.message}.)`, { ui: { panel: 'news-detail', story } });
    }
  },
});

// ---- CLIMA (Open-Meteo, gratuito; cidade padrão Araguaína-TO) ----
const WEATHER_WORDS = /\b(clima|tempo|previsao|temperatura|chuva|chover|calor|frio|quente|graus|sol|nublado|umidade)\b/;
registerCommand({
  name: 'weather.rain', module: 'CLIMA', priority: 72, description: 'Vai chover?',
  aliases: ['Vai chover hoje?'],
  patterns: [/\b(vai chover|vai ter chuva|chance de chuva|probabilidade de chuva|previsao de chuva|chove hoje|tem chuva hoje)\b/],
  params: (t) => ({ tomorrow: /\bamanha\b/.test(t) }),
  action: async ({ tomorrow }) => {
    const w = await weather.weatherFast();
    return say(weather.weatherText(w, tomorrow ? 'tomorrow' : 'rain'));
  },
});
registerCommand({
  name: 'weather.tomorrow', module: 'CLIMA', priority: 71, description: 'Previsão para amanhã',
  aliases: ['Previsão para amanhã'],
  patterns: [(t) => (/\bamanha\b/.test(t) && WEATHER_WORDS.test(t) && !/\b(lembr|tarefa|agend|despert|alarme)\w*/.test(t) ? [t] : null)],
  action: async () => say(weather.weatherText(await weather.weatherFast(), 'tomorrow')),
});
registerCommand({
  name: 'weather.week', module: 'CLIMA', priority: 71, description: 'Previsão dos próximos dias',
  aliases: ['Previsão da semana'],
  patterns: [/\bprevisao (do tempo )?(para|pra|da|de|dos) (a |os )?(semana|proximos dias|fim de semana)\b/, /\b(clima|tempo) (da|na|nesta|essa) semana\b/, /\bproximos dias\b.*\b(clima|tempo|chuva|previsao)\b/],
  action: async () => say(weather.weatherText(await weather.weatherFast(), 'week')),
});
registerCommand({
  name: 'weather.today', module: 'CLIMA', priority: 70, description: 'Clima agora e previsão de hoje',
  aliases: ['Como está o dia hoje?', 'Como está o tempo?', 'Previsão do tempo', 'Qual a temperatura?'],
  patterns: [
    /\bcomo (o )?(dia|tempo|clima) (esta|ta|vai|ficou)\b/,
    /\bcomo (esta|ta|vai|ficou) (o )?(dia|tempo|clima)\b(?! (de|da|do) (trabalho|reuniao|tarefa))/,
    /\b(previsao do tempo|previsao de hoje|clima (de )?hoje|clima agora|o clima|qual (e |eh )?(o )?clima|tempo (la )?fora|como (esta|ta) la fora)\b/,
    /\b(qual|quanto)\w* (e |esta |ta )?(a )?temperatura\b/, /\btemperatura (agora|de hoje|hoje|la fora|em \w+)\b/, /^(clima|tempo|previsao|temperatura)( hoje| agora)?$/,
    /\b(esta|ta) (fazendo )?(muito )?(calor|frio|quente)\b/, /\bquantos graus\b/,
  ],
  action: async () => say(weather.weatherText(await weather.weatherFast(), 'today')),
});

registerCommand({
  name: 'news.exchange', module: 'NOTÍCIAS', priority: 64, description: 'Cotação de moedas',
  aliases: ['Como está o dólar?', 'Quanto está o euro?', 'Quanto está a libra?'],
  patterns: [
    (t) => (/\b(dolar|euro|cotacao|cambio)\b/.test(t) && !/\bcambio (do carro|da moto|automatico|manual|cvt)\b|\bmarchas?\b|\bcaixa de cambio\b|\b(carro|moto|caminhao|veiculo|barulho|ruido|oleo|engat\w+|embreagem)\b/.test(t) ? [t] : null),
    (t) => (/\blibra\b/.test(t) && /\b(quanto|como|cotacao|valor|preco|esta|ta)\b/.test(t) && !/\blibras? (de|pe|por)\b/.test(t) ? [t] : null),
  ],
  params: (t) => ({ currency: currencyOf(t) }),
  action: async ({ currency }, ctx) => {
    const ex = await news.exchangeFast();
    const out = news.exchangeText(ex, currency);
    ctx.sess.context.activeModule = 'news';
    return say(out.text, { speech: out.speech, ui: { panel: 'news', news: { exchange: ex, parts: ['exchange'] } } });
  },
});

registerCommand({
  name: 'news.fuel', module: 'NOTÍCIAS', priority: 64, description: 'Preço médio de combustíveis (ANP)',
  aliases: ['Quanto está a gasolina?', 'Quanto está o diesel?', 'Como está o combustível no Tocantins?'],
  patterns: [(t) => (/\b(gasolina|diesel|combustive(l|is))\b/.test(t) && /\b(quanto|preco|precos|valor|como|esta|ta|custa|media|litro|tocantins|brasil)\b|^(gasolina|diesel|combustive(l|is))$/.test(t) && !/\bmotor (a|de) diesel\b/.test(t) ? [t] : null)],
  params: (t) => ({ which: /gasolina/.test(t) && !/diesel/.test(t) ? 'gasolina' : /diesel/.test(t) && !/gasolina/.test(t) ? 'diesel' : null }),
  action: async ({ which }, ctx) => {
    const f = await news.fuelFast('TO');
    const out = news.fuelText(f, which);
    ctx.sess.context.activeModule = 'news';
    return say(out.text, { speech: out.speech, ui: { panel: 'news', news: { fuel: f, parts: ['fuel'] } } });
  },
});

async function storiesCommand(parts, intro, ctx) {
  const summary = await news.getSummary({ parts });
  ctx.sess.context.activeModule = 'news';
  const stories = news.storiesSpeech(summary.stories);
  return say(`${intro} ${stories} Quer que eu aprofunde alguma delas?`, { speech: stories || intro, ui: { panel: 'news', news: summary } });
}

registerCommand({
  name: 'news.brazil', module: 'NOTÍCIAS', priority: 63, description: 'Principais notícias do Brasil',
  aliases: ['Me conte as principais notícias do Brasil'],
  patterns: [/\bnoticias? (principais |importantes )?do brasil\b/, /\b(o que (esta acontecendo|aconteceu) no brasil)\b/],
  action: async (_, ctx) => storiesCommand(['brazil'], 'Principais notícias do Brasil.', ctx),
});

registerCommand({
  name: 'news.world', module: 'NOTÍCIAS', priority: 63, description: 'Principais notícias do mundo',
  aliases: ['Me conte as principais notícias do mundo'],
  patterns: [/\bnoticias? (principais |importantes )?(do mundo|internaciona\w+)\b/, /\bo que (esta acontecendo|aconteceu) no mundo\b/],
  action: async (_, ctx) => storiesCommand(['world'], 'Principais notícias do mundo.', ctx),
});

registerCommand({
  name: 'news.curiosity', module: 'NOTÍCIAS', priority: 62, description: 'Uma notícia interessante',
  aliases: ['Tem alguma coisa interessante acontecendo?'],
  patterns: [/\b(alguma coisa|algo) (de )?interessante\b/, /\bcuriosidade do dia\b/, /\bnoticia (curiosa|interessante)\b/],
  action: async (_, ctx) => storiesCommand(['curiosity'], 'Uma coisa interessante.', ctx),
});

registerCommand({
  name: 'news.summary', module: 'NOTÍCIAS', priority: 61, description: 'Resumo completo: câmbio, combustíveis, Brasil, mundo e curiosidade',
  aliases: ['Notícias', 'Notícias de hoje', 'Me atualiza', 'O que aconteceu hoje?', 'Me atualiza rapidamente'],
  patterns: [/^(as )?noticias?( de hoje| do dia| agora)?$/, /\bme atualiz\w*\b/, /\b(mostr\w+|abr\w+|quero (ver |saber )?|traz\w*|ver|ler|tem) (as |umas |algumas )?(ultimas )?noticias\b/, /\bo que aconteceu hoje\b/, /\b(resumo|principais|ultimas) (das |de )?noticias\b/, /\bquais (sao )?as noticias\b/, /\bnovidades de hoje\b/, /\bnoticias de hoje\b/],
  action: async (_, ctx) => {
    const summary = await news.getSummary();
    ctx.sess.context.activeModule = 'news';
    const parts = [];
    const ex = news.exchangeText(summary.exchange);
    parts.push(summary.exchange?.ok || summary.exchange?.pending ? `${ex.speech}` : 'Não consegui confirmar a cotação atual neste momento.');
    const fu = news.fuelText(summary.fuel);
    parts.push(summary.fuel?.ok || summary.fuel?.pending ? fu.speech : 'Os preços de combustíveis da ANP não estão acessíveis agora.');
    parts.push(news.storiesSpeech(summary.stories));
    const spoken = parts.filter(Boolean).join(' ');
    return say(`${spoken} Quer que eu aprofunde alguma delas?`, { speech: spoken, ui: { panel: 'news', news: summary } });
  },
});

// ======================= MEMÓRIA =======================
function previousUserText(sess) {
  const users = sess.history.filter((h) => h.role === 'user');
  return users.length >= 2 ? users[users.length - 2].content : null;
}

// ======================= TAREFAS / LEMBRETES =======================
const taskRefs = (sess) => sess.context.lastTaskId;
const users = (sess) => sess.history.filter((h) => h.role === 'user');
function resolveTask(t, sess) {
  const pend = tasks.list();
  const n = (t.match(/\b(?:tarefa|lembrete|rotina|numero)\s+(\w+)/) || [])[1];
  if (n && parseOrdinal(n)) return pend[parseOrdinal(n) - 1] || null;
  const last = taskRefs(sess) && pend.find((x) => x.id === taskRefs(sess));
  if (last) return last;
  return pend.length === 1 ? pend[0] : null;
}

registerCommand({
  name: 'task.reminder', module: 'TAREFAS', priority: 61, mutates: true, description: 'Cria lembrete com data/hora',
  aliases: ['Me lembra de estudar às 19h', 'Me lembra disso amanhã', 'Me avisa daqui a 20 minutos para tirar o bolo'],
  patterns: [/^(me lembr\w+|lembr\w+ me|me avis\w+|avis\w+ me|cria\w* (um )?lembrete|lembrete|marca\w*)\b(.*)$/],
  params: (t, m, s) => {
    const when = parseWhen(t);
    let text = (when ? when.rest : t).replace(/^(me lembr\w+|lembr\w+ me|me avis\w+|avis\w+ me|cria\w* (um )?lembrete|lembrete|marca\w*)\s*(de|que|para|pra|da|do|sobre)?\s*/, '').trim();
    if (!text || /^(disso|isso|isto)$/.test(text)) {
      const prev = users(s);
      text = prev.length >= 2 ? prev[prev.length - 2].content : '';
    }
    // Devolve o trecho com acentos/maiúsculas originais (ou a frase anterior, já original).
    text = recoverOriginal(s.lastRaw, text.replace(/^(de|que|para|pra)\s+/, ''));
    return { text: text.charAt(0).toUpperCase() + text.slice(1), when };
  },
  action: async ({ text, when }, ctx) => {
    if (!text) return say('Do que você quer que eu te lembre?');
    if (memory.detectSensitive(text)) return say('Isso parece conter dados sensíveis. Não vou salvar em um lembrete.');
    const task = tasks.add(text, when ? { dueAt: when.date, hasTime: when.hasTime } : {});
    ctx.sess.context.lastTaskId = task.id;
    const perm = ctx.client?.notifications;
    const note = when && perm !== 'granted' ? ' Para receber o aviso, mantenha o JARVIS aberto' + (perm === 'unsupported' ? ' (este navegador não suporta notificações).' : ' ou ative as notificações nas configurações.') : '';
    return say(when ? `Lembrete criado: ${text}, ${when.label}.${note}` : `Anotado: ${text}. Sem data definida — diga, por exemplo, "adia para amanhã às 9h" para marcar um horário.`, { data: { task } });
  },
});

registerCommand({
  name: 'task.list', module: 'TAREFAS', priority: 60, description: 'Lista tarefas e lembretes',
  aliases: ['Quais são minhas tarefas?', 'Meus lembretes'],
  patterns: [/\b(minhas tarefas|quais (sao )?(as |minhas )?tarefas|lista de tarefas|tarefas pendentes|meus lembretes|quais (sao )?(os |meus )?lembretes|o que (eu )?tenho (pra|para) fazer)\b/],
  action: async (_, ctx) => {
    const pend = tasks.list();
    if (pend.length === 1) ctx.sess.context.lastTaskId = pend[0].id;
    return say(pend.length ? `Você tem ${pend.length} tarefa${pend.length > 1 ? 's' : ''}:\n${pend.map((t, i) => `${i + 1}) ${tasks.describe(t)}`).join('\n')}` : 'Nenhuma tarefa pendente.', { data: { tasks: pend } });
  },
});

// ---- AGENDA: rotinas com horário ("todo dia às 7h me lembre de…", "de segunda a sexta às 6h30 me dê as notícias") ----
function parseRoutine(t, raw) {
  const d = tasks.parseDays(t);
  if (!d) return null;
  const when = parseWhen(t.replace(d.phrase, ' '));
  if (!when?.hasTime) return null;
  const p = zonedParts(when.date);
  const action = tasks.actionOf(when.rest);
  let text = tasks.ACTIONS[action].label;
  if (action === 'lembrete') {
    const phrase = when.rest.replace(/^\s*(e |jarvis |,)*/, '').replace(/^(me |nos )?(lembr\w*|avis\w*|alert\w*|cham\w*)( me)?( (de|que|para|pra|sobre|da|do))?\s+/, '').replace(/^(lembrete|tarefa)( de| para| pra)?\s+/, '').trim();
    text = phrase ? recoverOriginal(raw, phrase) : '';
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1);
  }
  return { days: d.days, time: `${p.h}:${String(p.mi).padStart(2, '0')}`, action, text };
}
registerCommand({
  name: 'task.routine', module: 'TAREFAS', priority: 85, mutates: true, description: 'Agenda uma rotina com horário',
  aliases: ['Todo dia às 7h me dê as notícias', 'De segunda a sexta às 6h30 me lembre de tomar o remédio'],
  patterns: [(t) => (tasks.parseDays(t) && parseRoutine(t, t) ? [t] : null)],
  params: (t, m, s) => ({ r: parseRoutine(t, s.lastRaw || t) }),
  action: async ({ r }, ctx) => {
    if (!r.text) return say('O que devo te lembrar nesse horário? Diga, por exemplo: "todo dia às 7h me lembre de tomar o remédio".');
    if (memory.detectSensitive(r.text)) return say('Isso parece conter dados sensíveis. Por segurança, não vou salvar.');
    const task = tasks.add(r.text, { repeat: { days: r.days, time: r.time }, action: r.action });
    ctx.sess.context.lastTaskId = task.id;
    const what = r.action === 'lembrete' ? `vou te lembrar: ${r.text}` : `${r.text.toLowerCase()}`;
    return say(`Agendado: ${tasks.describeRepeat(task.repeat)}, ${what}.`, { data: { task }, ui: { panel: 'agenda' } });
  },
});
registerCommand({
  name: 'task.routines', module: 'TAREFAS', priority: 64, description: 'Mostra a agenda de rotinas',
  aliases: ['Minhas rotinas', 'Abrir agenda'],
  patterns: [/^(minhas |as |ver |mostr\w+ (as |minhas )?)?rotinas$/, /\b(abr\w+|mostr\w+|ver) (a )?agenda\b/, /^agenda$/, /\bquais (sao )?(as )?minhas rotinas\b/],
  action: async () => {
    const list = tasks.routines();
    if (!list.length) return say('Você ainda não tem rotinas. Diga, por exemplo: "todo dia às 7h me dê as notícias", ou abra a Agenda e crie uma.', { ui: { panel: 'agenda' } });
    return say(`Suas rotinas:\n${list.map((t, i) => `${i + 1}. ${tasks.describe(t)}`).join('\n')}`, { speech: `Você tem ${list.length} rotina${list.length > 1 ? 's' : ''}: ${list.map((t) => tasks.describe(t)).join('; ')}.`, ui: { panel: 'agenda' } });
  },
});

registerCommand({
  name: 'task.add', module: 'TAREFAS', priority: 60, mutates: true, description: 'Adiciona tarefa',
  aliases: ['Adicione a tarefa trocar o óleo'],
  patterns: [/\b(adicion\w+|cri\w+|anot\w+|coloc\w+|nova) (uma |a |na lista )?tarefas?:?\s+(?:de |para |pra )?(.+)$/],
  params: (t, m, s) => { const when = parseWhen(m[3]); return { text: recoverOriginal(s.lastRaw, (when ? when.rest : m[3]).trim()), when }; },
  action: async ({ text, when }, ctx) => {
    if (memory.detectSensitive(text)) return say('Isso parece conter dados sensíveis. Por segurança, não vou salvar.');
    const task = tasks.add(text, when ? { dueAt: when.date, hasTime: when.hasTime } : {});
    ctx.sess.context.lastTaskId = task.id;
    return say(`Tarefa anotada: ${text}${when ? `, ${when.label}` : ''}.`, { data: { task } });
  },
});

registerCommand({
  name: 'task.done', module: 'TAREFAS', priority: 62, mutates: true, description: 'Conclui tarefa ("concluí essa")',
  aliases: ['Concluí essa', 'Conclui a tarefa 1', 'Já fiz'],
  patterns: [/^(conclui|concluido|feito|ja fiz|fiz|terminei|pronto|done)( essa| esta| isso| ela| a tarefa| o lembrete)?$/, /^(marqu?\w* (isso |essa |a tarefa |o lembrete )?como (concluid[oa]|feit[oa]|pronto|pronta|terminad[oa]))$/, /\b(conclu\w+|termin\w+|marc\w+ como feita|finaliz\w+|risca\w*) (a |essa |esta |o )?(tarefa|lembrete)\s*(\w+)?/],
  params: (t, m, s) => ({ task: resolveTask(t, s) }),
  action: async ({ task }) => {
    if (!task) return say('Qual tarefa? Diga "concluí a tarefa 1" ou peça "minhas tarefas" para ver a lista.');
    tasks.complete(task.id);
    return say(`Concluída: ${task.text}. 👍`);
  },
});

registerCommand({
  name: 'task.cancel', module: 'TAREFAS', priority: 62, permission: 'confirm', description: 'Cancela tarefa/lembrete',
  aliases: ['Cancela essa tarefa', 'Cancela o lembrete 2'],
  patterns: [/\b(cancel\w+|desmarc\w+|remov\w+|apag\w+) (essa |esta |a |o )?(tarefa|lembrete|rotina)\s*(\w+)?/],
  params: (t, m, s) => ({ task: resolveTask(t, s) }),
  confirmText: ({ task }) => (task ? `Cancelar a tarefa "${task.text}"?` : null),
  action: async ({ task }) => { if (!task) return say('Não encontrei essa tarefa.'); tasks.cancel(task.id); return say(`Tarefa cancelada: ${task.text}.`); },
});

registerCommand({
  name: 'task.postpone', module: 'TAREFAS', priority: 62, mutates: true, description: 'Adia tarefa/lembrete',
  aliases: ['Adia para amanhã', 'Adia a tarefa 1 para as 20h'],
  patterns: [/\b(adia|adie|adiar|adiou|adiando|remarc\w+|empurr\w+|transfer\w+)\b(.*)$/],
  params: (t, m, s) => ({ task: resolveTask(t, s), when: parseWhen(t) }),
  action: async ({ task, when }, ctx) => {
    if (!task) return say('Qual tarefa devo adiar? Diga, por exemplo, "adia a tarefa 1 para amanhã".');
    if (!when) return say('Para quando? Ex.: "adia para amanhã às 9h".');
    tasks.postpone(task.id, when.date, when.hasTime);
    ctx.sess.context.lastTaskId = task.id;
    return say(`Adiado: ${task.text}, agora ${when.label}.`);
  },
});

registerCommand({
  name: 'task.edit', module: 'TAREFAS', priority: 62, mutates: true, description: 'Edita o texto de uma tarefa',
  aliases: ['Muda a tarefa 1 para comprar pão integral'],
  patterns: [/\b(muda|mude|altera|altere|edita|edite|troca|troque) (a |essa )?(tarefa|lembrete)\s*(\w+)? para (.+)$/],
  params: (t, m, s) => ({ task: resolveTask(t, s), text: recoverOriginal(s.lastRaw, m[5]) }),
  action: async ({ task, text }) => { if (!task) return say('Não encontrei essa tarefa.'); tasks.edit(task.id, text); return say(`Tarefa alterada para: ${text}.`); },
});

registerCommand({
  name: 'memory.remember', mutates: true, module: 'MEMÓRIA', priority: 58, description: 'Salva uma memória persistente',
  aliases: ['Lembre que eu prefiro café sem açúcar', 'Lembre disso'],
  patterns: [/^(lembr[ae]|lembrar|memoriz\w+|guard[ae]|anot[ae]|salv[ae]|grav[ae])(?! o que| quando| como| onde)( (disso|isso|essa informacao|que|de que|o seguinte|isto)\b|:)?(.*\S.*|)$/],
  params: (t, m, s) => {
    const raw = s.lastRaw.replace(/^\s*(ei |ok )?jarvis[,\s]*/i, '');
    const after = (raw.match(/^\s*\S+\s+(?:que|de que|o seguinte|:)\s*(.+)$/i) || [])[1];
    let text = after && !/^(disso|isso|isto)\.?$/i.test(after.trim()) ? after.trim() : null;
    if (!text && /\b(disso|isso|isto|essa informacao)\b/.test(m[2] || '') ) text = previousUserText(s);
    if (!text && m[4] && m[4].trim().length > 3) text = raw.replace(/^\s*\S+\s*/, '');
    const preference = /\b(prefiro|gosto de|nao gosto|quero que voce|sempre que|me chame de|meu nome e)\b/.test(normalize(text || ''));
    return { text, kind: preference ? 'preferences' : 'facts' };
  },
  action: async ({ text, kind }, ctx) => {
    if (!text) return say('O que você quer que eu lembre?');
    const sens = memory.detectSensitive(text);
    if (sens && !ctx.confirmed) {
      ctx.sess.pending = { name: 'memory.remember', params: { text, kind }, question: `Isso parece conter ${sens}. Se confirmar, guardo criptografado e só mostro na tela após nova confirmação. Quer mesmo salvar?` };
      return say(ctx.sess.pending.question, { awaitingConfirmation: true });
    }
    const clean = text.replace(/[.!]+$/, '');
    const item = memory.add(kind, clean, sens ? { sensitive: sens, hint: normalize(clean).split(' ').filter((w) => !/\d/.test(w)).slice(0, 6).join(' ') } : {});
    ctx.sess.context.lastMemoryId = item.id;
    return say(sens ? `Guardado de forma protegida (${sens}). Não vou repetir em voz alta.` : `Certo, vou lembrar: ${clean}.`, { data: { memory: item } });
  },
});

registerCommand({
  name: 'memory.forget', module: 'MEMÓRIA', priority: 58, permission: 'confirm', description: 'Apaga uma memória (pede confirmação)',
  aliases: ['Esqueça isso', 'Esqueça que eu moro em Palmas'],
  patterns: [/^(esquec\w+|apag\w+|delet\w+|remov\w+)( (isso|isto|disso|que|a memoria|da memoria|sobre|o que eu disse))?(.*)$/],
  params: (t, m, s) => {
    const q = (m[4] || '').replace(/^\s*(sobre|de|que)\s+/, '').trim();
    let target = null;
    if (q.length > 2) target = memory.search(q, { limit: 1, min: 0.1 })[0];
    else if (s.context.lastMemoryId) target = [...memory.list('facts'), ...memory.list('preferences')].find((x) => x.id === s.context.lastMemoryId);
    if (!target && q.length <= 2) {
      const all = [...memory.list('facts'), ...memory.list('preferences'), ...memory.list('tasks')].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      target = all[0];
    }
    return { target };
  },
  confirmText: ({ target }) => (target ? `Tem certeza que deseja apagar esta memória: "${target.text}"?` : null),
  action: async ({ target }, ctx) => {
    if (!target) return say('Não encontrei nenhuma memória correspondente.');
    memory.remove(target.id);
    if (ctx.sess.context.lastMemoryId === target.id) ctx.sess.context.lastMemoryId = null;
    return say('Memória apagada.');
  },
});

registerCommand({
  name: 'memory.recall', module: 'MEMÓRIA', priority: 57, description: 'Consulta memórias',
  aliases: ['O que você lembra sobre isso?', 'O que você sabe sobre mim?'],
  patterns: [/\b(o que voce (lembra|sabe|guardou|tem)|voce lembra|voce se lembra|do que voce lembra)\b(.*)$/],
  params: (t, m) => ({ query: (m[3] || '').replace(/^\s*(sobre|de|da|do|que|na memoria|guardado)\s*/, '').trim() }),
  action: async ({ query }, ctx) => {
    let q = query;
    if (!q || /^(isso|isto|disso|mim|de mim)$/.test(q)) {
      if (/mim/.test(q || '')) q = '';
      else q = previousUserText(ctx.sess) || '';
    }
    const items = q ? memory.search(q, { limit: 5 }) : [...memory.list('facts'), ...memory.list('preferences')].slice(-8);
    if (items.length) ctx.sess.context.lastMemoryId = items[0].id;
    const prot = items.find((i) => i.protected);
    if (prot) {
      ctx.sess.pending = { name: 'memory.reveal', params: { id: prot.id }, question: 'Tenho uma informação protegida sobre isso. Quer que eu mostre na tela? (não vou falar em voz alta)' };
      const others = items.filter((i) => !i.protected);
      return say(`${others.length ? `Lembro disso: ${others.map((i) => i.text).join('; ')}. ` : ''}${ctx.sess.pending.question}`, { awaitingConfirmation: true });
    }
    if (!items.length) return say(q ? 'Não tenho nada guardado sobre isso.' : 'Ainda não tenho memórias guardadas. Diga "lembre que..." para eu guardar algo.');
    return say(`Lembro disso: ${items.map((i) => i.text).join('; ')}.`);
  },
});

registerCommand({
  name: 'memory.reveal', module: 'MEMÓRIA', priority: 0, permission: 'confirm', description: 'Mostra memória protegida (após confirmação)',
  patterns: [/^\b$/], // só acionado por confirmação
  action: async ({ id }) => {
    const text = memory.reveal(id);
    return text ? say(`🔒 ${text}`, { speech: 'Mostrei a informação na tela.', sensitive: true }) : say('Não encontrei essa memória.');
  },
});

// ======================= CASA =======================
registerCommand({
  name: 'house.control', module: 'CASA', priority: 55, permission: 'restricted', description: 'Controla dispositivos (requer integração)',
  aliases: ['Ligar a luz da sala', 'Desligar a TV'],
  patterns: [/\b(liga|ligar|ligue|acende|acender|acenda|desliga|desligar|desligue|apaga|apagar|apague)\b.{0,30}\b(luz|luzes|lampada|tomada|tv|televisao|ventilador|ar condicionado|ar|computador|pc|som|cafeteira|portao)\b/],
  params: (t) => house.parseHouseCommand(t),
  confirmText: (p) => (p.critical ? `Tem certeza que deseja ${p.action === 'turn_off' ? 'desligar' : 'acionar'} ${p.target}?` : null),
  action: async (p) => { const r = await house.execute(p); return say(r.text, { ui: { panel: 'house' } }); },
});

registerCommand({
  name: 'house.status', module: 'CASA', priority: 54, description: 'Estado da casa',
  aliases: ['Como está a casa?', 'Quais dispositivos estão conectados?'],
  patterns: [/\b(dispositivos|casa inteligente|modulo casa|como esta a casa|minha casa)\b/],
  action: async () => {
    const st = await house.status();
    if (!st.available) return say(`${st.reason} Todas as funções da casa estão indisponíveis por enquanto.`, { ui: { panel: 'house' } });
    const n = st.categories.reduce((s, c) => s + c.devices.length, 0);
    return say(`Encontrei ${n} dispositivos conectados pelo Home Assistant.`, { ui: { panel: 'house' } });
  },
});

// ======================= ENGENHARIA / MOTOR (cálculo local) =======================
registerCommand({
  name: 'engine.calc', module: 'MOTOR', priority: 66, description: 'Cálculos automotivos (potência, torque, cilindrada, consumo)',
  aliases: ['Qual a potência com 300 Nm a 4000 rpm?', 'Rodei 420 km com 35 litros, qual o consumo?'],
  patterns: [(t) => { const r = tryEngineCalc(t); return r ? [r] : null; }],
  params: (t, m) => m[0],
  action: async (r) => say(`${r.text} Fórmula: ${r.formula}.`, { speech: r.text }),
});

registerCommand({
  name: 'engineering.ohm', module: 'ENGENHARIA', priority: 52, description: 'Lei de Ohm',
  aliases: ['Qual a corrente com 12 volts e 4 ohms?'],
  patterns: [/(\d+(?:[.,]\d+)?)\s*(?:v|volts?)\b.*?(\d+(?:[.,]\d+)?)\s*(?:ohms?|Ω)\b/],
  params: (t, m) => ({ v: parseFloat(m[1].replace(',', '.')), r: parseFloat(m[2].replace(',', '.')) }),
  action: async ({ v, r }) => {
    if (!r) return say('Resistência zero: seria um curto-circuito (corrente teoricamente infinita).');
    const i = v / r;
    return say(`Pela Lei de Ohm, I = V/R = ${formatNumber(v)} V / ${formatNumber(r)} Ω = ${formatNumber(i, 4)} A. A potência dissipada é P = V·I = ${formatNumber(v * i, 3)} W.`);
  },
});

registerCommand({
  name: 'engineering.convert', module: 'ENGENHARIA', priority: 51, description: 'Conversão de unidades',
  aliases: ['Converter 10 km em milhas', 'Quanto é 32 psi em bar?', '30 graus celsius em fahrenheit'],
  patterns: [(t) => { const r = tryConvert(t.replace(/^(converte|converter|converta|quanto e|quanto da|quantos|quantas)\s+/, '').replace(/^(e|da|sao)\s+/, '')); return r ? [r] : null; }],
  params: (t, m) => m[0],
  action: async (r) => (r.error ? say(r.error) : say(`${formatNumber(r.value)} ${r.from} = ${formatNumber(r.result, 4)} ${r.to}.`)),
});

registerCommand({
  name: 'engineering.math', module: 'ENGENHARIA', priority: 50, description: 'Contas e expressões matemáticas',
  aliases: ['Quanto é 15% de 230?', 'Raiz quadrada de 144', '2 mais 3 vezes 4'],
  patterns: [(t) => { const r = tryMath(t); return r ? [r] : null; }],
  params: (t, m) => m[0],
  action: async (r) => say(`${r.expression.replace(/\*/g, '×').replace(/sqrt/g, '√')} = ${formatNumber(r.value)}`, { speech: `O resultado é ${formatNumber(r.value)}.` }),
});


// ======================= CÁLCULOS: FÍSICA, MOTOR E VIAGEM =======================
registerCommand({
  name: 'physics.solve', module: 'ENGENHARIA', priority: 65, description: 'Problemas de física, viagem e motor (distância, tempo, velocidade, força, pressão, energia, consumo, custo, relação de marcha)',
  aliases: ['Se eu andar a 80 km/h durante 12 minutos, quantos quilômetros percorro?', 'Quanto gasto em 300 km com 10 km/l e gasolina a 6,20?', 'Qual a força para 10 kg a 9,8 m/s²?'],
  patterns: [(t) => { const r = solvePhysics(t); return r ? [r] : null; }],
  params: (t, m) => m[0],
  action: async (r) => (r.ask ? say(r.ask, { module: r.module }) : say(`${r.text} Fórmula: ${r.formula}.`, { speech: r.text.replace(/≈/g, 'aproximadamente '), formula: r.formula, module: r.module })),
});

registerCommand({
  name: 'calc.start', module: 'ENGENHARIA', priority: 49, description: 'Entra no modo cálculo',
  aliases: ['Me ajude a calcular', 'Faça uma conta'],
  patterns: [/^(me ajud\w+ a calcular|me ajuda (com uma conta|com umas contas|a fazer uma conta)|(faca|faz|fazer) (uma|umas) contas?|quero fazer uma conta|preciso (fazer uma conta|calcular( algo| uma coisa)?)|calculadora|modo calculo|abre a calculadora)$/],
  action: async (_, ctx) => { setMode(ctx.sess, 'calc'); return say('Claro. Diga a conta ou o problema. Exemplos: "15% de 230", "raiz quadrada de 144", "converta 100 km/h para m/s", "quanto tempo para 150 km a 90 km/h" ou "potência com 300 Nm a 4000 rpm".'); },
});

// ======================= TAREFAS: pedido sem texto =======================
registerCommand({
  name: 'task.ask', module: 'TAREFAS', priority: 61, description: 'Pergunta qual tarefa criar',
  aliases: ['Crie uma tarefa'],
  patterns: [/^(cri\w+|adicion\w+|anot\w+|nova|fazer|faz) (uma |a )?(nova )?tarefa$/],
  action: async (_, ctx) => { ctx.sess.context.awaiting = 'task.text'; return say('Claro. Qual é a tarefa?'); },
});

// ======================= REVISÃO =======================
registerCommand({
  name: 'routine.review', module: 'ROTINA', priority: 79, description: 'Revisão: tarefas, leitura, memórias e sistema',
  aliases: ['Faça uma revisão', 'Revisão do dia'],
  patterns: [/^(faca|faz|fazer|me (de|da)) (uma )?revisao( do dia| geral| de hoje)?$/, /^revis(ao|e|a)( do (meu )?dia| geral| de hoje| meu dia)?$/, /\b(revis\w+ (o |do )?meu dia|resumo geral)\b/],
  action: async (_, ctx) => {
    const t = tasks.today();
    const all = tasks.list();
    const done = tasks.list({ includeDone: true }).filter((x) => x.done && x.updatedAt && x.updatedAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
    const bible = await reading.current(ctx.pageSize).catch(() => null);
    const mems = memory.list('facts').length + memory.list('preferences').length;
    const lines = ['Revisão:'];
    lines.push(`✅ Tarefas: ${all.length} pendente(s)${t.overdue.length ? `, ${t.overdue.length} atrasada(s)` : ''}${t.today.length ? `, ${t.today.length} para hoje` : ''}${done.length ? ` · ${done.length} concluída(s) hoje` : ''}.`);
    if (t.overdue.length) lines.push(`⚠ Atrasadas: ${t.overdue.map((x) => tasks.describe(x)).join('; ')}`);
    if (bible?.plan) lines.push(`📖 Bíblia: ${bible.plan.label} — ${bible.plan.done}/${bible.plan.total} capítulos${bible.plan.completedAt ? ' (concluída)' : ''}; você está em ${bible.ref.label}, página ${bible.pageIndex + 1}. Sequência: ${bible.streak} dia(s).`);
    else if (bible) lines.push(`📖 Bíblia: próxima leitura começa em ${bible.position.label}.`);
    lines.push(`🧠 Memória: ${mems} item(ns) guardado(s).`);
    const ai = llm.status();
    lines.push(`🖥 Sistema: ${ai.state}${ai.configured ? ` (${ai.providerName})` : ' — modo local inteligente ativo'}.`);
    const speech = `Revisão. ${all.length ? `Você tem ${all.length} tarefa${all.length > 1 ? 's' : ''} pendente${all.length > 1 ? 's' : ''}${t.overdue.length ? `, ${t.overdue.length} atrasada${t.overdue.length > 1 ? 's' : ''}` : ''}.` : 'Nenhuma tarefa pendente.'} ${bible?.plan ? (bible.plan.completedAt ? 'A leitura bíblica de hoje está concluída.' : `Leitura bíblica: ${bible.plan.label}, ${bible.plan.done} de ${bible.plan.total} capítulos.`) : ''}`;
    return say(lines.join('\n'), { speech: speech.trim(), data: { tasks: t, bible: bible?.plan || null } });
  },
});


// ======================= IA LOCAL: TESTE DE VELOCIDADE =======================
registerCommand({
  name: 'ai.benchmark', module: 'SISTEMA', priority: 86, mutates: true, description: 'Testa a velocidade da IA local e escolhe os núcleos mais rápidos',
  aliases: ['Teste a velocidade da IA', 'Otimizar a IA'],
  patterns: [/\b(test\w*|med\w+|mede|meca|verific\w+) (a )?velocidade (da|do) (ia|jarvis|cerebro|inteligencia)\b/, /\b(otimiz\w+|acelera\w*|deixa\w* mais rapid\w+) (a )?(ia|jarvis)\b/, /^teste de velocidade$/],
  action: async () => {
    await llm.refresh().catch(() => {});
    if (llm.status().kind !== 'local') return say('O teste de velocidade é para a IA local (Ollama), e ela não está ligada agora.');
    // Roda em segundo plano (com a IA lenta pode passar de 1 minuto) e avisa na tela ao terminar.
    if (!llm.runBenchmark()) return say('O teste de velocidade já está rodando. Aviso aqui quando terminar.');
    return say('Testando a velocidade da IA com 2, 4 e 8 núcleos do processador. Leva cerca de um minuto; aviso aqui quando terminar.');
  },
});

export const YES = /^(sim|pode|pode sim|confirmo|confirma|confirmar|claro|isso|tenho|tenho certeza|com certeza|ok|positivo|manda|manda ver|faz isso|pode fazer|afirmativo|s)$/;
export const NO = /^(nao|cancela|cancelar|negativo|deixa|deixa pra la|esquece|nao precisa|n|melhor nao)$/;

export function findCommand(name) { return registry.find((c) => c.name === name); }
