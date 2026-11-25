// IA DO NAVEGADOR (2ª opção gratuita): usa o modelo embutido do próprio
// navegador quando ele existe (Chrome: Prompt API / "LanguageModel", Gemini
// Nano rodando no aparelho, sem custo e sem chave). É experimental e NÃO existe
// na maioria dos navegadores/celulares: quando não existe, o JARVIS diz isso e
// segue no modo local. Nada aqui é simulado.
import { clientLog } from '../core/logger.js';

const API = () => globalThis.LanguageModel || null;
let session = null;
let state = { checked: false, availability: 'unavailable', reason: 'Ainda não verificado.' };

/** available | downloadable | downloading | unavailable */
export async function checkBrowserAI() {
  const LM = API();
  if (!LM?.availability) {
    state = { checked: true, availability: 'unavailable', reason: 'Este navegador não tem IA embutida (Prompt API). Disponível apenas em versões recentes do Chrome para computador, com o recurso ativado.' };
    return state;
  }
  try {
    const a = await LM.availability({ expectedInputs: [{ type: 'text', languages: ['pt'] }], expectedOutputs: [{ type: 'text', languages: ['pt'] }] }).catch(() => LM.availability());
    state = { checked: true, availability: a, reason: a === 'available' ? 'IA do navegador pronta (roda no aparelho).' : a === 'unavailable' ? 'O navegador informou que a IA embutida não está disponível neste aparelho.' : 'O modelo do navegador ainda precisa ser baixado (o navegador faz isso sozinho).' };
  } catch (err) {
    state = { checked: true, availability: 'unavailable', reason: `Falha ao consultar a IA do navegador: ${err.message}` };
  }
  return state;
}

export const browserAIState = () => state;

/** Pergunta à IA do navegador. Lança erro se não houver. */
export async function askBrowserAI(text, { system } = {}) {
  if (state.availability !== 'available') throw new Error('IA do navegador indisponível');
  if (!session) {
    session = await API().create({
      initialPrompts: [{ role: 'system', content: system || 'Você é o JARVIS, assistente pessoal. Responda em português do Brasil, de forma natural, curta e honesta. Se não souber, diga que não sabe. Nunca invente notícias, cotações ou preços.' }],
    });
  }
  const t0 = performance.now();
  const out = await session.prompt(text);
  clientLog('cerebro', `IA do navegador respondeu em ${Math.round(performance.now() - t0)} ms`);
  return String(out || '').trim();
}
