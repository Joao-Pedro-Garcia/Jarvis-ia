// CONVERSAS POR CATEGORIA — guarda o diálogo em data/conversations.json, separado
// por assunto (Bíblia, Tarefas, Memória, Cálculos, Desabafo…), para que uma
// conversa não se misture com as outras. Dados sensíveis nunca são gravados.
import { load, save } from './store.js';

const FILE = 'conversations';
const MAX_PER_CATEGORY = 300;

export const CATEGORIES = {
  conversa: 'Conversa',
  desabafo: 'Desabafo',
  biblia: 'Bíblia',
  tarefas: 'Tarefas e lembretes',
  memoria: 'Memória',
  calculos: 'Cálculos (motor e física)',
  noticias: 'Notícias, câmbio e combustíveis',
  rotina: 'Rotina e revisão',
  casa: 'Casa',
  sistema: 'Sistema e status',
};

/** Escolhe a categoria de uma resposta do cérebro. */
export function categoryOf(result = {}) {
  const i = String(result.intent || '');
  const m = String(result.module || '').toUpperCase();
  if (result.tone === 'desabafo' && i.startsWith('conversation')) return 'desabafo';
  if (m === 'BÍBLIA' || i.startsWith('bible.')) return 'biblia';
  if (m === 'TAREFAS' || i.startsWith('task.')) return 'tarefas';
  if (m === 'MEMÓRIA' || i.startsWith('memory.')) return 'memoria';
  if (m === 'MOTOR' || m === 'ENGENHARIA' || i.startsWith('engine') || i.startsWith('engineering') || i.startsWith('physics') || i.startsWith('calc.')) return 'calculos';
  if (m === 'NOTÍCIAS' || i.startsWith('news.')) return 'noticias';
  if (m === 'ROTINA' || i.startsWith('routine.')) return 'rotina';
  if (m === 'CASA' || i.startsWith('house.')) return 'casa';
  if (i.startsWith('conversation')) return 'conversa';
  return 'sistema';
}

const SENSITIVE_IN = /\b(senha|cpf|cartao|cvv|token|pin)\b|\b(?:\d[ .-]?){11,16}\b/i;

function data() { return load(FILE, { categories: {} }); }

/** Grava a pergunta e a resposta na categoria certa. Nunca lança erro. */
export function record(userText, result = {}) {
  try {
    if (!userText) return null;
    const cat = categoryOf(result);
    const d = data();
    const list = d.categories[cat] || (d.categories[cat] = []);
    const at = new Date().toISOString();
    const sensitive = !!result.sensitive || SENSITIVE_IN.test(userText);
    const reply = result.sensitive ? '[informação protegida — não registrada]' : String(result.text || '').slice(0, 4000);
    list.push({ at, role: 'user', text: sensitive ? '[mensagem com dado sensível — não registrada]' : String(userText).slice(0, 2000) });
    if (reply) list.push({ at, role: 'jarvis', text: reply, intent: result.intent || null });
    if (list.length > MAX_PER_CATEGORY) list.splice(0, list.length - MAX_PER_CATEGORY);
    save(FILE, d);
    return cat;
  } catch { return null; }
}

/** Lista de categorias com quantidade e última atividade. */
export function listCategories() {
  const d = data();
  return Object.entries(CATEGORIES).map(([id, label]) => {
    const items = d.categories[id] || [];
    return { id, label, count: items.length, last: items.length ? items[items.length - 1].at : null };
  }).filter((c) => c.count > 0);
}

export function getCategory(id, limit = 200) {
  const items = data().categories[id] || [];
  return items.slice(-limit);
}

/** Apaga uma categoria inteira (a interface pede confirmação antes). */
export function clearCategory(id) {
  const d = data();
  const n = (d.categories[id] || []).length;
  delete d.categories[id];
  save(FILE, d);
  return n;
}
