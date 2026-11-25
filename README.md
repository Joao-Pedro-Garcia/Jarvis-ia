# JARVIS — Assistente Pessoal Inteligente (v2)

Assistente pessoal com voz, audição, **ativação por duas palmas**, interface futurista,
memória, tarefas e lembretes, **leitura da Bíblia com continuidade**, notícias, câmbio e
combustíveis, módulos de engenharia e motores, e base para casa inteligente.

- **Servidor:** Node.js 18+ puro. Única dependência: `@anthropic-ai/sdk`.
- **Interface:** HTML/CSS/JS sem etapa de build. **PWA instalável** no Android e no PC.
- **Dados:** JSON locais em `data/` (não versionados). Nada vai para a nuvem, exceto o que
  você envia à IA (se configurada) e o reconhecimento de fala do navegador.

> Auditoria da v1 e o que mudou: [`docs/AUDITORIA.md`](docs/AUDITORIA.md).
> **Continuando o desenvolvimento (nova conta/novo desenvolvedor)?** Comece por
> [`CONTINUE_JARVIS.md`](CONTINUE_JARVIS.md) e [`HANDOFF_JARVIS.md`](HANDOFF_JARVIS.md).

---

## 0. Requisitos
- **Node.js ≥ 18.17** (desenvolvido e testado em v22.23.5) e **npm** (10.9.9). Sem yarn/pnpm.
- Navegador: **Chrome/Edge** no PC ou **Chrome no Android** (reconhecimento de fala). Firefox funciona só por texto.
- Para os testes E2E e para regerar ícones: **Playwright + Chromium** (`npm i -D playwright && npx playwright install chromium`).
- Opcional: chave de uma IA (seção 3), Home Assistant, `openssl` para HTTPS.

## 1. Instalação e execução

```bash
npm install
cp .env.example .env        # opcional — veja a seção 3
npm run bible:download      # opcional — baixa a Bíblia agora (senão baixa no 1º uso)
npm start                   # http://127.0.0.1:3000
```

Abra no **Chrome**, **Edge** ou no **Chrome do Android** e toque em **TOQUE PARA INICIAR**
(os navegadores exigem um toque para liberar áudio e microfone). A tela mostra
“Cérebro online… Ouvido online… Voz online… Memória online… JARVIS pronto.” com o
estado **real** de cada parte.

## 2. Microfone, HTTPS e Android

**Regra do navegador:** o microfone só funciona em **HTTPS** ou em `localhost`.

| Onde roda o servidor | Como abrir no Android | HTTPS? |
|---|---|---|
| **No próprio celular (Termux)** — recomendado | `http://localhost:3000` | Não precisa (localhost) |
| No PC, celular na mesma Wi‑Fi | `https://IP-DO-PC:3000` | **Sim** (certificado) |

### Opção A — tudo no celular (Termux) · não depende do PC
1. Instale o **Termux** (F-Droid) e rode: `pkg install nodejs git`.
2. `git clone <este repositório> && cd Jarvis-ia && npm install && npm start`.
3. No Chrome do celular abra `http://localhost:3000` → **⋮ → Instalar app / Adicionar à tela inicial**.

### Opção B — servidor no PC
```bash
mkdir certs && openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout certs/key.pem -out certs/cert.pem -subj "/CN=jarvis.local"
```
No `.env`: `HOST=0.0.0.0`, `HTTPS_KEY=./certs/key.pem`, `HTTPS_CERT=./certs/cert.pem` e
**`JARVIS_ACCESS_TOKEN=uma-senha-longa`**. No celular abra `https://IP-DO-PC:3000`, aceite o
aviso do certificado, digite o token e instale o app pelo menu do Chrome.

### Conferir se está tudo certo
Diga **“faça um diagnóstico”** ou toque em **Diagnóstico** (tecla D no PC). A tela mostra
HTTPS, permissão, microfone, reconhecimento e notificações com 🟢/🟡/🔴, e o botão
**Testar microfone** grava 3 s de áudio de verdade e diz se captou som.

## 3. IA online (conversa livre)

Configure no `.env` (a chave fica **só no servidor**):

```ini
AI_PROVIDER=anthropic          # anthropic | openai | ollama | none
AI_API_KEY=sua-chave
AI_MODEL=                      # vazio = padrão do provedor (anthropic → claude-opus-5-5)
```
- `openai` aceita qualquer API compatível com *Chat Completions* (ajuste `AI_BASE_URL`).
- `ollama` usa um modelo local no seu PC, sem chave (`AI_MODEL=llama3.2`).
- A versão 1 (`ANTHROPIC_API_KEY`) continua funcionando.

O status aparece em **Configurações → IA ONLINE** e no diagnóstico (provedor e modelo, nunca a chave).
**Sem IA**, o JARVIS diz claramente que a IA externa não está configurada e continua fazendo
tudo que é local: comandos, Bíblia, memória, tarefas, contas, conversões, rotina e configurações.
Para provedores novos, crie um arquivo em `server/brain/ai/` com `complete()` e registre em `llm.js`.

## 4. O que funciona offline e online

| Sem internet (servidor acessível) | Precisa de internet |
|---|---|
| Interface, Bíblia já baixada, memória, tarefas e lembretes, contas, conversões, cálculos de motor, rotina, configurações, voz | IA externa (exceto Ollama local), notícias, câmbio, combustíveis, reconhecimento de fala do Chrome, Home Assistant fora da rede |

Se a internet cair aparece **“📡 MODO OFFLINE”**. Se o **servidor** ficar inacessível aparece
**“SERVIDOR INACESSÍVEL”** e o navegador ainda responde hora, data, contas e conversões, e mostra a
última página da Bíblia salva (sem registrar progresso).

## 5. Comandos (diga “ajuda”)

| Módulo | Exemplos |
|---|---|
| 📖 Bíblia | “Bíblia”, “continue minha leitura”, “onde parei?”, “passe a página”, “avance”, “volta”, “volta uma”, “próximo capítulo”, “leia” (lê a página em voz alta), “abra João 3”, “próxima leitura” |
| 📰 Notícias | “Notícias”, “me atualiza”, “quanto está o dólar?”, “quanto está a gasolina?”, “notícias do mundo”, “detalhe a segunda notícia” |
| ✅ Tarefas | “me lembra de estudar às 19h”, “me lembra disso amanhã”, “me avisa daqui a 20 minutos…”, “quais são minhas tarefas?”, “concluí essa”, “adia para amanhã às 9h”, “cancela essa tarefa” |
| 🧠 Memória | “lembre que…”, “o que você lembra sobre…”, “esqueça isso” |
| 🗓 Rotina | “meu dia” (atrasadas → hoje → Bíblia → câmbio → próximos) |
| 🔇 Voz | “fique silencioso”, “volte a falar”, “pare”, “pausa”, “continua a falar” |
| 📊 Sistema | “status”, “faça um diagnóstico”, “ajuda”, “modo seguro” |
| 🔧 Engenharia / 🚗 Motor | “15% de 230”, “converter 32 psi em bar”, “12 volts e 4 ohms”, “potência com 300 Nm a 4000 rpm”, “me ajuda com esse motor” (IA) |
| 🏠 Casa | “ligar a luz da sala” (requer Home Assistant; sem ele aparece **NÃO CONFIGURADO**) |

Frases não precisam ser exatas: o JARVIS tolera variações e erros comuns de transcrição
(“notisias”, “gazolina”) e usa o **contexto real da tela**: “avança/volta” só mexem na Bíblia
se o leitor estiver aberto.

Atalhos no PC: **Espaço** falar · **Esc** parar/fechar · **P** pausar fala · **/** digitar ·
**B** Bíblia · **N** Notícias · **M** Memória · **S** Configurações · **D** Diagnóstico.

## 6. Bíblia — continuidade
- Começa em **Gênesis 2**; 3 capítulos por dia: **Gn 2–4 → 5–7 → 8–10 → 11–13…**
- Salva livro, capítulo, versículo (logo, a página), capítulos concluídos e sequência de dias em
  `data/bible-state.json`. Fechou no meio? Volta exatamente na mesma página.
- “Leitura de hoje concluída.” **não inicia o dia seguinte**: a próxima leitura só começa no
  próximo dia ou se você pedir (“próxima leitura”).
- Texto: Almeida Corrigida Fiel (ACF), baixado uma vez para uso pessoal (não redistribuído).

## 7. Notícias, câmbio e combustíveis
- **Câmbio:** AwesomeAPI (cotação comercial, com horário e variação); se falhar, **PTAX do
  Banco Central** (rotulada como PTAX). Cache de 1 min. Sem fonte: “Não consegui confirmar a
  cotação atual neste momento.”
- **Combustíveis:** ANP — Levantamento de Preços. Ordem das fontes: (1) planilha semanal das
  últimas 4 semanas; (2) série mensal, localizada automaticamente na página de dados abertos da
  ANP. Mostra Tocantins e Brasil com **Gasolina comum, Diesel comum e Diesel S‑10 separados**,
  média simples, período e fonte. Pesquisa com mais de 14 dias recebe aviso. Se nada responder:
  **“Não consegui confirmar os preços atuais.”** — a última pesquisa obtida pode aparecer, mas
  **separada e com a data**, nunca como atual. O portal gov.br às vezes recusa acessos automatizados;
  o JARVIS **não tenta contornar** esse bloqueio.
- **Notícias:** RSS de Agência Brasil, g1, Folha, BBC News Brasil e DW (`config/news-sources.json`).
  Só matérias com data e das últimas 36 h, com fonte e horário. Repetidas viram “continua em
  destaque”. Com IA, a seleção/resumo só pode usar matérias reais dos feeds.

## 8. Palmas
**Configurações → PALMAS**: ativar, sensibilidade, intervalo mínimo e máximo, limiar manual
e tempo de espera. Bata **duas palmas**: o JARVIS responde **“Sim?”** e escuta. Duas palmas
enquanto ele fala **interrompem a fala**.

Critérios contra falso positivo: ataque rápido, limiar adaptativo ao ruído, duração curta
(fala e música são sustentadas), alta frequência (porta/mesa são graves), intervalo,
intensidades parecidas, rejeição da 3ª palma (aplauso) e tempo de espera.

**Limitação honesta:** para detecção contínua de palmas com a tela bloqueada, o navegador pode
interromper o microfone em segundo plano. Deixe o JARVIS aberto (ative **Manter tela ligada**,
de preferência com o celular na tomada). A arquitetura já tem `WakeDetector` com
`BrowserWakeDetector` (atual) e `AndroidNativeWakeDetector` (`public/js/modules/wake/`), que só
será usado por um futuro app Android nativo com serviço em primeiro plano — esse app **não existe**
neste projeto.

## 9. Memória, dados sensíveis e notificações
- Painel **Memória**: tarefas/lembretes (concluir, adiar, cancelar, editar), memórias,
  preferências, progresso da Bíblia e a sessão atual (esta não vai para o disco).
- Senhas, CPF, cartões e tokens: pedem confirmação, ficam **criptografados (AES‑256‑GCM)** em
  disco, aparecem mascarados, só são mostrados após nova confirmação, nunca são falados e
  nunca são enviados à IA. A chave fica em `JARVIS_SECRET_KEY` ou `data/.secret.key`: quem tiver o
  disco **e** a chave consegue ler.
- **Notificações:** Configurações → Permitir notificações. Os lembretes avisam com o JARVIS aberto
  (inclusive em segundo plano, se o navegador permitir). **Com o app fechado não há aviso** — isso
  exigiria um servidor de push, que não foi implementado.

## 10. Segurança
Confirmação para ações importantes (apagar memória, cancelar tarefa, desligar dispositivos),
**modo seguro** (confirma tudo e bloqueia a casa), token de acesso opcional, proteção contra
**CSRF** (só JSON e só da mesma origem), limite de requisições, CSP, logs sem o conteúdo das
suas falas. Chaves só no `.env`.

## 11. Comandos personalizados
Crie um arquivo em `server/commands/custom/` — nada mais precisa mudar
(exemplo: `server/commands/custom/moeda.js`, “cara ou coroa”):

```js
export default {
  name: 'custom.clima', description: 'Previsão do tempo', aliases: ['Vai chover hoje?'],
  patterns: [/\bvai chover\b/],          // texto já normalizado (minúsculo, sem acentos)
  permission: 'safe',                    // 'safe' | 'confirm' | 'restricted'
  action: async (params, ctx) => ({ text: 'Resposta na tela', speech: 'Resposta falada', data: {} }),
};
```
O orquestrador transforma o retorno em resultado estruturado
`{ success, intent, module, data, message, source, timestamp }`.

## 12. Testes

```bash
npm test        # 194 testes automatizados (sem internet)
npm run e2e     # teste final no navegador (requer Playwright + Chromium) — 27 etapas
```

| Tipo | Cobertura |
|---|---|
| Unitários/integração (`tests/*.test.js`) | intenções (~150 frases), orquestrador, Bíblia, memória, dados sensíveis, tarefas/datas/agendador, contas/conversões, parsing de APIs (amostra real da AwesomeAPI), fallbacks, rede lenta/fora/erro/JSON inválido, provedores de IA (simulados), segurança HTTP real (token, CSRF, path traversal), palmas (sinais sintéticos) |
| E2E (`tests/e2e/run-e2e.js`) | Chromium real; **palmas por áudio real** (WAV no microfone falso); teste de microfone com `getUserMedia`; modo offline; reinício do servidor; persistência; layout Pixel 7; PWA (manifest, ícones, service worker) |
| **Simulado** | reconhecimento de fala e síntese de voz no E2E (frases roteirizadas/fala interceptada); APIs de IA e fontes de dados nos testes unitários |
| **Não testado** | aparelho Android físico, instalação real do PWA, microfone físico, vozes reais, notificação do sistema (o Chromium sem tela nega a permissão), IA com chave real, fontes externas reais (bloqueadas neste ambiente de desenvolvimento) |

## 13. Estrutura
```
server/
  index.js              HTTP + API + SSE + estáticos (+ /shared)
  brain/                brain.js (entrada), orchestrator.js (pipeline), commands.js (registro),
                        tone.js (7 tons + emergência), personality.js, llm.js + ai/ (provedores)
  commands/             loader.js + custom/ (comandos personalizados)
  core/                 eventos, logs, store, settings, http/cache, health, selftest, secrets, when (datas)
  modules/              bible, news, memory, tasks, house, engineering, engine
shared/                 math.js, units.js (usados pelo servidor e pelo navegador offline)
public/js/              core/ (bus, api, estado, offline-brain), modules/ (ouvido, voz, palmas, device, wake/),
                        ui/ (núcleo, Bíblia, notícias, painéis, diagnóstico)
config/                 personality.json (tons), news-sources.json
```

## 14. Desenvolvimento
```bash
npm run dev            # reinicia o servidor ao salvar (node --watch)
npm test               # testes rápidos (sem internet)
npm run test:all       # testes + E2E
npm run backup         # copia data/ para backups/ (sem a chave secreta; --with-key para incluir)
npm run icons          # regenera os ícones PNG do PWA
```
Não há build: edite `public/` e recarregue o navegador (o service worker usa rede primeiro).
Ao mudar arquivos de `public/` em produção, aumente `VERSION` em `public/sw.js` para o aviso de atualização aparecer.

## 15. Solução de problemas
| Sintoma | Causa provável | Solução |
|---|---|---|
| Microfone não liga / OUVIDO 🔴 | Sem HTTPS, permissão negada ou navegador sem Web Speech | Use `localhost` ou HTTPS; libere o microfone no cadeado da barra de endereço; use Chrome/Edge |
| "Reconhecimento precisa de internet" | Chrome processa a fala online | Conecte à internet ou digite |
| Palmas não disparam | Detector desligado, app em 2º plano ou limiar alto | Ative em Configurações; mantenha o app aberto; ajuste sensibilidade/limiar olhando o medidor |
| Palmas disparam sozinhas | Ambiente barulhento | Baixe a sensibilidade ou suba o limiar manual |
| "IA não configurada" | `.env` sem `AI_PROVIDER`/`AI_API_KEY` | Configure (seção 3) e reinicie |
| "Não consegui confirmar a cotação/os preços atuais" | Fonte fora do ar ou bloqueando acesso | Normal; tente mais tarde (nada é inventado) |
| Bíblia não carrega no 1º uso | Sem internet para baixar o texto | `npm run bible:download` com internet |
| Pede token toda hora | `JARVIS_ACCESS_TOKEN` definido e token errado | Digite o token do `.env` |
| Interface antiga após atualizar | Cache do service worker | Toque em "Atualizar" no aviso, ou recarregue com Ctrl+Shift+R |
| Memórias protegidas ilegíveis | `data/.secret.key` perdida ou trocada | Restaure a chave original do backup |

## 16. Estado atual
v2.0.0 estável: **194/194** testes e **27/27** etapas E2E. Não testado em Android físico, com IA real nem com as
fontes externas ao vivo. Detalhes em [`JARVIS_STATE.md`](JARVIS_STATE.md).

## 17. Continuação do desenvolvimento
Leia, nesta ordem: `CONTINUE_JARVIS.md` → `HANDOFF_JARVIS.md` → `JARVIS_STATE.md` → `PROJECT_INVENTORY.md` →
`DECISIONS_JARVIS.md` → `TRANSFER_CHECKLIST.md`. Todo o trabalho está no branch `ccr-8d48bdce-skxdvi`.

## 18. Limitações conhecidas
- Reconhecimento de fala: Chrome/Edge/Android (online). Firefox não tem; Safari iOS é parcial. Use texto.
- No Android, palmas e reconhecimento disputam o microfone: as palmas pausam enquanto ele ouve; a
  interrupção por “pare” fica desligada se as palmas estiverem ativas (use duas palmas para interromper).
- Palmas/lembretes com o app fechado ou a tela bloqueada não são garantidos (limite do navegador).
- Média de combustíveis calculada pelo JARVIS pode diferir levemente da síntese oficial da ANP.
- Casa: apenas Home Assistant.
