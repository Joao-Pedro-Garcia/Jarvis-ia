// CATEGORIAS DE ASSUNTO (Bíblia, Tarefas, Memória, Cálculos, Desabafo…).
// Usadas para classificar as mensagens das conversas (server/core/chats.js).

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

/** Frases com dado sensível: nunca são gravadas nas conversas. */
export const SENSITIVE_IN = /\b(senha|cpf|cartao|cartão|cvv|token|pin)\b|\b(?:\d[ .-]?){11,16}\b/i;
