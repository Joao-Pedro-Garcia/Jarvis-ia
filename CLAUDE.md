# JARVIS — memória do projeto (leia antes de qualquer coisa)

Este arquivo é a **memória entre conversas**. Todo chat novo deve lê-lo primeiro e mantê-lo
atualizado no fim de cada entrega (seção "Histórico recente" e "Pendências").
Documentos mais antigos e detalhados: `JARVIS_STATUS.md` (o que funciona/limitado), `README.md`
(como usar), `DECISIONS_JARVIS.md`, `HANDOFF_JARVIS.md`, `CONTINUE_JARVIS.md`, `PROJECT_INVENTORY.md`.

## Quem é o usuário e como falar com ele
- Fala **português do Brasil**, usa um **Poco M7 Pro (Android)** e manda **prints** da tela.
- Roda o JARVIS no próprio celular pelo **Termux** e abre no **Chrome** em `http://localhost:3000`.
- Não é programador: respostas curtas, passo a passo numerado, sem jargão. Diga **o que muda para ele**.
- Para atualizar no celular: no Termux **CTRL + C** e depois `jarvis` (o atalho faz `git pull`,
  liga o Ollama, instala o eSpeak e inicia). Mudou arquivo do navegador → **fechar a aba e abrir de novo**.
- Nunca repita chaves/senhas que ele colar no chat; oriente a colar direto no JARVIS.

## Regras que ele exigiu (valem sempre)
- **Nada pago obrigatório**, sem assinatura, sem cartão. Serviços gratuitos (Groq, Gemini, Open-Meteo).
- **Não fingir** que algo funciona; **nunca inventar** notícia, cotação, preço, clima, resultado, resposta de IA.
  Sem dados → dizer que não conseguiu confirmar.
- **Não apagar funcionalidades**, não recriar do zero, não perder dados do usuário; backup antes de migrar.
- **Não remover testes.** Ações destrutivas pedem confirmação. Não guardar dados sensíveis nos logs.
- Chaves só no servidor (criptografadas em `data/ai-online.json`). Manter o visual HUD futurista.
- Testar de verdade antes de dizer que está pronto; quando algo só foi testado com simulação, **avisar**.

## Como rodar e testar
- `npm start` (servidor em :3000). No celular: `sh scripts/celular.sh` ou o atalho `jarvis`.
- `npm test` → testes unitários (node:test) — hoje **330 passando**.
- E2E com navegador real: `NODE_PATH=$(npm root -g) node tests/e2e/run-e2e.js` → **34 etapas**.
  (o E2E usa microfone falso com palmas gravadas a cada 6 s e simula fala/síntese)
- Este ambiente de desenvolvimento **não tem internet** (Groq, Gemini, Edge, Open-Meteo bloqueados):
  tudo que depende deles é testado com `fetch` simulado. O teste real é no celular do usuário.
- Commits: em português, com o trailer de coautoria; branch de trabalho `claude/desenvolvimento-anterior-mq06fb`.

## Arquitetura (Node puro, ESM, sem build)
- `server/index.js` — HTTP + rotas `/api/*` + SSE (eventos para a tela). Cabeçalhos de segurança/CSP.
- `server/brain/` — cérebro: `orchestrator.js` (normaliza, acha comando, fala), `commands.js` (comandos por
  regex com prioridade), `brain.js` (fluxo: pendências → comando → IA), `llm.js` (provedores),
  `ai/groq.js` (IA online grátis: chat, Whisper, pesquisa "compound", visão), `ai/gemini.js` (visão grátis
  de reserva), `ai/local.js` (Ollama no celular), `local-mind.js` (respostas sem IA), `vision.js`,
  `auto-memory.js`, `greeting.js`.
- `server/modules/` — bible, news (+câmbio, combustíveis ANP), weather (Open-Meteo, Araguaína-TO),
  tasks (lembretes e **agenda com rotinas**), memory, house (Home Assistant), engine/engineering, voice (TTS).
- `server/core/` — settings, store (JSON em `data/`), secrets (AES-GCM), auto-backup, chats, logger, http-client.
- `public/` — PWA (service worker network-first; **suba `VERSION` em `public/sw.js`** quando mudar arquivos do
  navegador). `public/js/app.js` (tela/fluxo), `modules/` (hearing = ouvido, voice = fala, clap = palmas,
  attach = anexos, wake = ativação), `ui/panels.js` (Configurações, Agenda, Memória…).

## Como o JARVIS funciona hoje (estado em 28/11/2026)
- **IA**: Groq grátis (chave do usuário salva) como principal; IA do celular (Ollama `qwen2.5:0.5b`) de reserva
  sem internet. Respostas sociais instantâneas sem IA. Pesquisa na internet pelo Groq `compound` para fatos recentes.
- **Ouvido**: Whisper (Groq) grava pelo microfone da página. Toque no microfone = começa; **toque de novo = envia**
  (pausas não encerram). Palmas/“Jarvis” (sem as mãos) terminam pelo silêncio.
- **Fala**: voz do celular (o usuário escolheu a **Voz II masculina** do Google no Android; tom ~0,85).
  A voz neural do Edge foi **recusada com 403** no celular real → ficou só como opção experimental. Fala só a
  informação (sem fontes/horários). Detector de palmas e escuta do nome pausam enquanto ele fala.
- **Dormindo**: começa dormindo; acorda com **2 palmas** (principal) ou **"Jarvis"**; bom dia curto:
  "Bom dia, <nome>! O que vai ser hoje?". Dormindo, palmas em **modo rigoroso** (+ **calibração** com as palmas
  do usuário). **No Android o microfone é um só**: o reconhecimento do Google NÃO ouve o nome com as palmas
  ligadas; o "Jarvis" é ouvido pelo microfone das palmas e conferido pelo Whisper (trechos de 0,45–3,4 s).
- **Visão (📎)**: até 5 imagens ou 1 vídeo (4 quadros + áudio pelo Whisper). A conta Groq do usuário **não tem
  modelo de visão** → usa **Google Gemini** (chave grátis do AI Studio, formato novo começa com **"AQ."**; a
  conta liberada é a `/u/3`). Foto é copiada para a memória **no instante da escolha** (o Android revoga a leitura).
- **Agenda** (menu ⏰ ou voz "todo dia às 7h me lembre de…"), **memória automática** ("🧠 Anotei"),
  **backup diário** (14 dias; cópia em Documentos/JARVIS-backups se `termux-setup-storage`), **clima** de
  Araguaína-TO, notícias/câmbio/combustíveis, Bíblia (ACF local, plano diário), conversas estilo ChatGPT.

## Histórico recente (mais novo primeiro)
- Palmas no Android: microfone exclusivo; "Jarvis" via Whisper pelo mesmo microfone; religar com tentativas.
- Visão: procura modelo de visão na conta Groq (teste de 1 pixel); Gemini de reserva com troca de modelo em 503;
  chave colada com lixo/formato "AQ." aceita; foto copiada na escolha; HEIC vai direto ao Gemini.
- Anexar imagens/vídeos; calibração das palmas; modo rigoroso dormindo; agenda; memória automática;
  pesquisa na internet; backup; microfone toque-para-enviar; fala sem fontes; bom dia curto; clima.

## Pendências / próximos passos possíveis
- Confirmar no celular real: visão pelo Gemini respondendo; palmas acordando após calibrar; "Jarvis" pelo Whisper.
- Sugestões já oferecidas e ainda não feitas: controlar o celular pelo **Termux:API** (lanterna, bateria, alarme,
  SMS com confirmação), **Termux:Boot** (iniciar sozinho), ativação offline por **Vosk**.
- O usuário relatou "a Bíblia parou de funcionar" sem detalhes; nos testes ela funciona — pedir print se voltar.
