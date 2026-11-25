// Carrega e ajusta a personalidade (config/personality.json + data/personality.json).
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR } from '../core/paths.js';
import { load, save } from '../core/store.js';

const base = () => JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'personality.json'), 'utf8'));

export function getPersonality() {
  const b = base();
  const o = load('personality', {});
  return { ...b, ...o, modos: { ...b.modos, ...(o.modos || {}) } };
}

const EDITABLE = ['nome', 'tom', 'nivel_humor', 'formalidade', 'velocidade_fala', 'idioma', 'nivel_detalhamento', 'nome_usuario', 'tratamento'];
export function updatePersonality(patch) {
  const cur = load('personality', {});
  for (const k of EDITABLE) if (k in (patch || {})) cur[k] = patch[k];
  save('personality', cur);
  return getPersonality();
}

export function systemPrompt(p, { tone, domain, memory, context, now }) {
  const humor = p.nivel_humor >= 0.66 ? 'alto' : p.nivel_humor >= 0.33 ? 'moderado' : 'baixo';
  const formal = p.formalidade >= 0.66 ? 'formal' : p.formalidade >= 0.33 ? 'semi-informal' : 'informal';
  const detail = { baixo: 'respostas bem curtas', medio: 'respostas curtas por padrão, detalhando quando pedirem', alto: 'respostas completas e detalhadas' }[p.nivel_detalhamento] || 'respostas curtas';
  return [
    `Você é ${p.nome}, a IA pessoal do usuário${p.nome_usuario ? ` (${p.nome_usuario})` : ''}. Identidade própria: ${p.tom}.`,
    `Idioma: ${p.idioma}. Formalidade: ${formal}. Humor: ${humor}. Detalhamento: ${detail}. Trate o usuário por "${p.tratamento}".`,
    'Suas respostas são exibidas na tela E faladas em voz alta: evite markdown pesado, tabelas e URLs; prefira frases naturais. Para contas, mostre o raciocínio de forma compacta.',
    `Regras: ${p.regras.join(' ')}`,
    `Modo de conversa detectado agora: ${tone.mode}. ${p.modos[tone.mode] || p.modos.conversa}`,
    'Se o modo detectado parecer errado pelo contexto, adapte-se ao que o usuário realmente quer.',
    domain === 'engenharia' ? `Módulo ENGENHARIA ativo. ${p.modos.tecnico} Faça cálculos corretamente, verifique unidades e ordens de grandeza.` : '',
    domain === 'motor' ? `Módulo MOTOR ativo. ${p.modos.tecnico} Explique causas prováveis em ordem de probabilidade e testes simples. Diagnóstico remoto NUNCA é certeza; quando houver risco (freios, direção, superaquecimento, vazamento de combustível, fumaça) recomende inspeção física profissional.` : '',
    'Você NÃO executa ações por conta própria nesta conversa: comandos (Bíblia, notícias, memória, casa) são tratados por módulos próprios. Se o usuário pedir algo que exige um módulo indisponível, diga isso com honestidade.',
    `Data/hora atual: ${now}.`,
    context ? `Contexto atual da interface: ${context}` : '',
    memory ? `Memórias que o usuário autorizou (use só quando relevante):\n${memory}` : '',
  ].filter(Boolean).join('\n');
}
