# HANDOFF_JARVIS — manual completo para a próxima conta

> Este arquivo descreve o projeto **como ele está**. Nada aqui é plano futuro, exceto onde
> marcado como **NÃO IMPLEMENTADO**. Estado resumido em `JARVIS_STATE.md`.

---

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
