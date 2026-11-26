// Memória automática (Groq simulado): aprende fatos duradouros, sem dados sensíveis e sem duplicar.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv } from './helpers/setup.js';

setupTestEnv('auto-memory');
const realFetch = globalThis.fetch;
let reply = '{"fatos":[]}';
let asked = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('api.groq.com/openai/v1/chat/completions')) {
    const body = JSON.parse(opts.body);
    asked.push(body);
    // conversa normal vs. extração da memória (sistema próprio)
    const content = /extrai, de UMA mensagem/.test(body.messages[0]?.content || '') ? reply : 'Entendi!';
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { headers: { 'content-type': 'application/json' } });
  }
  throw new TypeError('fetch failed');
};
const llm = await import('../server/brain/llm.js');
const mem = await import('../server/modules/memory/memory.js');
const auto = await import('../server/brain/auto-memory.js');
const { save } = await import('../server/core/store.js');
const { encrypt } = await import('../server/core/secrets.js');
const { updateSettings } = await import('../server/core/settings.js');
const { bus } = await import('../server/core/events.js');

before(async () => {
  save('ai-online', { groq: { key: encrypt('gsk_teste1234567890abcdefghijKLMN'), model: 'llama-3.1-8b-instant' } });
  await llm.refresh({ force: true });
});
after(() => { globalThis.fetch = realFetch; });
afterEach(() => { reply = '{"fatos":[]}'; asked = []; updateSettings({ privacy: { autoMemory: true } }); });

test('aprende fatos sobre o usuário, avisa a tela e marca como "aprendido"', async () => {
  reply = 'Claro: {"fatos":[{"tipo":"fato","texto":"O usuário trabalha como frentista."},{"tipo":"preferencia","texto":"O usuário torce para o Flamengo."}]}';
  const events = [];
  const fn = (e) => { if (e.type === 'MEMORY_LEARNED') events.push(e.payload); };
  bus.on('*', fn);
  const saved = await auto.learnFrom('Eu trabalho num posto de gasolina e sou flamenguista');
  bus.off('*', fn);
  assert.deepEqual(saved, ['O usuário trabalha como frentista.', 'O usuário torce para o Flamengo.']);
  const all = mem.list();
  assert.ok(all.facts.some((f) => f.text === 'O usuário trabalha como frentista.' && f.source === 'auto'));
  assert.ok(all.preferences.some((f) => f.text === 'O usuário torce para o Flamengo.'));
  assert.deepEqual(events[0].items, saved);
});

test('não duplica o que já sabe (e manda o que já sabe para a IA)', async () => {
  reply = '{"fatos":[{"tipo":"fato","texto":"O usuário trabalha como frentista."}]}';
  const saved = await auto.learnFrom('Como eu te disse, eu trabalho de frentista');
  assert.deepEqual(saved, []);
  assert.match(asked[0].messages.at(-1).content, /Já sei:[\s\S]*frentista/);
});

test('dado sensível: a frase nem vai para a IA; fato sensível devolvido pela IA é descartado', async () => {
  assert.deepEqual(await auto.learnFrom('Eu uso a senha 123456 no banco'), []);
  assert.equal(asked.length, 0);
  reply = '{"fatos":[{"tipo":"fato","texto":"O usuário tem o CPF 123.456.789-09."}]}';
  assert.deepEqual(await auto.learnFrom('Eu fui ao cartório resolver documentos hoje'), []);
});

test('frases que não falam do usuário e IA desligada pelo usuário: não pergunta nada à IA', async () => {
  assert.deepEqual(await auto.learnFrom('qual a capital da França?'), []);
  updateSettings({ privacy: { autoMemory: false } });
  assert.deepEqual(await auto.learnFrom('Eu moro em Araguaína com minha esposa Ana'), []);
  assert.equal(asked.length, 0);
});

test('resposta da IA fora do formato não quebra nada', () => {
  assert.deepEqual(auto.parseFacts('não sei'), []);
  assert.deepEqual(auto.parseFacts('{"fatos": "x"}'), []);
  assert.deepEqual(auto.parseFacts('{"fatos":[{"tipo":"fato","texto":"curto"}]}'), [], 'fato curto demais');
});

test('na conversa: responde normalmente e aprende em segundo plano', async () => {
  reply = '{"fatos":[{"tipo":"fato","texto":"O aniversário da mãe do usuário é em 12 de março."}]}';
  const { processInput } = await import('../server/brain/brain.js');
  const r = await processInput('O aniversário da minha mãe é dia 12 de março, ela adora flores', { sessionId: 'am-1' });
  assert.equal(r.text, 'Entendi!');
  for (let i = 0; i < 50 && !mem.list().facts.some((f) => /12 de março/.test(f.text)); i++) await new Promise((res) => setTimeout(res, 20));
  assert.ok(mem.list().facts.some((f) => /12 de março/.test(f.text)), 'aprendeu depois de responder');
});
