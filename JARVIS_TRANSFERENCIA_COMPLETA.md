# ⚠️ MENSAGEM PARA O CLAUDE DA NOVA CONTA — LEIA TUDO ANTES DE AGIR

Você está assumindo o desenvolvimento de um projeto **JARVIS** que JÁ EXISTE e está estável
(v2.0.0, 194/194 testes automáticos, 27/27 etapas de teste no navegador).
**NÃO comece do zero. NÃO reescreva. NÃO refatore. NÃO remova nada.**
Este texto contém TUDO o que a conta anterior sabia: projeto, estado, arquitetura, decisões,
regras do usuário, dados, testes, problemas conhecidos e próximos passos.

## O QUE FAZER AGORA (nesta ordem)
1. Obter o código (ele NÃO está neste texto; está no GitHub):
   - Repositório: `joao-pedro-garcia/jarvis-ia`
   - **Branch com todo o trabalho: `ccr-8d48bdce-skxdvi`** (o `main` só tem o commit inicial; não há PR)
   - `git fetch origin ccr-8d48bdce-skxdvi && git checkout ccr-8d48bdce-skxdvi`
   - Se o repositório não estiver acessível, o usuário tem o arquivo `jarvis-ia-completo.bundle`:
     `git clone -b ccr-8d48bdce-skxdvi jarvis-ia-completo.bundle jarvis-ia`
2. Verificar: `git status` (limpo) e `git log --oneline | head -3`
   (esperado no topo: "JARVIS - checkpoint completo antes da transferência" ou um commit posterior
   "Adiciona arquivo único de transferência").
3. `npm install` → `npm test` (esperado: **194 testes, 194 aprovados, 0 falhas**).
4. `npm start` → abrir `http://127.0.0.1:3000` → "TOQUE PARA INICIAR".
5. Confirmar que tudo bate com a seção "ESTADO ATUAL". Só então modificar código.
6. Perguntar ao usuário se ele tem um backup da pasta `data/` (progresso real da Bíblia, memórias,
   tarefas) e do `.env` para restaurar — veja "DADOS LOCAIS".
7. Responder sempre em **português do Brasil**.

## REGRAS DO USUÁRIO (valem sempre)
- Funcionalidade real > efeito visual. Nada de mockup ou demonstração falsa.
- NUNCA inventar dados, APIs, preços, notícias, cotações, dispositivos ou testes.
- NUNCA dizer que testou algo que não testou. Diferenciar TESTE REAL de SIMULADO.
- Priorizar soluções **gratuitas**; não introduzir serviço pago.
- Não remover testes para fazer a suíte passar. Não aceitar regressões: rodar os testes antes e depois.
- Não mudar a identidade visual (HUD futurista ciano) sem pedido.
- Confirmar ações destrutivas. Chaves de API só no `.env` do servidor, nunca no frontend.
- Não contornar mecanismos de segurança (Android, navegador, bloqueio anti-robô de sites).
- Explicar limitações com honestidade, sem escondê-las.
- Ao terminar trabalhos grandes, apresentar relatório: implementado, corrigido, testes (reais vs simulados),
  dependências, limitações, como executar, próximos passos.
- Git: commitar e dar push no branch `ccr-8d48bdce-skxdvi` (a menos que a nova conta use outro branch
  indicado pelo ambiente). Não abrir PR sem o usuário pedir.

---

# PARTE 1 — GUIA DE CONTINUAÇÃO

## 1. Onde o projeto está
- Repositório GitHub: `joao-pedro-garcia/jarvis-ia`
- **Branch com todo o trabalho: `ccr-8d48bdce-skxdvi`** (o `main` contém apenas o commit inicial;
  nada foi mesclado nem há pull request). Use: `git fetch origin ccr-8d48bdce-skxdvi && git checkout ccr-8d48bdce-skxdvi`.
- Código 100% versionado. Ficam **fora do Git** (por segurança/tamanho): `.env`, `data/`, `certs/`,
  `node_modules/`, `tests/e2e/screenshots/`. Veja a seção "Dados locais" em `HANDOFF_JARVIS.md`.

## 2. Como executar
```bash
npm install
cp .env.example .env    # opcional; sem ele roda no modo local (sem IA)
npm start               # http://127.0.0.1:3000 → "TOQUE PARA INICIAR"
```
Não existe etapa de build (HTML/CSS/JS servidos direto pelo Node).

## 3. Como testar
```bash
npm test                              # 194 testes (node:test), não precisam de internet
npm run e2e                           # 27 etapas no Chromium; exige Playwright instalado
```
Se o Playwright estiver instalado globalmente (como no ambiente original):
`NODE_PATH=$(npm root -g) node tests/e2e/run-e2e.js`.

## 4. Estado atual (resumo — detalhes em JARVIS_STATE.md)
Versão **2.0.0**. Fase 1 (construção) e Fase 2 (auditoria, robustez, Android/PWA) concluídas.
Todos os testes passam. Nada foi testado em Android físico, com IA real ou com as fontes externas
ao vivo (a rede do ambiente original bloqueava esses sites).

## 5. Problemas conhecidos
Lista completa em `JARVIS_STATE.md → ERROS CONHECIDOS`. Nenhum impede o uso.

## 6. Próximo trabalho recomendado
1. Testar em um Android físico (Termux ou servidor no PC com HTTPS) e calibrar as palmas.
2. Configurar uma IA real (`AI_PROVIDER`/`AI_API_KEY`) e validar conversa e resumo de notícias.
3. Validar notícias, câmbio e combustíveis com a internet real do usuário.
4. Só depois: melhorias (ver "Futuro" abaixo).

## 7. Funcionalidades concluídas
Cérebro/orquestrador, comandos em linguagem natural, 7 tons, IA multi-provedor, modo local,
ouvido (Web Speech), voz (síntese, pausar, parar, silêncio), duas palmas, Bíblia com plano diário
e continuidade, notícias/câmbio/combustíveis com fallbacks, memória (com criptografia de dados
sensíveis), tarefas e lembretes com data/hora, notificações, "meu dia", status, ajuda,
diagnóstico com semáforo e auto-diagnóstico, casa (Home Assistant), engenharia e motor
(cálculos locais), segurança (CSRF, token, modo seguro), PWA instalável, modo offline.

## 8. Funcionalidades em andamento
Nenhuma. O trabalho parou num ponto estável (todos os testes passando, tudo commitado).

## 9. Funcionalidades futuras (NÃO implementadas)
- App Android nativo com serviço em primeiro plano (palmas com tela bloqueada) — existe apenas
  a ponte `AndroidNativeWakeDetector`, inativa sem o app.
- Notificações com o app fechado (exigiria Web Push com servidor).
- Integrações de casa além do Home Assistant.

## Regras do usuário que continuam valendo
Funcionalidade real > efeito visual · nunca inventar dados, APIs ou testes · nunca dizer que testou o
que não testou · priorizar soluções **gratuitas** · não remover testes · não mudar a identidade visual
sem pedido · pedir confirmação para ações destrutivas · chaves só no `.env` do servidor.

---

# PARTE 2 — ESTADO ATUAL

Registrado no fechamento da conta anterior (25/11/2026), branch `ccr-8d48bdce-skxdvi`.
Último commit de código antes da transferência: `d37f931` (os documentos de transferência vêm no
commit seguinte, "JARVIS - checkpoint completo antes da transferência").

## STATUS GERAL
**Estável · v2.0.0 · 194/194 testes automáticos · 27/27 etapas E2E · árvore Git limpa.**
Funciona no PC e em navegadores Android (emulado). Sem IA configurada roda no modo local.

## FUNCIONANDO (implementado e coberto por teste automatizado)
| Área | O que funciona |
|---|---|
| Cérebro | Normalização, tolerância a erros de transcrição, ~150 frases reconhecidas, contexto real da tela, confirmação, modo seguro, resultado estruturado |
| Tons | sério, normal, resenha, técnico, estudo, desabafo, urgente (resposta local de emergência 192/193/190) |
| IA | Camada de provedores (anthropic, openai-compatível, ollama, none) — testada com respostas **simuladas** |
| Bíblia | Plano Gn 2–4 → 5–7 → 8–10…, páginas, capítulos, continuidade, sequência, leitura livre, "onde parei?" (livro/cap./versículo/página), "leia" |
| Memória | Adicionar/consultar/editar/apagar, "esqueça isso" pela referência, dados sensíveis criptografados |
| Tarefas | Datas em português, lembretes, concluir/adiar/cancelar/editar, agendador, "meu dia" |
| Voz (UI) | Falar, parar, pausar/continuar, modo silencioso, interrupção por "pare" e por duas palmas |
| Palmas | Detector com 8 critérios; ativação por áudio real no E2E |
| Notícias/câmbio/combustíveis | Parsing, cache, fallbacks e mensagens de indisponibilidade (fontes **simuladas** nos testes) |
| Segurança | CSRF, token, path traversal, confirmação para apagar/revelar, cabeçalhos |
| Diagnóstico | Semáforo de 12 componentes, teste real de microfone, auto-diagnóstico |
| PWA/Offline | Manifest, ícones PNG, service worker, banner offline, respostas locais com servidor fora |

## LIMITADO (funciona com restrições conhecidas)
- Reconhecimento de fala: só Chrome/Edge/Android, precisa de internet; Firefox não tem.
- Palmas/lembretes: exigem o JARVIS aberto; com tela bloqueada o navegador pode cortar o microfone.
- No Android, palmas e reconhecimento disputam o microfone; "pare" por voz fica desligado se as palmas estiverem ativas.
- Combustíveis: o gov.br pode recusar acesso automatizado → aparece "Não consegui confirmar os preços atuais." (o projeto **não** contorna o bloqueio).
- Casa: só Home Assistant; sem ele, "NÃO CONFIGURADO".
- Notificações: só com o app aberto/em segundo plano; sem push com o app fechado.

## EM DESENVOLVIMENTO
Nada em andamento.

## PENDENTE (não feito)
- Teste em Android físico, microfone físico, vozes reais, instalação real do PWA.
- Teste com IA real (chave) e com fontes externas ao vivo.
- App Android nativo (apenas a interface `AndroidNativeWakeDetector` existe).
- Web Push (notificação com app fechado).
- Script `npm run e2e` depende de Playwright, que **não** está em `package.json` (estava instalado globalmente no ambiente original).

## ERROS CONHECIDOS (pequenos, não corrigidos para preservar o estado)
1. Painel Memória → "Progresso da Bíblia" mostra a abreviação (`GN 2`) em vez do nome do livro.
2. Diagnóstico → linha "Microfone" mostra 🟢 também quando o estado é INATIVO (é "pronto", não erro).
3. Painel Módulos mostra o status técnico em inglês (`online`, `unavailable`, `client`, `local`).
4. `tests/clap.test.js` usa ruído aleatório (`Math.random`); passou em todas as execuções, mas não é determinístico.
5. Auto-diagnóstico com IA configurada faz uma chamada real e barata à IA (custa tokens).
6. `resumo-jarvis.png` (raiz) é uma imagem de resumo da Fase 2 — documentação, não usada pelo app.
7. Eventos `API_FAILURE` e `TASK_UPDATED` estão declarados em `server/core/events.js`, mas nunca são emitidos.
8. Configurações `privacy.saveConversationLogs` e `notifications.enabled` existem em `server/core/settings.js`, mas nada as lê (a permissão de notificação é a do navegador).

## PRÓXIMA TAREFA
Seguir `CONTINUE_JARVIS.md` → validar a instalação na nova conta (testes + execução) e então
testar em Android físico com o usuário.

---

# PARTE 3 — MANUAL COMPLETO (HANDOFF)

## 1. Identidade do projeto
- **Nome:** JARVIS (identidade visual própria, inspirada em HUD futurista — não copia filme algum).
- **Objetivo:** assistente pessoal inteligente e futurista com interação por voz, duas palmas,
  memória, Bíblia (plano diário com continuidade), notícias, câmbio, combustíveis, tarefas e
  lembretes, cálculos, engenharia, motores, casa inteligente e conversação.
- **Usuário:** fala português do Brasil, mora no Tocantins (fuso `America/Araguaina`), usa Android e PC,
  prioriza soluções **gratuitas** e exige que nada seja simulado ou inventado.
- **Versão:** 2.0.0. Repositório `joao-pedro-garcia/jarvis-ia`, **branch `ccr-8d48bdce-skxdvi`**.

## 2. Tecnologias e dependências
| Item | Versão / detalhe |
|---|---|
| Node.js | desenvolvido e testado em **v22.23.5**; mínimo declarado `>=18.17` (`package.json → engines`) |
| npm | 10.9.9 (`package-lock.json` versionado — use `npm install` ou `npm ci`) |
| Dependência de produção | `@anthropic-ai/sdk` **1.14.0** (única) |
| Servidor | `node:http`/`node:https` puro, sem framework |
| Frontend | HTML + CSS + JavaScript (módulos ES), **sem build**, sem framework |
| Testes | `node:test` (embutido) · E2E com **Playwright + Chromium** (não listado no `package.json`; estava instalado globalmente) |
| Armazenamento | arquivos JSON em `data/` (servidor) + `localStorage`/`sessionStorage` (navegador) |

Comandos:
```bash
npm install            # instala @anthropic-ai/sdk
npm start              # node server/index.js  → http://127.0.0.1:3000
npm run dev            # node --watch (reinicia ao salvar)
npm test               # node --test tests/*.test.js  (194 testes)
npm run e2e            # node tests/e2e/run-e2e.js (27 etapas, precisa de Playwright)
npm run test:all       # npm test && npm run e2e
npm run bible:download # baixa o texto bíblico para data/bible/acf.json
npm run icons          # regenera os PNG do PWA a partir de public/icons/icon.svg (precisa de Playwright)
npm run backup         # copia data/ para backups/ (sem a chave secreta) — ver seção 14
```
**Build:** não existe etapa de build. Os arquivos de `public/` e `shared/` são servidos diretamente.

## 3. Como abrir e usar
- **PC:** `npm start` → abrir `http://127.0.0.1:3000` no Chrome/Edge → tocar em **TOQUE PARA INICIAR**.
- **Porta/host:** `PORT` (padrão 3000) e `HOST` (padrão `127.0.0.1`; `0.0.0.0` para a rede local) no `.env`.
- **Android — opção A (recomendada, Termux):** `pkg install nodejs git` → clonar → `npm install` → `npm start`
  → Chrome em `http://localhost:3000` (localhost é contexto seguro, o microfone funciona sem certificado).
- **Android — opção B (servidor no PC):** gerar certificado com `openssl` (comando no README), `.env` com
  `HOST=0.0.0.0`, `HTTPS_KEY`, `HTTPS_CERT` e `JARVIS_ACCESS_TOKEN`; abrir `https://IP-DO-PC:3000`.
- **Instalar como PWA:** no Chrome, menu ⋮ → "Instalar app"/"Adicionar à tela inicial". Requer HTTPS ou localhost.
  O manifest (`public/manifest.webmanifest`) tem `display: standalone`, ícones PNG 192/512/maskable e atalhos
  (Bíblia, Notícias, Meu dia → `/?cmd=biblia|noticias|meu-dia`).

## 4. Configuração
- `.env` (não versionado; modelo em `.env.example`, com todas as variáveis comentadas). Nenhuma é obrigatória.
- Variáveis: `PORT`, `HOST`, `JARVIS_TIMEZONE`, `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`,
  `JARVIS_EFFORT`, `JARVIS_WEB_SEARCH`, `ANTHROPIC_API_KEY` (legado), `JARVIS_MODEL` (legado),
  `JARVIS_ACCESS_TOKEN`, `JARVIS_SECRET_KEY`, `HTTPS_KEY`, `HTTPS_CERT`, `HOME_ASSISTANT_URL`,
  `HOME_ASSISTANT_TOKEN`, `BIBLE_SOURCE_URL`, `FUEL_GASOLINE_CSV`, `FUEL_DIESEL_CSV`, `JARVIS_DEBUG`,
  `JARVIS_LOG_TO_FILE`, `JARVIS_LOG_CONSOLE`, `JARVIS_REMINDER_INTERVAL_MS`, `JARVIS_DATA_DIR`.
- Configurações do usuário (voz, palmas, tema…) ficam em `data/settings.json`, editáveis na tela
  **Configurações**. Padrões em `server/core/settings.js`:
  voz `rate 1.05, pitch 1, volume 1, pt-BR, maxSpokenChars 600, bargeIn true, silent false` ·
  ouvido `silenceMs 1800, continuousConversation true, wakeWord false` ·
  palmas `enabled false, sensitivity 0.6, minGapMs 120, maxGapMs 700, maxClapMs 110, cooldownMs 2500, thresholdOverride 0` ·
  interface `tema ciano, animações, modo desempenho, partículas, keepAwake false` · segurança `safeMode false`.
- Personalidade: `config/personality.json` (base) + `data/personality.json` (ajustes do usuário).
- Fontes de notícias: `config/news-sources.json`.

## 5. Arquitetura

### 5.1 Estrutura de pastas
```
server/index.js                 servidor HTTP/HTTPS, rotas da API, SSE, arquivos estáticos (public/ e /shared/)
server/brain/brain.js           entrada do cérebro: processInput() → orquestrador ou conversa (IA)
server/brain/orchestrator.js    normalização → intenção → permissão/confirmação → módulo → resultado estruturado
server/brain/commands.js        REGISTRO de comandos (51 registerCommand), padrões de linguagem natural
server/brain/tone.js            7 tons + domínio (motor/engenharia) + texto local de emergência
server/brain/personality.js     monta o prompt de sistema da IA a partir de config/personality.json
server/brain/llm.js             camada AI PROVIDER (escolha por AI_PROVIDER), status, ping
server/brain/ai/*.js            provedores: anthropic.js (SDK), openai-compatible.js (fetch Chat Completions; também Ollama)
server/commands/loader.js       carrega comandos de server/commands/custom/*.js ao iniciar
server/core/*                   events (barramento), logger, store (JSON atômico), settings, http-client (timeout+cache),
                                health (semáforo), selftest, secrets (AES-256-GCM), when (datas pt-BR), text, time, env, paths,
                                modules-status
server/modules/bible            books.js (66 livros), provider.js (texto), reading.js (plano/páginas/progresso)
server/modules/news             exchange.js, fuel.js, feeds.js, news.js (resumo, fala, histórico anti-repetição)
server/modules/memory           memory.js (persistente + sessão em RAM)
server/modules/tasks            tasks.js (tarefas, lembretes, agendador)
server/modules/house            house.js (Home Assistant)
server/modules/engine           engine.js (potência/torque/cilindrada/consumo)
server/modules/engineering      math.js e units.js → reexportam shared/
shared/math.js, shared/units.js avaliador matemático seguro e conversões (usados também pelo navegador offline)
public/index.html, css/         interface (HUD), estilos e temas
public/js/app.js                orquestrador do NAVEGADOR (entrada/saída, estados, eventos, PWA, lembretes)
public/js/core/                 bus, api (fetch+token+SSE), state, settings, logger, offline-brain
public/js/modules/              hearing (OUVIDO), voice (VOZ), clap + clap-detector + clap-worklet (PALMAS),
                                device (microfone, notificações, wake lock), sounds, wake/ (WakeDetector)
public/js/ui/                   core-viz (núcleo canvas), bible-reader, news-panel, panels, diagnostics, sheet, dom
public/sw.js, manifest          service worker e manifest do PWA
config/                         personality.json, news-sources.json
tests/                          *.test.js (node:test), helpers/setup.js, e2e/run-e2e.js + make-wav.js
scripts/                        download-bible.js, make-icons.cjs, backup-data.js
docs/AUDITORIA.md               auditoria da v1 e resultado da Fase 2
```
Lista arquivo a arquivo: `PROJECT_INVENTORY.md`.

### 5.2 Fluxo geral
```
Toque / texto / microfone / duas palmas / palavra "Jarvis"
  → navegador (public/js/app.js) → POST /api/input {text, sessionId, pageSize, source, client}
  → brain.processInput → orchestrator.normalizeInput (remove "Jarvis", corrige erros) 
  → handlePending (confirmação "sim/não") → resolveIntent (commands.detect, por prioridade e contexto)
  → dispatch (permissão: safe/confirm/restricted, modo seguro) → runCommand (módulo)
  → OU converse() (IA, ou resposta local honesta sem IA; urgência sempre tem resposta local)
  → resultado {success,intent,module,data,message,source,timestamp,text,speech,ui,clientActions,tone,...}
  → navegador: transcrição + painel (ui.panel) + fala (speech) + estado do núcleo
```
Eventos do servidor chegam ao navegador por SSE (`GET /api/events`): `REMINDER_DUE`, `MEMORY_UPDATED`, etc.

### 5.3 API (servidor)
`GET /api/health` (sem token) · `GET /api/status` · `POST /api/input` · `GET /api/events` (SSE) · `GET /api/commands` ·
Bíblia: `GET /api/bible`, `GET /api/bible/books`, `POST /api/bible/{open,next,prev,next-chapter,prev-chapter,next-reading,goto}`,
`GET|PUT /api/bible/settings` · `GET /api/news?parts=` · Memória: `GET|POST|DELETE(?confirm=true) /api/memory`,
`PATCH|DELETE /api/memory/:id`, `POST /api/memory/:id/reveal {confirm:true}` · Tarefas: `GET /api/tasks[?all=1]`,
`POST /api/tasks`, `PATCH /api/tasks/:id {action: done|cancel|reopen|postpone|edit}` · `GET|PUT /api/settings` ·
`GET|PUT /api/personality` · `GET /api/selftest[?ai=0]` · `GET /api/house` · `GET|DELETE(?confirm=true) /api/logs` ·
`POST /api/logs/client`. Também serve `/` (public/) e `/shared/`.
Proteções: POST/PUT/PATCH só com `Content-Type: application/json` (415), `Origin` diferente é bloqueado (403),
token opcional (`X-Jarvis-Token` ou `?token=`), limite por IP (input 40/min, news 10/min, selftest 6/min), CSP.

### 5.4 Fluxo de voz e microfone (OUVIDO)
`public/js/modules/hearing.js` usa `SpeechRecognition`/`webkitSpeechRecognition` (Web Speech API do navegador;
no Chrome o áudio vai ao serviço do Google → precisa de internet). `listenOnce()` termina por silêncio
(`silenceMs`). O estado **OUVINDO só aparece após `onstart`** (antes: "ATIVANDO MICROFONE"). Estados do microfone
(`device.js`): ATIVO, INATIVO, SEM PERMISSÃO, INDISPONÍVEL. Ativação por voz opcional ("Jarvis, …") mantém um
reconhecimento contínuo (desligada por padrão por privacidade). "Conversa contínua": se o JARVIS terminar com
pergunta, volta a ouvir. Teste real de microfone: `testMicrophone()` (getUserMedia + medição de 3 s).

### 5.5 Fluxo da fala (VOZ)
`voice.js` usa `speechSynthesis` (vozes instaladas no aparelho). Divide em frases (~180 caracteres), tem
temporizador de segurança caso o navegador não dispare `onend`, `pauseSpeaking/resumeSpeaking`, `stopSpeaking`.
O tamanho do que é falado é decidido no servidor (`orchestrator.speechLimit`): padrão 600 caracteres; notícias ≥ 900;
técnico/estudo ≥ 800; **modo leitura da Bíblia sem limite**. Modo silencioso (`voice.silent`) → `speech` vazio.
Interrupção: enquanto fala, `startBargeIn()` escuta só frases curtas ("pare", "para", "chega", "silêncio" → parar;
"pausa"/"espera" → pausar); duas palmas durante a fala também param. No Android com palmas ativas, a interrupção
por voz é desligada (um microfone só).

### 5.6 Fluxo das palmas
`clap-worklet.js` (AudioWorklet, thread de áudio) calcula a cada 256 amostras: energia (rms), pico e fração de
alta frequência → `clap-detector.js` (`ClapDetector`, puro, testável no Node) aplica: ataque súbito,
limiar adaptativo ao ruído (ou limiar manual), duração ≤ `maxClapMs`, alta frequência ≥ 0,18, intervalo entre
`minGapMs` e `maxGapMs`, intensidades com razão < 3,5×, rejeição da 3ª palma (janela de 350 ms) e `cooldownMs`.
Reserva sem AudioWorklet: AnalyserNode a cada 8 ms. Em `clap.js`, no Android o microfone é liberado quando o
reconhecimento de fala precisa dele. Abstração `public/js/modules/wake/`: `WakeDetector` (contrato),
`BrowserWakeDetector` (em uso), `AndroidNativeWakeDetector` (só ativa se existir `window.JarvisNative` — **o app
nativo NÃO existe**). Duas palmas → JARVIS fala "Sim?" e escuta.

### 5.7 Fluxo da Bíblia
- Texto: `provider.js` lê `data/bible/acf.json` (Almeida Corrigida Fiel, 66 livros, JSON de
  `raw.githubusercontent.com/thiagobodruk/biblia/master/json/acf.json`, ~4 MB). Se não existir, baixa e salva
  (depois funciona offline). Reserva: `bible-api.com` (tradução "almeida"), capítulo a capítulo, salvo em
  `data/bible/chapters/`.
- Progresso: `reading.js` → **`data/bible-state.json`** com:
  `position` (início da próxima leitura), `chaptersPerDay` (3), `plan` {date, chapters[], completed[], current,
  verse, completedAt, label}, `reader` {mode plan|free, free}, `history`, `streak`, `lastCompletedDate`,
  `totalChaptersRead`.
- Regras: início em **Gênesis 2**; dia 1 Gn 2–4, dia 2 Gn 5–7, dia 3 Gn 8–10, dia 4 Gn 11–13…
  A posição salva é o **versículo** (página = versículo ÷ versículos por página, que depende da tela).
  Passar da última página de um capítulo marca o capítulo como concluído; terminar o último → "Leitura de hoje
  concluída", `position` avança, sequência atualizada. **Nunca inicia a próxima leitura sozinho**: no mesmo dia
  só com "próxima leitura"; um plano não concluído continua no dia seguinte. Leitura livre ("abra João 3")
  não mexe no plano. "Leia" fala a página inteira.
- **Ponto atual registrado:** veja a seção 7 (dados locais).

### 5.8 Fluxo da memória
`memory.js` → **`data/memory.json`** = `{ facts: [], preferences: [], tasks: [] }`. Cada item:
`{id (UUID), kind, text, createdAt, updatedAt?}`; tarefas também `{status pending|done|cancelled, done, dueAt, hasTime, notifiedAt}`.
Sensíveis (senha, CPF, cartão, CVV, token): pedem confirmação; gravados com `text: ''` +
`secret {v, iv, tag, data}` (AES-256-GCM, `server/core/secrets.js`) + `sensitiveLabel`, `hint`; a API devolve
mascarado; revelar exige confirmação; nunca falados nem enviados à IA. Chave: `JARVIS_SECRET_KEY` ou
**`data/.secret.key`** (gerada automaticamente, 0600). **Perder essa chave = perder os itens protegidos.**
Memória de **sessão** (histórico da conversa) fica só na RAM do servidor (6 h). "Esqueça isso" usa
`sess.context.lastMemoryId`. Escrita atômica (`store.js`: arquivo temporário + rename; arquivo corrompido é
copiado para `*.corrupt-<timestamp>`).

### 5.9 Fluxo das tarefas
`tasks.js` (armazenadas no mesmo `data/memory.json`, tipo `tasks`). Datas via `server/core/when.js`
("às 19h", "amanhã", "daqui a 20 minutos", "sexta", "dia 12", "hoje à noite"; hora passada sem dia → amanhã).
Agendador a cada `JARVIS_REMINDER_INTERVAL_MS` (20 s) emite `REMINDER_DUE` uma única vez (`notifiedAt`) →
SSE → navegador: mensagem, som, fala e notificação via Service Worker (se permitida). "Concluí essa" usa
`lastTaskId`. Cancelar pede confirmação.

### 5.10 Notícias, câmbio, combustíveis
- **Câmbio** (`exchange.js`): AwesomeAPI `json/last/USD-BRL,EUR-BRL,GBP-BRL` (cotação comercial, compra) → reserva
  PTAX do Banco Central (`olinda.bcb.gov.br`, `CotacaoMoedaPeriodo`). Cache 60 s. Falha total:
  "Não consegui confirmar a cotação atual neste momento."
- **Combustíveis** (`fuel.js`): ANP Levantamento de Preços — (1) CSVs semanais `ultimas-4-semanas-*.csv`;
  (2) série mensal descoberta na página de dados abertos da ANP. Média simples da semana mais recente; Gasolina
  comum, Diesel comum e Diesel S-10 separados; TO e Brasil; aviso se > 14 dias. Cache 6 h. Última pesquisa salva em
  `data/fuel-last.json` e mostrada **só como "última pesquisa obtida", com data**, quando tudo falha.
  Identifica-se honestamente (`User-Agent: JARVIS-assistente-pessoal/2.0`); **não contorna** bloqueio anti-robô.
- **Notícias** (`feeds.js` + `news.js`): RSS de `config/news-sources.json`; só itens com data das últimas 36 h;
  cache 10 min; seleção por IA (JSON Schema, só pode citar matérias reais) ou heurística sem IA (fatos em várias
  fontes, recência, fonte oficial); histórico de 4 dias em `data/news-history.json` ("continua em destaque").
- Saúde de cada fonte → `server/core/health.js` → semáforo do diagnóstico.

### 5.11 IA
`llm.js` escolhe o provedor por `AI_PROVIDER` (`anthropic` padrão; `openai`/`openai-compatible`; `ollama`; `none`).
Anthropic: SDK oficial, modelo padrão `claude-opus-5-5`, `output_config.effort` (padrão `low`), fallback de
servidor (`server-side-fallback-2026-07-01`, `fallbacks: 'default'`), pesquisa web `web_search_20260209` quando a
pergunta é sobre algo atual. OpenAI-compatível: `POST {AI_BASE_URL}/chat/completions` (Ollama em
`http://localhost:11434/v1`, sem chave). Sem IA: `conversation.local` com mensagem explícita de que a IA externa não
está configurada (`success: false`).

### 5.12 Diagnóstico (estado atual de cada módulo)
Tela "DIAGNÓSTICO JARVIS" (tecla D, ou módulo SISTEMA): 12 componentes com 🟢 OK / 🟡 LIMITADO / 🔴 INDISPONÍVEL /
⚪ NÃO VERIFICADO; tocar mostra o motivo; atualiza a cada 10 s. Origem de cada estado:

| Componente | Calculado em | Regra atual |
|---|---|---|
| CÉREBRO | servidor | sempre OK (orquestrador local); detalhe diz se há IA |
| IA | servidor | OK se configurada; LIMITADO se último erro; INDISPONÍVEL se não configurada/provedor inválido |
| INTERNET | servidor | `isOnline()` (HEAD em gstatic/anthropic/github, cache 30 s) |
| MEMÓRIA | servidor | OK (arquivo local) |
| TAREFAS | servidor | OK + número de pendentes |
| BÍBLIA | servidor | OK se texto salvo; LIMITADO se ainda vai baixar; INDISPONÍVEL sem texto e sem internet |
| NOTÍCIAS / CÂMBIO / COMBUSTÍVEIS | servidor | último resultado real (`health.js`); ⚪ até a 1ª consulta; INDISPONÍVEL sem internet |
| OUVIDO | navegador | INDISPONÍVEL sem Web Speech, sem HTTPS, permissão negada ou sem microfone; LIMITADO offline |
| VOZ | navegador | INDISPONÍVEL sem síntese; LIMITADO se silencioso/desligada/sem voz pt |
| PALMAS | navegador | LIMITADO se desligada/pausada/em 2º plano; OK se o detector está rodando |

"Faça um diagnóstico" executa testes reais: servidor (`/api/selftest`: armazenamento, internet, IA com ping se
configurada, memória, tarefas, Bíblia lendo Gn 1, câmbio, combustíveis, notícias) + navegador (microfone 1,5 s,
voz) → "Diagnóstico concluído. X OK, Y limitado(s), Z indisponível(is)."

### 5.13 Configurações, armazenamento local e offline
- Servidor: `data/*.json` (fonte da verdade). Navegador: `localStorage` → `jarvis.settings` (cópia das
  configurações), `jarvis.bible` (última página vista, usada offline), `jarvis.token` (token de acesso);
  `sessionStorage` → `jarvis.session` (id da sessão). Cache do Service Worker: `jarvis-2.0.0`.
- Offline: servidor sem internet → banner "📡 MODO OFFLINE", tudo local continua. Servidor inacessível → banner
  "SERVIDOR INACESSÍVEL", o navegador responde hora/data/contas/conversões (`offline-brain.js` + `/shared/`) e
  mostra a última página da Bíblia salva.
- Service worker (`public/sw.js`): rede primeiro (4 s) e cache se offline; **nunca** cacheia `/api/`; nova
  versão espera o usuário tocar em "Atualizar"; clique na notificação abre o app.

### 5.14 Interface (não alterar sem pedido)
HUD escuro (`#03070d`), cor de destaque ciano `#5ef2ff` (temas âmbar e verde), painéis "vidro" com cantos
luminosos, fonte monoespaçada para rótulos, núcleo central em canvas com estados distintos (ONLINE calmo,
LISTENING ondas expansivas, THINKING âmbar com pontos girando, SPEAKING barras radiais, ERROR vermelho).
PC: 3 colunas (módulos/comandos · núcleo · sistema/Bíblia/memória). Celular (≤ 820 px): coluna única, barra inferior
com microfone central, painéis em tela cheia, deslizar para virar página. Modo econômico: 24 fps, sem partículas,
sem blur, status a cada 3 min.

## 6. O que foi testado e o que não foi
- **Automatizado real:** 194 testes (`npm test`) — distribuição: nlu 69, phase2 58, network 12, clap 12, bible 10,
  ai 8, brain 8, security 8 (servidor HTTP real), news 5, engineering 4.
- **E2E real no Chromium (27 etapas):** palmas por áudio real (WAV no microfone falso), getUserMedia, offline,
  reinício do servidor e persistência, layout Pixel 7 emulado, PWA (manifest, ícones, SW).
- **Simulado:** reconhecimento de fala e síntese no E2E; IA e fontes externas nos testes unitários.
- **NÃO testado:** Android físico, instalação real do PWA, microfone físico, vozes reais, notificação do sistema
  (Chromium headless nega), IA com chave real, fontes externas ao vivo (bloqueadas no ambiente original).

## 7. Dados locais (fora do Git) — LEIA COM ATENÇÃO
O desenvolvimento ocorreu num **contêiner de nuvem temporário**. O `data/` desse contêiner continha somente
dados gerados pelos testes do próprio desenvolvedor (Claude), **não** dados reais do usuário:

| Arquivo (no contêiner original) | Conteúdo | Necessário para reconstruir? |
|---|---|---|
| `data/bible/acf.json` (4.024.660 bytes) | texto bíblico baixado | Não — rebaixado com `npm run bible:download` |
| `data/bible-state.json` (624 bytes) | plano "Gênesis 2–4" iniciado em 25/11/2026 por teste, capítulo atual Gn 2, versículo 0 (página 1), 0/3 concluídos, sequência 0 | Não — é dado de teste |
| `data/logs/jarvis.log` | logs de desenvolvimento | Não |

**Dados reais do usuário** (se ele já usou o JARVIS no próprio computador/celular) ficam **na máquina dele**,
em `data/` da pasta onde rodou `npm start`: `bible-state.json` (progresso da Bíblia), `memory.json`
(memórias e tarefas), `settings.json`, `personality.json`, `news-history.json`, `fuel-last.json`,
`.secret.key` (**chave das memórias protegidas — guardar com segurança**), `bible/`, `logs/`.
Para preservá-los: `npm run backup` na máquina dele, ou copiar a pasta `data/` inteira. O navegador também guarda
`localStorage` (`jarvis.settings`, `jarvis.bible`, `jarvis.token`) — não precisa ser copiado (é cópia/cache).
Sem `data/`, o JARVIS recomeça em Gênesis 2 com memória vazia.

## 8. Serviços externos
Todos gratuitos, exceto a IA (opcional; pode ser local e gratuita com Ollama).

| Serviço | Para quê | Custo | Chave | Limites / fallback | Offline |
|---|---|---|---|---|---|
| AwesomeAPI (`economia.awesomeapi.com.br`) | câmbio comercial | grátis | não | limite de uso do plano gratuito; fallback PTAX | não |
| Banco Central — PTAX (`olinda.bcb.gov.br`) | câmbio reserva | grátis | não | só dias úteis | não |
| ANP — dados abertos (`www.gov.br/anp`) | combustíveis | grátis | não | pode bloquear acesso automatizado; fallback série mensal → última pesquisa rotulada | não |
| RSS: Agência Brasil, g1, Folha, BBC News Brasil, DW | notícias | grátis | não | fonte fora é ignorada | não |
| GitHub raw (`thiagobodruk/biblia`) | texto bíblico (1 vez) | grátis | não | fallback bible-api.com | sim, após baixar |
| bible-api.com | texto bíblico reserva | grátis | não | por capítulo | sim, após cache |
| Anthropic API | IA (opcional) | **pago por uso** | sim | sem chave → modo local | não |
| API compatível com OpenAI | IA (opcional) | depende do provedor | depende | — | não |
| Ollama (local) | IA (opcional) | grátis | não | precisa rodar no PC | sim |
| Home Assistant | casa (opcional) | grátis (auto-hospedado) | token | sem ele: NÃO CONFIGURADO | na rede local |
| Web Speech (Google, via Chrome) | reconhecimento de fala | grátis | não | só Chrome/Edge/Android | não |
| gstatic/anthropic/github (HEAD) | teste de internet | grátis | não | — | — |

## 9. Decisões arquiteturais
Ver `DECISIONS_JARVIS.md`.

## 10. Limitações conhecidas
Ver `JARVIS_STATE.md` → LIMITADO e ERROS CONHECIDOS, e README → "Limitações conhecidas".

## 11. Regras de trabalho estabelecidas pelo usuário
Funcionalidade real acima de efeito visual · não inventar dados/APIs/testes · não declarar testado o que não foi ·
diferenciar REAL de SIMULADO · priorizar soluções gratuitas · não remover testes · confirmar ações destrutivas ·
não contornar mecanismos de segurança (Android, navegador, sites) · manter a identidade visual ·
responder em português do Brasil.

## 12. Histórico de commits
```
d37f931 Adiciona imagem de resumo do projeto (feito, não feito e não testado)
9cadb67 JARVIS Fase 2: auditoria, robustez, Android/PWA, tarefas, IA multi-provedor
59c87f0 Fase 2 (servidor): orquestrador, provedores de IA, tarefas/lembretes, segurança, fallbacks
100c9ee Implementa o JARVIS: assistente pessoal com voz, palmas, Bíblia e notícias
451b8c2 Initial commit
```
(+ o commit de transferência que adiciona estes documentos.)

## 13. Como adicionar comandos
Arquivo novo em `server/commands/custom/` exportando `default { name, description, aliases, patterns, permission, action }`
(exemplo `moeda.js`). Comandos centrais ficam em `server/brain/commands.js` (`registerCommand`, prioridade maior vence).
Adicione frases em `tests/nlu.test.js` ou `tests/phase2.test.js`.

## 14. Backup e restauração
- Código: o próprio repositório GitHub (branch `ccr-8d48bdce-skxdvi`).
- Dados: `npm run backup` → `backups/jarvis-data-<data>/` (cópia de `data/` **sem** `.secret.key`, ignorada pelo Git).
  `npm run backup -- --with-key` inclui a chave (guarde em local seguro, nunca compartilhe).
- Restaurar: copiar a pasta de backup para `data/` (com o servidor parado) e, se houver memórias protegidas,
  recolocar `data/.secret.key` original (ou definir o mesmo `JARVIS_SECRET_KEY`).

---

# PARTE 4 — DECISÕES JÁ TOMADAS

Registro das decisões reais tomadas nas Fases 1 e 2. Antes de desfazer alguma, entenda o motivo.

| # | Tema | Decisão | Motivo |
|---|---|---|---|
| 1 | Tecnologia | Node.js puro (sem Express) + HTML/CSS/JS sem build nem framework | Repositório estava vazio; menos dependências, roda no Termux do Android, fácil de manter |
| 2 | Dependências | Única dependência: `@anthropic-ai/sdk` | Tudo o mais com APIs nativas do Node e do navegador |
| 3 | Arquitetura | Lógica no **servidor** (cérebro, módulos, dados); navegador só entrada/saída | Chaves nunca no frontend; dados persistentes num lugar só |
| 4 | Orquestrador | Pipeline normalização → intenção → permissão → módulo → resultado estruturado `{success,intent,module,data,message,source,timestamp}` | Pedido da Fase 2; separa regra de negócio da interface |
| 5 | Intenções | Regex por prioridade + contexto da tela + correção conservadora de erros de transcrição (com lista de palavras que nunca são "corrigidas") | Funciona sem IA e offline; previsível e testável |
| 6 | Contexto | "avança/volta/próxima/leia" só mexem na Bíblia quando o leitor está aberto (`sess.context.activeModule`) | Pedido explícito: contexto baseado no estado real |
| 7 | Comandos | Registro extensível `registerCommand` + pasta `server/commands/custom/` carregada automaticamente | Novo comando = 1 arquivo |
| 8 | IA | Camada `AI_PROVIDER` (anthropic padrão, openai-compatível, ollama, none); compatível com `ANTHROPIC_API_KEY` | Não depender de um único provedor; permitir opção local gratuita |
| 9 | IA ausente | Modo local honesto: diz que a IA externa não está configurada; nunca finge | Regra absoluta do usuário |
| 10 | Tons | 7 tons (sério, normal, resenha, técnico, estudo, desabafo, urgente); humor só em normal/resenha; urgência tem resposta local com 192/193/190 | Pedido da Fase 2; segurança mesmo sem IA/internet |
| 11 | Voz | Web Speech (reconhecimento e síntese) do navegador | Gratuito, sem chave; limitação documentada (Chrome usa serviço do Google) |
| 12 | "OUVINDO" | Só exibido após o navegador confirmar `onstart` | Não mostrar estado falso |
| 13 | Interrupção | "Pare" por reconhecimento de frases curtas durante a fala + duas palmas; desligado no Android se palmas ativas | Barge-in sem eco; um microfone só no Android |
| 14 | Palmas | AudioWorklet + detector puro com 8 critérios; testado com sinais sintéticos e WAV real no E2E | Reduzir falso positivo; testável |
| 15 | Palmas com tela bloqueada | **Não contornar** restrições do navegador/Android; criar `WakeDetector` com ponte `AndroidNativeWakeDetector` para um app futuro | Pedido explícito do usuário |
| 16 | Bíblia — texto | ACF de repositório público, baixado uma vez para uso pessoal, **não versionado**; reserva bible-api.com (Almeida) | Funcionar offline sem redistribuir o texto |
| 17 | Bíblia — progresso | Salvar versículo (não número da página); plano de 3 capítulos começando em Gn 2; nunca avançar sozinho | Página varia com a tela; regras do usuário |
| 18 | Memória | JSON local; "lembre que…" explícito; sessão só em RAM; sensíveis com AES-256-GCM, mascarados, revelação com confirmação, nunca falados nem enviados à IA | Privacidade |
| 19 | Tarefas | Mesma base da memória (`tasks`), datas em português próprias (`when.js`), agendador no servidor + SSE | Sem dependências; lembretes funcionam com o app aberto |
| 20 | Notificações | API de Notificações via Service Worker; **sem Web Push** | Push exigiria servidor externo; limitação documentada |
| 21 | Câmbio | AwesomeAPI (grátis) → PTAX do Banco Central; cache 1 min | Gratuito, oficial como reserva |
| 22 | Combustíveis | ANP dados abertos (semanal → série mensal → última pesquisa rotulada); média simples calculada; diesel comum e S-10 separados | Fonte oficial gratuita; nunca apresentar dado antigo como atual |
| 23 | Bloqueio do gov.br | Identificação honesta (`JARVIS-assistente-pessoal/2.0`); **recusado** imitar navegador para burlar anti-robô | Não contornar proteções de terceiros (a tentativa foi bloqueada e removida) |
| 24 | Notícias | RSS de veículos reconhecidos e oficiais; só itens das últimas 36 h com data; IA só resume matérias reais; histórico anti-repetição 4 dias | Atualidade e confiabilidade |
| 25 | Offline | Separar "sem internet" (servidor funciona) de "servidor inacessível" (navegador faz hora/data/contas via `/shared/`) | Pedido da Fase 2 |
| 26 | Android | Recomendação principal: servidor no próprio celular via Termux (localhost = microfone sem certificado); alternativa PC + HTTPS + token | Regra de HTTPS do navegador |
| 27 | PWA | Manifest standalone, ícones PNG gerados do SVG, SW rede-primeiro, nunca cacheia `/api/`, atualização só com toque do usuário | Instalável e sem dados antigos como atuais |
| 28 | Diagnóstico | Semáforo de 12 componentes com motivo; servidor calcula os seus, navegador os seus; auto-diagnóstico com testes reais | Nada simulado |
| 29 | Segurança | Confirmação para ações importantes, modo seguro, token opcional, CSRF (JSON + Origin), rate-limit, CSP, logs sem conteúdo das falas | Auditoria da Fase 2 encontrou CSRF |
| 30 | Interface | HUD escuro com ciano, painéis de vidro, núcleo canvas com estado visual por estado, modo econômico | Identidade visual própria definida na Fase 1 |
| 31 | Testes | `node:test` sem dependências; E2E com Playwright fora do `package.json`; nunca remover testes | Regra do usuário |
| 32 | Git | Todo trabalho no branch `ccr-8d48bdce-skxdvi`; nenhum PR aberto (o usuário não pediu) | Regras do ambiente |

---

# PARTE 5 — INVENTÁRIO DE ARQUIVOS

Legenda: **Importante?** Alta = o app não funciona sem; Média = funcionalidade/qualidade; Baixa = apoio.
**Transferir?** "Git" = já está no repositório (vai junto com o clone); "Manual" = fora do Git, copiar à parte;
"Não" = regenerável ou descartável.

## Raiz
| Arquivo | Função | Importante? | Transferir? |
|---|---|---|---|
| `CONTINUE_JARVIS.md` | Porta de entrada para a próxima conta | Alta | Git |
| `HANDOFF_JARVIS.md` | Manual completo (arquitetura, fluxos, diagnóstico, dados) | Alta | Git |
| `JARVIS_STATE.md` | Estado atual, erros conhecidos, próxima tarefa | Alta | Git |
| `DECISIONS_JARVIS.md` | Decisões arquiteturais | Alta | Git |
| `PROJECT_INVENTORY.md` | Este inventário | Média | Git |
| `TRANSFER_CHECKLIST.md` | Checklist de verificação pós-transferência | Média | Git |
| `README.md` | Guia do usuário (instalação, Android, PWA, IA, testes) | Alta | Git |
| `package.json` | Scripts (`start`, `test`, `e2e`, `backup`…), engines, versão 2.0.0 | Alta | Git |
| `package-lock.json` | Versões travadas (`@anthropic-ai/sdk` 1.14.0) | Alta | Git |
| `.env.example` | Modelo de variáveis de ambiente (sem segredos) | Alta | Git |
| `.gitignore` | Ignora node_modules, .env, data, certs, logs, screenshots, backups | Média | Git |
| `resumo-jarvis.png` | Imagem-resumo da Fase 2 (não usada pelo app) | Baixa | Git |
| `docs/AUDITORIA.md` | Auditoria da v1 + resultado da Fase 2 | Média | Git |

## Servidor — `server/`
| Arquivo | Função | Importante? | Transferir? |
|---|---|---|---|
| `index.js` | Servidor HTTP/HTTPS, rotas da API, SSE, estáticos, CSRF, rate-limit, agendador | Alta | Git |
| `brain/brain.js` | `processInput()`: entrada do cérebro, conversa com IA ou local | Alta | Git |
| `brain/orchestrator.js` | Normalização, intenção, confirmação, despacho, resultado estruturado, tamanho da fala | Alta | Git |
| `brain/commands.js` | Registro de 51 comandos (padrões, permissões, ações) | Alta | Git |
| `brain/tone.js` | 7 tons, domínio técnico, texto de emergência | Alta | Git |
| `brain/personality.js` | Prompt de sistema da IA | Média | Git |
| `brain/llm.js` | Camada AI PROVIDER, status, ping | Alta | Git |
| `brain/ai/anthropic.js` | Provedor Claude (SDK) | Média | Git |
| `brain/ai/openai-compatible.js` | Provedor Chat Completions (OpenAI/Ollama…) | Média | Git |
| `commands/loader.js` | Carrega comandos personalizados | Média | Git |
| `commands/custom/moeda.js` | Exemplo de comando personalizado (cara ou coroa) | Baixa | Git |
| `core/env.js` | Lê `.env` | Alta | Git |
| `core/paths.js` | Caminhos (ROOT, DATA_DIR via `JARVIS_DATA_DIR`) | Alta | Git |
| `core/store.js` | Armazenamento JSON atômico | Alta | Git |
| `core/settings.js` | Configurações padrão e persistência | Alta | Git |
| `core/events.js` | Barramento de eventos do servidor | Alta | Git |
| `core/logger.js` | Logs (memória + `data/logs/jarvis.log`, mascaramento) | Média | Git |
| `core/http-client.js` | fetch com timeout, cache curto, teste de internet | Alta | Git |
| `core/health.js` | Último estado de câmbio/combustíveis/notícias | Média | Git |
| `core/modules-status.js` | Status dos módulos e semáforo | Média | Git |
| `core/selftest.js` | Auto-diagnóstico do servidor | Média | Git |
| `core/secrets.js` | Criptografia AES-256-GCM | Alta | Git |
| `core/when.js` | Datas/horas em português | Alta | Git |
| `core/text.js` | Normalização, correção de palavras, similaridade, texto original | Alta | Git |
| `core/time.js` | Data/hora no fuso do usuário | Alta | Git |
| `modules/bible/books.js` | 66 livros, capítulos, referências faladas | Alta | Git |
| `modules/bible/provider.js` | Texto bíblico (download/cache/reserva) | Alta | Git |
| `modules/bible/reading.js` | Plano diário, páginas, progresso, sequência | Alta | Git |
| `modules/memory/memory.js` | Memória persistente e de sessão | Alta | Git |
| `modules/tasks/tasks.js` | Tarefas, lembretes, agendador | Alta | Git |
| `modules/news/exchange.js` | Câmbio (AwesomeAPI → PTAX) | Alta | Git |
| `modules/news/fuel.js` | Combustíveis (ANP semanal → mensal → última) | Alta | Git |
| `modules/news/feeds.js` | Leitura de RSS/Atom | Alta | Git |
| `modules/news/news.js` | Resumo, seleção, fala, anti-repetição | Alta | Git |
| `modules/house/house.js` | Casa (Home Assistant) | Média | Git |
| `modules/engine/engine.js` | Cálculos de motor | Média | Git |
| `modules/engineering/math.js`, `units.js` | Reexportam `shared/` | Média | Git |

## Compartilhado — `shared/`
| Arquivo | Função | Importante? | Transferir? |
|---|---|---|---|
| `math.js` | Avaliador matemático seguro (servidor e navegador) | Alta | Git |
| `units.js` | Conversões de unidades | Alta | Git |

## Navegador — `public/`
| Arquivo | Função | Importante? | Transferir? |
|---|---|---|---|
| `index.html` | Estrutura do HUD | Alta | Git |
| `css/jarvis.css` | Identidade visual, temas, responsivo | Alta | Git |
| `manifest.webmanifest` | PWA | Alta | Git |
| `sw.js` | Service worker (offline, atualização, notificação) | Alta | Git |
| `icons/icon.svg` | Ícone-fonte | Alta | Git |
| `icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png` | Ícones do PWA (gerados por `npm run icons`) | Alta | Git |
| `js/app.js` | Orquestrador do navegador | Alta | Git |
| `js/core/bus.js` | Eventos do cliente | Alta | Git |
| `js/core/api.js` | fetch com timeout/token, SSE | Alta | Git |
| `js/core/state.js` | Estados do núcleo | Alta | Git |
| `js/core/settings.js` | Configurações no cliente | Alta | Git |
| `js/core/logger.js` | Logs do cliente para o servidor | Média | Git |
| `js/core/offline-brain.js` | Respostas locais com servidor fora | Média | Git |
| `js/modules/hearing.js` | OUVIDO, ativação por voz, interrupção | Alta | Git |
| `js/modules/voice.js` | VOZ (falar, pausar, parar) | Alta | Git |
| `js/modules/clap.js` | Captura do microfone para palmas | Alta | Git |
| `js/modules/clap-detector.js` | Algoritmo das duas palmas | Alta | Git |
| `js/modules/clap-worklet.js` | AudioWorklet | Alta | Git |
| `js/modules/device.js` | Microfone, teste real, notificações, manter tela ligada | Alta | Git |
| `js/modules/sounds.js` | Bipes | Baixa | Git |
| `js/modules/wake/*.js` (4) | WakeDetector, BrowserWakeDetector, AndroidNativeWakeDetector, índice | Média | Git |
| `js/ui/core-viz.js` | Núcleo animado (canvas) | Alta | Git |
| `js/ui/bible-reader.js` | Leitor da Bíblia, gestos, animação | Alta | Git |
| `js/ui/news-panel.js` | Painel de notícias | Alta | Git |
| `js/ui/panels.js` | Memória, configurações, módulos, casa, menu | Alta | Git |
| `js/ui/diagnostics.js` | Diagnóstico e auto-diagnóstico | Alta | Git |
| `js/ui/sheet.js`, `js/ui/dom.js` | Painéis sobrepostos, utilidades seguras | Alta | Git |

## Configuração — `config/`
| Arquivo | Função | Importante? | Transferir? |
|---|---|---|---|
| `personality.json` | Personalidade e 7 tons | Alta | Git |
| `news-sources.json` | Fontes RSS | Alta | Git |

## Scripts — `scripts/`
| Arquivo | Função | Importante? | Transferir? |
|---|---|---|---|
| `download-bible.js` | Baixa o texto bíblico | Média | Git |
| `make-icons.cjs` | Gera PNGs do PWA (Playwright) | Baixa | Git |
| `backup-data.js` | Backup de `data/` | Média | Git |

## Testes — `tests/`
| Arquivo | Testes | Transferir? |
|---|---|---|
| `nlu.test.js` | 69 (intenções, contexto, tons) | Git |
| `phase2.test.js` | 58 (orquestrador, tarefas, silêncio, sensíveis, status…) | Git |
| `network.test.js` | 12 (fallbacks, timeout, cache) | Git |
| `clap.test.js` | 12 (palmas) | Git |
| `bible.test.js` | 10 (plano, páginas, continuidade) | Git |
| `ai.test.js` | 8 (provedores de IA) | Git |
| `brain.test.js` | 8 (fluxos do cérebro) | Git |
| `security.test.js` | 8 (servidor HTTP real) | Git |
| `news.test.js` | 5 (parsing) | Git |
| `engineering.test.js` | 4 (contas, conversões, motor) | Git |
| `helpers/setup.js` | Ambiente isolado, Bíblia sintética, fetch simulado | Git |
| `e2e/run-e2e.js`, `e2e/make-wav.js` | Teste final (27 etapas) e gerador do WAV de palmas | Git |

## Fora do Git (ignorados)
| Caminho | Função | Necessário para reconstruir? | Transferir? |
|---|---|---|---|
| `.env` | Configuração e **segredos** | Não para rodar; sim para IA/HTTPS/token | **Manual e seguro** (nunca por chat/Git). Não existia no ambiente de desenvolvimento |
| `data/bible-state.json` | Progresso da Bíblia | Sim, se for o do usuário | **Manual** (`npm run backup`) |
| `data/memory.json` | Memórias, preferências, tarefas | Sim, se for do usuário | **Manual** |
| `data/settings.json`, `data/personality.json` | Preferências | Recomendado | **Manual** |
| `data/.secret.key` | Chave das memórias protegidas | Sim, se houver itens protegidos | **Manual e seguro** (`--with-key`) |
| `data/news-history.json`, `data/fuel-last.json` | Anti-repetição, última pesquisa | Não | Opcional |
| `data/bible/acf.json`, `data/bible/chapters/` | Texto bíblico baixado | Não (`npm run bible:download`) | Não |
| `data/logs/` | Logs | Não | Não |
| `certs/` | Certificado HTTPS (chave privada) | Só para HTTPS na rede | Regenerar (comando no README) |
| `node_modules/` | Dependências | Não | Não (`npm install`) |
| `tests/e2e/screenshots/` | Capturas do E2E | Não | Não |
| `backups/` | Backups gerados por `npm run backup` | — | Guardar fora do projeto |

---

# PARTE 6 — CHECKLIST DE TRANSFERÊNCIA

Marque cada item na nova conta. Entre parênteses: como verificar e o resultado esperado.
Itens com ⚠ dependem do aparelho/rede do usuário e **não foram testados fisicamente** na conta anterior.

## Repositório
- [ ] Branch correto (`git branch --show-current` → `ccr-8d48bdce-skxdvi`)
- [ ] Árvore limpa (`git status` → nada a commitar)
- [ ] Commit de transferência presente (`git log --oneline | head -3` → "JARVIS - checkpoint completo antes da transferência")
- [ ] Documentos presentes: CONTINUE_JARVIS, HANDOFF_JARVIS, JARVIS_STATE, PROJECT_INVENTORY, DECISIONS_JARVIS, TRANSFER_CHECKLIST, README, docs/AUDITORIA
- [ ] 98+ arquivos rastreados (`git ls-files | wc -l`)

## Instalação e execução
- [ ] Node ≥ 18.17 (`node -v`; desenvolvido em v22.23.5)
- [ ] Dependências instaladas (`npm install` → `@anthropic-ai/sdk@1.14.0`)
- [ ] Build — não existe etapa de build (correto)
- [ ] Testes (`npm test` → **194 testes, 194 aprovados, 0 falhas**)
- [ ] E2E (`npm run e2e`, com Playwright → **27/27**)
- [ ] Backend sobe (`npm start` → "JARVIS online → http://127.0.0.1:3000")
- [ ] Frontend abre (tela de inicialização → "JARVIS pronto." → TOQUE PARA INICIAR)
- [ ] `GET /api/health` → `{"ok":true}`

## Funcionalidades
- [ ] Diagnóstico (tecla D → 12 componentes com semáforo; tocar mostra motivo)
- [ ] Auto-diagnóstico ("faça um diagnóstico" → "Diagnóstico concluído…")
- [ ] Configurações abrem e salvam (tecla S; mudar tema persiste após recarregar)
- [ ] ⚠ Microfone (Diagnóstico → Testar microfone → "Microfone captando som")
- [ ] ⚠ Voz ("Configurações → Testar voz" fala)
- [ ] ⚠ Palmas (ativar em Configurações → duas palmas → "Sim?")
- [ ] Bíblia ("Bíblia" → plano a partir de Gênesis 2 ou do progresso restaurado)
- [ ] Progresso da Bíblia (passar página, recarregar, "onde parei?" → mesma página)
- [ ] Memória ("lembre que…" → "o que você lembra sobre…")
- [ ] Tarefas ("me lembra de estudar às 19h" → "quais são minhas tarefas?")
- [ ] ⚠ Notícias, câmbio, combustíveis (com internet real: valores com data e fonte; sem acesso: mensagem de indisponibilidade, nunca valor inventado)
- [ ] Modo silencioso ("fique silencioso" / "volte a falar")
- [ ] Modo offline (desligar internet → banner; parar servidor → "SERVIDOR INACESSÍVEL" e contas ainda respondem)
- [ ] ⚠ PWA (Android: instalar pelo menu do Chrome; abre em tela cheia com ícone JARVIS)
- [ ] IA (sem `.env`: "IA não configurada" no diagnóstico; com chave: conversa responde)

## Dados persistentes
- [ ] `data/` restaurado do backup do usuário, se existir (`data/bible-state.json`, `data/memory.json`, `data/settings.json`, `data/personality.json`)
- [ ] `data/.secret.key` restaurada (só se houver memórias protegidas)
- [ ] `.env` recriado a partir de `.env.example` (segredos copiados manualmente, nunca pelo Git)
- [ ] Texto bíblico disponível (`npm run bible:download` ou primeiro uso com internet)

---

# PARTE 7 — AUDITORIA (v1 → Fase 2)

Base: commit `100c9ee`, 108/108 testes unitários passando, teste E2E 16/16.
"Testado" = coberto por teste automatizado que roda o código real. "Simulado" = parte do
caminho substituída por simulador (ex.: reconhecimento de fala no navegador headless).

| Funcionalidade | Implementada | Testada | Dependência | Problemas encontrados |
|---|---|---|---|---|
| Intenções / comandos | Sim (regex + contexto) | Unit (≈80 frases) | — | Faltavam: ajuda, status, silêncio, diagnóstico, meu dia, lembretes com data, "concluí essa", pausar/continuar fala, urgência. Sem tolerância a erros de transcrição ("notisias", "gazolina"). |
| Orquestrador | Parcial (brain.js) | Unit | — | Resultado não estruturado (sem `success/data/source/timestamp`); lógica de confirmação misturada ao fluxo. |
| IA (conversa livre) | Sim, só Anthropic | **Não testada com chave real** | API + chave | Provedor único; sem camada de provedores; status da IA não visível de forma clara. |
| Modo sem IA | Sim | Unit + E2E | — | Ok, mas urgência/emergência não tinha resposta local. |
| Tons | 7 modos diferentes do pedido | Unit | — | Faltavam RESENHA, NORMAL, URGENTE; "ajuda"/"ordem"/"conversa" fora do padrão pedido. |
| OUVIDO (Web Speech) | Sim | **Simulado** (E2E) | Navegador + internet | Estado "OUVINDO" era exibido antes do navegador confirmar `onstart`. Sem estados de microfone (ativo/inativo/sem permissão/indisponível). Sem teste real de microfone. |
| VOZ (síntese) | Sim | Simulado (E2E) | Vozes do aparelho | Sem pausar/continuar; "Pare" não funcionava enquanto o JARVIS falava (ninguém ouvia). |
| PALMAS | Sim (AudioWorklet) | Unit sintético + E2E com WAV real via microfone falso | Microfone + app em 1º plano | Sem intervalo mínimo e limiar ajustáveis na interface; sem abstração `WakeDetector`; palmas desligadas durante a fala (não dava para interromper batendo palmas). |
| Bíblia | Sim | Unit + E2E | Download do texto 1x | "Onde parei?" não informava versículo/página; sem "leia em voz alta" (modo leitura). |
| Notícias / RSS | Sim | Parsing unit; **fontes reais não acessíveis deste ambiente** | Internet | Ok; faltavam testes de rede (lenta, erro, inválido). |
| Câmbio | Sim (AwesomeAPI + PTAX) | Parsing com amostra real | Internet | Fallback PTAX sem teste automatizado. |
| Combustíveis | Sim (ANP CSV) | Parsing sintético | Internet (gov.br) | Uma única fonte; gov.br bloqueia acesso automatizado → sem fallback. |
| Memória | Sim | Unit + E2E | Disco local | "Esqueça isso" apagava a memória mais recente, não a referida na conversa. Dados sensíveis salvos em texto aberto após confirmação. |
| Tarefas | Parcial | Unit | — | Sem data/hora, lembrete, adiar, cancelar, editar por voz, "concluí essa". |
| Notificações | **Não** | — | Permissão do navegador | Inexistente. |
| Rotina "meu dia" | **Não** | — | — | Inexistente. |
| Modo silencioso | **Não** (só desligando voz nas configurações) | — | — | — |
| Status / ajuda por voz | Parcial | — | — | "ajuda" e "status" não eram reconhecidos. |
| Diagnóstico | Tela sim; auto-diagnóstico não | E2E | — | Sem teste ativo de microfone/voz/armazenamento; sem semáforo 🟢🟡🔴 por componente. |
| Casa | Arquitetura + Home Assistant | Unit (sem integração) | Home Assistant | Ok (nada simulado). |
| PWA | Manifest + SW | Parcial | HTTPS | Só ícone SVG (Android exige PNG 192/512 para instalação confiável); sem aviso de atualização; cache com versão fixa. |
| Offline | Parcial | E2E (servidor fora) | — | Sem banner "Modo offline"; sem fallback local no navegador quando o servidor some. |
| Segurança | Token, CSP, confirmação, modo seguro | Unit | — | **CSRF**: o servidor aceitava POST com qualquer Content-Type e de qualquer origem (um site malicioso poderia enviar comandos ao JARVIS em localhost). Mapa de rate-limit nunca era limpo (vazamento de memória). |
| Logs | Sim | E2E | — | Registrava trecho do texto do usuário (dado pessoal desnecessário). |
| Interface | Sim | E2E (PC + Pixel 7 emulado) | — | Estados LISTENING/SPEAKING com mesma cor do ONLINE; animação continuava rodando atrás de painéis em tela cheia no celular. |
| Android físico | — | **Não testado** | Aparelho | Nenhum teste em aparelho real é possível neste ambiente. |

## Resultado da Fase 2

| Problema da auditoria | Situação |
|---|---|
| CSRF (POST de qualquer origem/Content-Type) | **Corrigido**: só JSON + verificação de Origin; teste HTTP real |
| Mapa de rate-limit sem limpeza | **Corrigido** (limpeza periódica) |
| Logs com trecho do texto do usuário | **Corrigido** (só tamanho e intenção) |
| Provedor de IA único | **Corrigido**: camada `AI_PROVIDER` (anthropic, openai-compatível, ollama, none) |
| Resultado não estruturado | **Corrigido**: orquestrador com `{success,intent,module,data,message,source,timestamp}` |
| Comandos ausentes (ajuda, status, silêncio, diagnóstico, meu dia, lembretes, pausar) | **Implementados** e testados |
| Erros de transcrição | **Tolerância** conservadora (lista de formas válidas para não "corrigir" demais) |
| Tons fora do pedido | **7 tons**: sério, normal, resenha, técnico, estudo, desabafo, urgente (com resposta local de emergência) |
| "OUVINDO" antes do navegador ouvir | **Corrigido**: estado só após `onstart`; estados do microfone ATIVO/INATIVO/SEM PERMISSÃO/INDISPONÍVEL |
| "Pare" não funcionava durante a fala | **Corrigido**: interrupção por voz (frases curtas) e por duas palmas; pausar/continuar |
| Palmas sem intervalo mínimo/limiar na interface; sem WakeDetector | **Corrigido**: configurações + `WakeDetector` / `BrowserWakeDetector` / `AndroidNativeWakeDetector` (ponte para app futuro) |
| Combustíveis com fonte única | **Corrigido**: semanal → série mensal (ANP) → última pesquisa **rotulada**, nunca como atual. Sem burlar bloqueio anti-robô do gov.br |
| Tarefas sem data/lembrete | **Implementado**: datas em português, agendador, adiar/cancelar/editar/concluir, notificações via Service Worker |
| Dados sensíveis em texto aberto | **Corrigido**: AES‑256‑GCM, mascarados, revelação só com confirmação, nunca falados nem enviados à IA |
| "Esqueça isso" apagava a mais recente | **Corrigido**: usa a memória referida na conversa |
| PWA só com SVG | **Corrigido**: PNG 192/512/maskable/apple-touch, manifest completo, atalhos, aviso de atualização |
| Sem banner/fallback offline | **Corrigido**: "MODO OFFLINE" / "SERVIDOR INACESSÍVEL" + respostas locais no navegador |
| Núcleo com estados parecidos; animação atrás de painéis | **Corrigido**: visual próprio por estado; animação pausada quando coberta no celular |
| Teste em Android físico | **Continua NÃO TESTADO** (impossível neste ambiente) |

---

# PARTE 8 — HISTÓRICO DO QUE O USUÁRIO PEDIU (para entender o contexto)
1. **Fase 1:** construir do zero um JARVIS real (repositório estava vazio): voz, ouvido, duas palmas,
   cérebro com linguagem natural, personalidade com tons, memória, módulos CASA/ENGENHARIA/MOTOR,
   BÍBLIA com plano diário começando em Gênesis 2 (Gn 2–4, depois 5–7, 8–10…, nunca avançar sozinho,
   "passe a página"/"volta"), NOTÍCIAS ("Notícias" → câmbio dólar/euro/libra, gasolina e diesel no
   Tocantins e Brasil, 3–5 notícias do Brasil, 3–5 do mundo, 1 curiosidade, perguntar se quer aprofundar),
   interface futurista, diagnóstico, configurações, logs, segurança, PWA, testes e relatório.
2. **Fase 2:** auditoria completa e evolução sem reconstruir: orquestrador com resultado estruturado,
   IA multi-provedor (AI_PROVIDER/AI_API_KEY/AI_MODEL), modo sem IA honesto, contexto real, estados do
   microfone, teste de microfone, palmas configuráveis + abstração WakeDetector (Browser + futuro
   AndroidNative), PWA instalável, offline, voz (pausar/parar/silêncio), tarefas e lembretes com data,
   notificações, "meu dia", 7 tons (sério, normal, resenha, técnico, estudo, desabafo, urgente),
   diagnóstico com semáforo e auto-diagnóstico, "status", "ajuda", fallbacks de combustível, segurança.
   Tudo entregue; teste final de 27 etapas.
3. Imagem-resumo (`resumo-jarvis.png`).
4. **Transferência:** documentar tudo para outra conta sem perder nada (estes documentos).
5. Este arquivo único.

Durante a Fase 2, uma tentativa de imitar um navegador (User-Agent) para passar pelo bloqueio
anti-robô do gov.br foi **bloqueada pelo sistema de permissões e removida** — não refazer.

# FIM — se algo neste texto divergir do código real, o CÓDIGO e os testes são a verdade:
# registre a divergência para o usuário em vez de "corrigir" sem avisar.
