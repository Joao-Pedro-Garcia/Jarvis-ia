# JARVIS — Assistente Pessoal Inteligente (v2.1)

Assistente pessoal com voz, audição, **ativação por duas palmas**, interface futurista,
memória, tarefas e lembretes, **leitura da Bíblia com continuidade**, notícias, câmbio e
combustíveis, módulos de engenharia e motores, e base para casa inteligente.

- **Custo zero:** nada pago é obrigatório. IA **local e gratuita** (Ollama/LM Studio/llama.cpp),
  ou **modo local inteligente** sem IA nenhuma. Fontes de dados públicas e gratuitas (RSS, Banco
  Central, ANP). Voz e ouvido nativos do navegador.
- **Servidor:** Node.js 18+ puro. Única dependência: `@anthropic-ai/sdk` (biblioteca gratuita;
  só é usada se você escolher, opcionalmente, um provedor online).
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

### No celular (Termux) — um comando só
Depois da primeira instalação (Termux + `pkg install git nodejs ollama` + `git clone`):
```bash
cd ~/Jarvis-ia && npm run celular   # só na primeira vez
jarvis                              # das próximas vezes
```
O comando impede o Android de fechar o Termux, baixa as atualizações (sem mexer em `data/`),
liga o Ollama, baixa o modelo se faltar (`qwen2.5:0.5b`; outro: `AI_MODEL=qwen2.5:1.5b jarvis`)
e inicia o JARVIS. Abra `http://localhost:3000` no Chrome.

**Velocidade da IA no celular:** a resposta aparece palavra por palavra; cumprimentos respondem na
hora sem IA; na primeira vez com cada modelo o JARVIS mede 2, 4 e 8 núcleos e salva o mais rápido
(para medir de novo: diga “teste a velocidade da IA”).

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

## 3. IA gratuita (conversa livre)

Ordem de prioridade (tudo gratuito, nada obrigatório):

| # | Opção | Custo | Como ativar | Estado no diagnóstico |
|---|---|---|---|---|
| 1 | **IA local** (Ollama, LM Studio ou llama.cpp no seu PC) | grátis, roda offline | instale e deixe aberto — o JARVIS detecta sozinho | **IA LOCAL** |
| 2 | **IA do navegador** (Chrome com IA embutida, Prompt API) | grátis, no aparelho | automático quando o navegador oferece | **IA DO NAVEGADOR** |
| 3 | **Modo local inteligente** (regras, contexto, memória, cálculos, base técnica) | grátis, offline | sempre ativo | **IA INDISPONÍVEL** (o resto funciona) |
| — | Provedor online (Anthropic/OpenAI) — *opcional* | pode ter custo | `AI_PROVIDER` + `AI_API_KEY` no `.env` | **IA ONLINE** |

**IA local em 3 passos (recomendado):**
1. Instale o Ollama: <https://ollama.com/download> (gratuito, open source).
2. Baixe um modelo leve: `ollama pull llama3.2:3b` (≈2 GB; roda em PC comum sem placa de vídeo).
3. Deixe o Ollama aberto e inicie o JARVIS. O terminal e o diagnóstico mostram **IA LOCAL**.

`.env` (opcional): `AI_PROVIDER=auto` (padrão), `AI_MODEL=` (vazio = primeiro modelo de conversa
instalado), `AI_BASE_URL=` (outro computador da rede). O JARVIS volta a procurar a IA local a cada
30 s, então pode abrir o Ollama depois. Se a IA local parar no meio da conversa, ele avisa e
responde no modo local.

**Modo local inteligente (sem IA):** entende os comandos, acolhe desabafos com naturalidade
(escuta, acompanha a conversa e oferece o CVV 188 quando o assunto pesa), conta piadas leves,
explica conceitos de motor e engenharia de uma base local revisada (torque, potência, relação de
marcha, injeção, turbo, pressão, energia, lei de Ohm…), explica o último cálculo (“me explica
isso”) e, quando não sabe, **diz que não sabe** — nunca finge ser uma IA.

Provedores online continuam suportados (`AI_PROVIDER=anthropic|openai`, chave só no servidor),
mas **nenhuma função depende deles**. Para provedores novos, crie um arquivo em `server/brain/ai/`.

### Voz do JARVIS (masculina)
Padrão: **voz do celular** (natural e offline). Para ela ficar masculina, escolha no Android:
Configurações → Idiomas e entrada → Saída de texto para fala → Serviços de fala do Google → ⚙ →
Instalar dados de voz → Português (Brasil) → uma voz masculina (os passos também estão em Configurações → VOZ
e no comando “voz masculina”). Opções extras em Configurações → VOZ: *voz neural online* (experimental,
serviço não oficial do Edge — no teste real no celular foi recusada com HTTP 403) e *voz robótica offline*
(eSpeak, `pkg install espeak`).

### Começa dormindo · bom dia · clima
Ao abrir, o JARVIS **começa dormindo** (tela escura, mantida ligada para ouvir). Acorda com **duas palmas**
(principal) ou dizendo **“Jarvis”**: a tela acende, ele dá um **bom dia criativo** (frase da IA online quando
responde em até 2,5 s; senão frases próprias que não se repetem) com o **clima real** de agora e já fica ouvindo.
Desligue em Configurações → INTERFACE → “Começar dormindo”.
Clima: **Open-Meteo** (gratuito, sem chave), cidade padrão **Araguaína-TO** (`JARVIS_WEATHER_CITY/LAT/LON`).
Pergunte “como está o dia hoje?”, “vai chover?”, “previsão para amanhã”, “previsão da semana”. Sem dados, ele
diz que não conseguiu — nunca inventa.

## 4. O que funciona offline e online

| Sem internet (servidor acessível) | Precisa de internet |
|---|---|
| Interface, Bíblia já baixada, memória, tarefas e lembretes, contas, conversões, cálculos de motor e física, IA local (Ollama), modo local inteligente, rotina, revisão, configurações, voz | IA online opcional, notícias, câmbio, combustíveis (sem internet: cache **rotulado** com data), reconhecimento de fala do Chrome, Home Assistant fora da rede |

Estados da internet do servidor (diagnóstico e topo da tela): **ONLINE**, **INTERNET LIMITADA**
(parte dos pontos de teste responde ou latência alta), **OFFLINE**, e por serviço: **SERVIÇO EXTERNO
INDISPONÍVEL**. Rota `GET /api/internet` mostra latência e cada ponto de teste.

Se a internet cair aparece **“📡 MODO OFFLINE”**. Se o **servidor** ficar inacessível aparece
**“SERVIDOR INACESSÍVEL”** e o navegador ainda responde hora, data, contas, conversões e cálculos de motor/física, e mostra a
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
| 🔧 Engenharia / 🚗 Motor | “15% de 230”, “converta 100 km/h para m/s”, “12 volts e 4 ohms”, “potência com 300 Nm a 4000 rpm”, “se eu andar a 80 km/h durante 12 minutos, quantos km percorro?”, “quanto tempo para 150 km a 90 km/h”, “qual a força para 10 kg a 9,8 m/s²”, “pressão de 500 N em 2 m²”, “energia cinética de 1000 kg a 20 m/s”, “autonomia com 40 litros a 12 km/l”, “quanto gasto em 300 km com 10 km/l e gasolina a 6,20”, “quantos rpm a 100 km/h com marcha 0,8 diferencial 4,1 pneu 195/60 R15”, “o que é torque?”, “me explica isso” |
| 🧮 Cálculo / Revisão | “me ajude a calcular”, “faça uma conta”, “faça uma revisão”, “crie uma tarefa” (pergunta qual) |
| 💬 Conversa | “preciso conversar”, “estou mal hoje”, “conta uma piada”, “me ajuda com isso” — com IA local, conversa livre |
| 🏠 Casa | “ligar a luz da sala” (requer Home Assistant, gratuito; sem ele aparece **AGUARDANDO CONFIGURAÇÃO** — nenhum dispositivo é simulado) |

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
- **Câmbio (dólar, euro, libra):** fontes gratuitas, sem chave, em ordem: (A) AwesomeAPI (cotação
  comercial, horário e variação do dia) → (B) **PTAX do Banco Central** (oficial; variação contra o
  boletim anterior) → (C) **Banco Central Europeu** via api.frankfurter.app (referência diária) →
  (D) **última cotação obtida, rotulada “CACHE — NÃO CONFIRMADO AGORA”** com data e hora → mensagem
  “Não consegui confirmar a cotação atual neste momento.” Cache de 1 min; falhas não ficam em cache
  por mais de 60 s.
- **Combustíveis:** ANP — Levantamento de Preços. Ordem das fontes: (1) planilha semanal das
  últimas 4 semanas; (2) série mensal, localizada automaticamente na página de dados abertos da
  ANP. Mostra Tocantins e Brasil com **Gasolina comum, Diesel comum e Diesel S‑10 separados**,
  média simples, período e fonte. Pesquisa com mais de 14 dias recebe aviso. Se nada responder:
  **“Dados indisponíveis no momento. Não consegui confirmar os preços atuais.”** — a última pesquisa obtida pode aparecer, mas
  **separada e com a data**, nunca como atual. O portal gov.br às vezes recusa acessos automatizados;
  o JARVIS **não tenta contornar** esse bloqueio.
- **Notícias:** RSS de Agência Brasil, g1, Folha, BBC News Brasil e DW (`config/news-sources.json`).
  Só matérias com data e das últimas 36 h, com fonte e horário. Repetidas viram “continua em
  destaque”. Com IA, a seleção/resumo só pode usar matérias reais dos feeds. Resumo: 3–5 do Brasil,
  3–5 do mundo e 1 curiosidade. Se todas as fontes falharem: **“NÃO CONSEGUI CONFIRMAR AS NOTÍCIAS
  AGORA.”** e, se houver, as últimas notícias salvas (até 48 h) aparecem em um bloco **CACHE** com a
  data e hora em que foram obtidas.

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
npm test        # 221 testes automatizados (sem internet): 194 originais + 27 da v2.1
npm run e2e     # teste final no navegador (requer Playwright + Chromium) — 34 etapas
```

| Tipo | Cobertura |
|---|---|
| Unitários/integração (`tests/*.test.js`) | v2.1 (`tests/v21.test.js`): física/motor, frases do usuário → módulo, modo local inteligente, IA local (detecção Ollama/LM Studio simulada), estados LOCAL/ONLINE/INDISPONÍVEL, internet ONLINE/LIMITADA/OFFLINE, cache de falhas, câmbio BCE/PTAX/cache rotulado, notícias em cache, diagnóstico verdadeiro, casa, migração com backup; v2.0: intenções (~150 frases), orquestrador, Bíblia, memória, dados sensíveis, tarefas/datas/agendador, contas/conversões, parsing de APIs (amostra real da AwesomeAPI), fallbacks, rede lenta/fora/erro/JSON inválido, provedores de IA (simulados), segurança HTTP real (token, CSRF, path traversal), palmas (sinais sintéticos) |
| E2E (`tests/e2e/run-e2e.js`) | Chromium real; **palmas por áudio real** (WAV no microfone falso) no fluxo e no botão “Testar palmas” (evento `PALMS_DETECTED`); teste de microfone com `getUserMedia`; teste de voz (reprodução + interrupção); botão PARAR FALA; estado no topo; cálculos de motor e engenharia; desabafo e revisão sem IA; tarefa em duas etapas; modo offline (inclusive cálculo de motor sem servidor); recarregar página; reinício do servidor; persistência; layout Pixel 7; PWA |
| **Simulado** | reconhecimento de fala e síntese de voz no E2E (frases roteirizadas/fala interceptada); APIs de IA e fontes de dados nos testes unitários |
| **Não testado** | aparelho Android físico, instalação real do PWA, microfone físico, vozes reais, notificação do sistema (o Chromium sem tela nega a permissão), IA local real (Ollama não pôde ser baixado neste ambiente — a detecção e a conversa foram testadas com servidor simulado), IA do navegador (Chromium de teste não tem), fontes externas reais (bloqueadas neste ambiente de desenvolvimento) |

## 13. Estrutura
```
server/
  index.js              HTTP + API + SSE + estáticos (+ /shared)
  brain/                brain.js (entrada), orchestrator.js (pipeline), commands.js (registro),
                        tone.js (7 tons + emergência), personality.js, local-mind.js (modo local inteligente),
                        llm.js + ai/ (local.js = IA local gratuita; anthropic/openai opcionais)
  commands/             loader.js + custom/ (comandos personalizados)
  core/                 eventos, logs, store, settings, http/cache, health, selftest, secrets, when (datas)
  modules/              bible, news, memory, tasks, house, engineering, engine
shared/                 math.js, units.js, physics.js (usados pelo servidor e pelo navegador offline)
public/js/              core/ (bus, api, estado, offline-brain), modules/ (ouvido, voz, palmas, device, browser-ai, wake/),
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
| "IA INDISPONÍVEL" | Nenhuma IA local aberta | Instale e abra o Ollama (seção 3); o JARVIS detecta em até 30 s. Tudo o mais funciona no modo local |
| IA local lenta | Modelo grande para o PC | Use um modelo menor (`ollama pull llama3.2:1b`) e defina `AI_MODEL` |
| "NOTIFICAÇÕES BLOQUEADAS" | Permissão negada no navegador | Diagnóstico → **ATIVAR NOTIFICAÇÕES** e siga as instruções; depois “Verificar de novo” |
| Topo mostra "LIMITADO" | Internet do servidor limitada | Veja Diagnóstico → INTERNET (pontos de teste e latência) |
| "Não consegui confirmar a cotação/os preços atuais" | Fonte fora do ar ou bloqueando acesso | Normal; tente mais tarde (nada é inventado) |
| Bíblia não carrega no 1º uso | Sem internet para baixar o texto | `npm run bible:download` com internet |
| Pede token toda hora | `JARVIS_ACCESS_TOKEN` definido e token errado | Digite o token do `.env` |
| Interface antiga após atualizar | Cache do service worker | Toque em "Atualizar" no aviso, ou recarregue com Ctrl+Shift+R |
| Memórias protegidas ilegíveis | `data/.secret.key` perdida ou trocada | Restaure a chave original do backup |

## 16. Estado atual
v2.1.0: **221/221** testes e **34/34** etapas E2E. Estado detalhado e verdadeiro de cada módulo
(FUNCIONANDO / LIMITADO / INDISPONÍVEL / PENDENTE, com o motivo) em [`JARVIS_STATUS.md`](JARVIS_STATUS.md).

## 17. Continuação do desenvolvimento
Leia, nesta ordem: `JARVIS_STATUS.md` → `CONTINUE_JARVIS.md` → `HANDOFF_JARVIS.md` → `PROJECT_INVENTORY.md` →
`DECISIONS_JARVIS.md`. O trabalho da v2.1 está no branch `claude/desenvolvimento-anterior-mq06fb`
(o da v2.0, no `ccr-8d48bdce-skxdvi`).

## 18. Limitações conhecidas
- Reconhecimento de fala: Chrome/Edge/Android (online). Firefox não tem; Safari iOS é parcial. Use texto.
- No Android, palmas e reconhecimento disputam o microfone: as palmas pausam enquanto ele ouve; a
  interrupção por “pare” fica desligada se as palmas estiverem ativas (use duas palmas para interromper).
- Palmas/lembretes com o app fechado ou a tela bloqueada não são garantidos (limite do navegador).
- Média de combustíveis calculada pelo JARVIS pode diferir levemente da síntese oficial da ANP.
- Casa: apenas Home Assistant (gratuito).
- IA local depende do computador: modelos pequenos (1–3 B) rodam em PC comum, mas respondem em segundos e erram mais que IAs grandes.
- IA do navegador é experimental e só existe em versões recentes do Chrome para computador.
