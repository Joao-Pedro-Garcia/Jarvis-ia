// SISTEMA DE COMANDOS extensível.
// Cada comando possui: name, module, description, aliases (frases de exemplo),
// patterns (intenção), context (quando depende da conversa), params,
// permission ('safe' | 'confirm' | 'restricted'), action e confirmText.
// Para adicionar um comando novo, chame registerCommand({...}) — veja o README.
import * as reading from '../modules/bible/reading.js';
import { findReference, refLabel } from '../modules/bible/books.js';
import * as news from '../modules/news/news.js';
import { getExchange } from '../modules/news/exchange.js';
import { getFuel } from '../modules/news/fuel.js';
import * as memory from '../modules/memory/memory.js';
import * as house from '../modules/house/house.js';
import { tryMath, formatNumber } from '../modules/engineering/math.js';
import { tryConvert } from '../modules/engineering/units.js';
import { tryEngineCalc } from '../modules/engine/engine.js';
import { formatTimeSpoken, formatDateLong } from '../core/time.js';
import { parseOrdinal, normalize } from '../core/text.js';
import { getSettings, updateSettings } from '../core/settings.js';
import * as llm from './llm.js';
import { isOnline } from '../core/http-client.js';

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

const bibleActive = (s) => s.context.activeModule === 'bible';
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

registerCommand({
  name: 'system.help', module: 'SISTEMA', priority: 80, description: 'Mostra o que o JARVIS sabe fazer',
  aliases: ['O que você consegue fazer?'],
  patterns: [/\b(o que voce (sabe|consegue|pode) fazer|quais (sao )?(os )?(seus )?comandos|lista de comandos|me mostra os comandos)\b/],
  action: async () => say('Posso conversar, ajudar em estudos, engenharia e motores, fazer contas e conversões, lembrar o que você pedir, acompanhar tarefas, continuar sua leitura da Bíblia, passar páginas, trazer notícias, câmbio e combustíveis, e controlar a casa quando houver integração configurada. Diga, por exemplo, "Bíblia", "Notícias" ou "lembre que...".', { ui: { panel: 'modules' } }),
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
    return say(reading.whereAmI(), { ui: ctx.sess.context.activeModule === 'bible' ? bibleUi(v) : undefined });
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
    (t, s) => (bibleActive(s) && /^(proxima|proximo|avanca|avance|avancar|segue|seguir|pode passar|passa|passe|vai|continua|continue|adiante|mais|pra frente|para frente|vira)$/.test(t) ? [t] : null),
  ],
  action: async (_, ctx) => { const v = await reading.turnPage('next', ctx.pageSize); ctx.sess.context.activeModule = 'bible'; return say(v.message || `Página ${v.pageIndex + 1} de ${v.pageCount}.`, { speech: v.message || '', ui: bibleUi(v), animate: 'next' }); },
});

registerCommand({
  name: 'bible.prev_page', module: 'BÍBLIA', priority: 68, description: 'Volta a página',
  aliases: ['Volta a página', 'Página anterior', 'Voltar'],
  patterns: [
    /\b(volt\w+|retorn\w+) (a |uma |para a |pra )?pagina\b/, /\bpagina anterior\b/,
    (t, s) => (bibleActive(s) && /^(volta|volte|voltar|anterior|retorna|retornar|para tras|pra tras|volta ai|volta uma)$/.test(t) ? [t] : null),
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

registerCommand({
  name: 'news.exchange', module: 'NOTÍCIAS', priority: 64, description: 'Cotação de moedas',
  aliases: ['Como está o dólar?', 'Quanto está o euro?', 'Quanto está a libra?'],
  patterns: [
    (t) => (/\b(dolar|euro|cotacao|cambio)\b/.test(t) && !/\bcambio (do carro|da moto|automatico|manual|cvt)\b|\bmarchas?\b|\bcaixa de cambio\b|\b(carro|moto|caminhao|veiculo|barulho|ruido|oleo|engat\w+|embreagem)\b/.test(t) ? [t] : null),
    (t) => (/\blibra\b/.test(t) && /\b(quanto|como|cotacao|valor|preco|esta|ta)\b/.test(t) && !/\blibras? (de|pe|por)\b/.test(t) ? [t] : null),
  ],
  params: (t) => ({ currency: currencyOf(t) }),
  action: async ({ currency }, ctx) => {
    const ex = await getExchange().catch(() => ({ ok: false }));
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
    const f = await getFuel('TO').catch(() => ({ ok: false }));
    const out = news.fuelText(f, which);
    ctx.sess.context.activeModule = 'news';
    return say(out.text, { speech: out.speech, ui: { panel: 'news', news: { fuel: f, parts: ['fuel'] } } });
  },
});

async function storiesCommand(parts, intro, ctx) {
  const summary = await news.getSummary({ parts });
  ctx.sess.context.activeModule = 'news';
  const speech = `${intro} ${news.storiesSpeech(summary.stories)} Quer que eu aprofunde alguma delas?`;
  return say(speech, { ui: { panel: 'news', news: summary } });
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
  patterns: [/^(as )?noticias?( de hoje| do dia| agora)?$/, /\bme atualiz\w*\b/, /\bo que aconteceu hoje\b/, /\b(resumo|principais|ultimas) (das |de )?noticias\b/, /\bquais (sao )?as noticias\b/, /\bnovidades de hoje\b/, /\bnoticias de hoje\b/],
  action: async (_, ctx) => {
    const summary = await news.getSummary();
    ctx.sess.context.activeModule = 'news';
    const parts = ['Claro. Aqui está seu resumo.'];
    const ex = news.exchangeText(summary.exchange);
    parts.push(summary.exchange?.ok ? `${ex.speech}` : 'Não consegui confirmar a cotação atual neste momento.');
    const fu = news.fuelText(summary.fuel);
    parts.push(summary.fuel?.ok ? fu.speech : 'Os preços de combustíveis da ANP não estão acessíveis agora.');
    parts.push(news.storiesSpeech(summary.stories));
    parts.push('Quer que eu aprofunde alguma delas?');
    return say(parts.join(' '), { ui: { panel: 'news', news: summary } });
  },
});

// ======================= MEMÓRIA =======================
function previousUserText(sess) {
  const users = sess.history.filter((h) => h.role === 'user');
  return users.length >= 2 ? users[users.length - 2].content : null;
}

registerCommand({
  name: 'memory.task_list', module: 'MEMÓRIA', priority: 60, description: 'Lista tarefas',
  aliases: ['Quais são minhas tarefas?'],
  patterns: [/\b(minhas tarefas|quais (sao )?(as |minhas )?tarefas|lista de tarefas|tarefas pendentes)\b/],
  action: async () => {
    const tasks = memory.list('tasks').filter((t) => !t.done);
    return say(tasks.length ? `Você tem ${tasks.length} tarefa${tasks.length > 1 ? 's' : ''}: ${tasks.map((t, i) => `${i + 1}) ${t.text}`).join('; ')}.` : 'Nenhuma tarefa pendente.');
  },
});

registerCommand({
  name: 'memory.task_add', mutates: true, module: 'MEMÓRIA', priority: 60, description: 'Adiciona tarefa',
  aliases: ['Adicione a tarefa trocar o óleo'],
  patterns: [/\b(adicion\w+|cri\w+|anot\w+|coloc\w+|nova) (uma |a |na lista )?tarefas?:?\s+(?:de |para |pra )?(.+)$/],
  params: (t, m, s) => ({ text: (s.lastRaw.match(/tarefas?:?\s+(?:de |para |pra )?(.+)$/i) || [])[1] || m[3] }),
  action: async ({ text }) => {
    const sens = memory.detectSensitive(text);
    if (sens) return say(`Isso parece conter ${sens}. Por segurança, não vou salvar.`);
    memory.add('tasks', text);
    return say(`Tarefa anotada: ${text}.`);
  },
});

registerCommand({
  name: 'memory.task_done', mutates: true, module: 'MEMÓRIA', priority: 60, description: 'Conclui tarefa',
  aliases: ['Conclui a tarefa 1'],
  patterns: [/\b(conclu\w+|termin\w+|marc\w+ como feita|finaliz\w+) (a )?tarefa (\w+)/],
  params: (t, m) => ({ n: parseOrdinal(m[3]) }),
  action: async ({ n }) => {
    const tasks = memory.list('tasks').filter((t) => !t.done);
    const task = tasks[(n || 1) - 1];
    if (!task) return say('Não encontrei essa tarefa.');
    memory.updateItem(task.id, { done: true });
    return say(`Tarefa concluída: ${task.text}.`);
  },
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
      ctx.sess.pending = { name: 'memory.remember', params: { text, kind }, question: `Isso parece conter ${sens}. Guardar dados sensíveis não é recomendado. Quer mesmo que eu salve?` };
      return say(ctx.sess.pending.question, { awaitingConfirmation: true });
    }
    memory.add(kind, text.replace(/[.!]+$/, ''));
    return say(`Certo, vou lembrar: ${text.replace(/[.!]+$/, '')}.`);
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
    else {
      const all = [...memory.list('facts'), ...memory.list('preferences'), ...memory.list('tasks')].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      target = all[0];
    }
    return { target };
  },
  confirmText: ({ target }) => (target ? `Tem certeza que deseja apagar esta memória: "${target.text}"?` : null),
  action: async ({ target }) => {
    if (!target) return say('Não encontrei nenhuma memória correspondente.');
    memory.remove(target.id);
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
    if (!items.length) return say(q ? 'Não tenho nada guardado sobre isso.' : 'Ainda não tenho memórias guardadas. Diga "lembre que..." para eu guardar algo.');
    return say(`Lembro disso: ${items.map((i) => i.text).join('; ')}.`);
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
  name: 'engine.calc', module: 'MOTOR', priority: 53, description: 'Cálculos automotivos (potência, torque, cilindrada, consumo)',
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

export const YES = /^(sim|pode|pode sim|confirmo|confirma|confirmar|claro|isso|tenho|tenho certeza|com certeza|ok|positivo|manda|manda ver|faz isso|pode fazer|afirmativo|s)$/;
export const NO = /^(nao|cancela|cancelar|negativo|deixa|deixa pra la|esquece|nao precisa|n|melhor nao)$/;

export function findCommand(name) { return registry.find((c) => c.name === name); }
