# JARVIS — Assistente Pessoal Inteligente

Assistente pessoal com voz, audição, **ativação por duas palmas**, interface futurista (HUD),
memória, comandos em linguagem natural, **plano de leitura da Bíblia com continuidade**,
resumo de **notícias / câmbio / combustíveis**, módulos de engenharia e motores, e base para
automação residencial.

- **Servidor:** Node.js 18+ puro (sem framework). Única dependência: `@anthropic-ai/sdk`.
- **Interface:** HTML/CSS/JS (módulos ES, sem etapa de build), PWA instalável no Android e PC.
- **Dados:** arquivos JSON locais em `data/` (não versionados).

---

## 1. Como executar

```bash
npm install
cp .env.example .env        # opcional: coloque sua ANTHROPIC_API_KEY
npm run bible:download      # opcional: baixa a Bíblia agora (senão baixa no primeiro uso)
npm start                   # http://127.0.0.1:3000
```

Abra no **Chrome** ou **Edge** (PC) ou no **Chrome do Android**, toque em **TOQUE PARA INICIAR**
(os navegadores exigem um toque para liberar áudio e microfone).

### Usar no celular (mesma rede Wi‑Fi)
O microfone só funciona em **HTTPS** ou `localhost`. Para acessar do celular:

```bash
mkdir certs && openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout certs/key.pem -out certs/cert.pem -subj "/CN=jarvis.local"
```
No `.env`: `HOST=0.0.0.0`, `HTTPS_KEY=./certs/key.pem`, `HTTPS_CERT=./certs/cert.pem` e
**defina `JARVIS_ACCESS_TOKEN`** (senão qualquer aparelho da rede pode usar seu JARVIS).
Acesse `https://IP-DO-PC:3000`, aceite o certificado e use “Adicionar à tela inicial”.

## 2. Configurar APIs (`.env`)

| Variável | Para quê | Obrigatória |
|---|---|---|
| `ANTHROPIC_API_KEY` | Cérebro conversacional (Claude, modelo `claude-opus-5-5` por padrão), resumo de notícias por IA, “detalhe a notícia”, pesquisa web | Não — sem ela o JARVIS funciona no **modo local** |
| `JARVIS_MODEL`, `JARVIS_EFFORT` | Modelo e esforço (`low` = respostas mais rápidas) | Não |
| `JARVIS_WEB_SEARCH` | `0` desliga a pesquisa web da IA | Não |
| `JARVIS_TIMEZONE` | Fuso para “leitura de hoje” (padrão `America/Araguaina`) | Não |
| `JARVIS_ACCESS_TOKEN` | Protege a API com token | Recomendado em rede |
| `HOME_ASSISTANT_URL` / `HOME_ASSISTANT_TOKEN` | Módulo CASA (Home Assistant) | Não |
| `BIBLE_SOURCE_URL`, `FUEL_GASOLINE_CSV`, `FUEL_DIESEL_CSV` | Trocar fontes de dados | Não |

A chave **nunca** vai para o navegador: todas as chamadas à IA passam pelo servidor.

Fontes de dados usadas (sem chave): câmbio **AwesomeAPI** (cotação comercial) com reserva na
**PTAX do Banco Central**; combustíveis **ANP — Levantamento de Preços** (dados abertos, últimas
4 semanas); notícias por **RSS** (Agência Brasil, g1, Folha, BBC News Brasil, DW) editáveis em
`config/news-sources.json`.

## 3. Permissões necessárias
- **Microfone** (ouvido e palmas) — pedido pelo navegador; requer HTTPS ou localhost.
- **Internet**: reconhecimento de fala do Chrome/Android (processado pelo serviço do navegador),
  IA, notícias, câmbio e combustíveis.
- A síntese de voz é local (vozes instaladas no aparelho).

## 4. Ativar com duas palmas
1. **Configurações → PALMAS → “Ativar com duas palmas”** (ou menu ☰ → “Palmas on/off”).
2. Bata **duas palmas** (intervalo de ~0,15 a 0,7 s). O JARVIS responde **“Sim?”** e começa a ouvir.
3. Calibre com o medidor **Nível do microfone** (painel Sistema): a linha laranja é o limiar.

Como evita falsos positivos (`public/js/modules/clap-detector.js`): ataque súbito de energia,
limiar adaptativo ao ruído ambiente, duração curta (fala/música são sustentadas), conteúdo de
alta frequência (batidas graves de porta/mesa são rejeitadas), intervalo mínimo/máximo
configurável, intensidades semelhantes, rejeição de 3ª palma (aplauso/ritmo) e tempo de espera.
O detector roda num **AudioWorklet** e pausa enquanto o JARVIS fala ou ouve.

## 5. Comando “Bíblia”
Diga ou digite: **“Bíblia”**, “quero ler a Bíblia”, “continue de onde parei”, “onde parei?”,
“passe a página” / “avança” / “próxima”, “volta a página” / “volta”, “próximo capítulo”,
“voltar capítulo”, “abra João 3” (leitura livre), “próxima leitura” (adiantar), “concluir leitura”.
No PC: **← →** viram a página. No celular: **deslize** para os lados.

### Como o progresso é salvo
Arquivo `data/bible-state.json`:
- Posição inicial **Gênesis 2**; 3 capítulos/dia (configurável) → Dia 1: Gn 2–4, Dia 2: Gn 5–7, Dia 3: Gn 8–10…
- A posição guardada é **capítulo + versículo**, então a página certa é retomada em qualquer tela.
- Ao passar da última página de um capítulo ele é marcado como concluído; ao terminar o último,
  aparece “Leitura de hoje concluída” e a próxima posição é salva.
- **Nunca avança sozinho**: se a leitura não foi concluída, no dia seguinte “Bíblia” continua nela.
  Se já concluiu hoje, só adianta se você pedir (“próxima leitura”).
- Sequência (🔥) conta dias consecutivos com leitura concluída.

## 6. Notícias
“**Notícias**” → câmbio (dólar, euro, libra, com horário e variação), combustíveis (Tocantins e
Brasil: gasolina comum, diesel S‑10 e diesel comum separados, com período e fonte), 3–5 notícias do
Brasil, 3–5 do mundo e 1 curiosidade; depois pergunta se quer aprofundar. Também: “como está o
dólar?”, “quanto está o diesel?”, “notícias do mundo”, “detalhe a segunda notícia”…
Regras implementadas: só matérias das últimas 36 h e com data; cache curto (câmbio 1 min, feeds
10 min, ANP 6 h — semanal); histórico de 4 dias evita repetição (“continua em destaque”); a IA só
pode resumir matérias reais dos feeds (cada item precisa apontar para uma matéria); se algo
falhar: “Não consegui confirmar a cotação atual neste momento.”

## 7. Outros módulos
- **Memória**: “lembre que…”, “lembre disso”, “o que você lembra sobre…”, “esqueça…” (pede
  confirmação), tarefas (“adicione uma tarefa…”, “minhas tarefas”). Painel para ver/editar/apagar.
  Senhas, CPF, cartões e tokens exigem confirmação antes de salvar.
- **Engenharia**: contas faladas (“15% de 230”, “raiz quadrada de 144”), conversões de unidades,
  Lei de Ohm — tudo local e exato; perguntas abertas vão para a IA em modo técnico.
- **Motor**: potência↔torque, cilindrada, consumo; diagnósticos via IA sempre com aviso de que
  remoto não é certeza.
- **Casa**: sem integração mostra tudo como **indisponível** (nada é simulado). Com Home Assistant
  configurado: “ligar a luz da sala”, “desligar a TV” (ações críticas pedem confirmação).
- **Segurança**: confirmação para ações importantes, **modo seguro** (confirma tudo e bloqueia a
  casa), token de acesso, limite de requisições, CSP, logs sem conteúdo privado completo.
- **Diagnóstico**: status de cada módulo, permissões, suporte do navegador e logs.

Atalhos (PC): **Espaço** falar · **Esc** parar fala/fechar · **/** digitar · **B** Bíblia · **N**
Notícias · **M** Memória · **S** Configurações · **D** Diagnóstico.

## 8. Como adicionar novos comandos
Em `server/brain/commands.js` (ou num arquivo novo importado por ele):

```js
registerCommand({
  name: 'clima.hoje', module: 'CLIMA', priority: 60,
  description: 'Previsão do tempo',
  aliases: ['Vai chover hoje?'],                 // exemplos (aparecem no painel Módulos)
  patterns: [/\b(vai chover|previsao do tempo)\b/],   // texto já normalizado (sem acentos)
  context: (sess) => true,                       // opcional: só vale em certo contexto
  params: (t, match, sess) => ({}),              // opcional
  permission: 'safe',                            // 'safe' | 'confirm' | 'restricted'
  mutates: false,                                // true = pede confirmação no modo seguro
  confirmText: (p) => null,                      // pergunta de confirmação
  action: async (params, ctx) => ({ text: 'Resposta…', speech: 'Fala…', ui: { panel: 'news' } }),
});
```
Adicione frases ao `tests/nlu.test.js` e rode `npm test`.

## 9. Arquitetura

```
server/
  index.js                 HTTP + API REST + SSE (eventos em tempo real) + estáticos
  core/                    eventos, logs, armazenamento JSON, configurações, http/cache, texto, datas
  brain/                   CÉREBRO: brain.js (fluxo), commands.js (registro), tone.js (tipo de conversa),
                           personality.js (prompt), llm.js (Claude API)
  modules/bible|news|memory|house|engineering|engine
public/
  js/core                  barramento de eventos, API, estado, configurações, logs do cliente
  js/modules               hearing (OUVIDO), voice (VOZ), clap + clap-detector + worklet (PALMAS), sons
  js/ui                    núcleo animado (canvas), leitor da Bíblia, notícias, painéis
config/personality.json    personalidade (nome, tom, humor, formalidade, detalhamento, modos)
config/news-sources.json   fontes RSS
```
Fluxo: `MICROFONE/PALMAS → OUVIDO → TRANSCRIÇÃO → CÉREBRO → INTENÇÃO → AÇÃO OU IA → resposta → VOZ + INTERFACE`.
Eventos: `VOICE_RECEIVED, COMMAND_DETECTED, BIBLE_OPENED, PAGE_NEXT, PAGE_PREVIOUS, CLAP_DETECTED,
ASSISTANT_STARTED/STOPPED, SPEECH_STARTED/FINISHED, MEMORY_UPDATED…` (cliente e servidor).

## 10. Testes
```bash
npm test          # 108 testes: intenções, Bíblia, palmas, matemática, notícias, memória, segurança
npm run e2e       # teste final no navegador (requer Playwright + Chromium)
```
O teste final abre o app no Chromium com um **microfone falso alimentado por um WAV com duas
palmas**, ativa pelo áudio real, conversa (reconhecimento de fala simulado com frases
roteirizadas), abre a Bíblia, passa/volta página, fecha, reabre e confere o progresso, testa
conversa, pergunta técnica, desabafo/mudança de tom, memória, diagnóstico/logs/permissões,
queda do servidor e layout de celular (Pixel 7) com gesto de deslizar.

## 11. Limitações conhecidas (honestas)
- **Reconhecimento de fala** depende do navegador: Chrome/Edge/Android funcionam (com internet);
  Firefox não suporta — use texto. No Android, o detector de palmas libera o microfone enquanto o
  reconhecimento de fala está ativo.
- **Palmas** com a tela do celular bloqueada: navegadores suspendem o microfone em segundo plano.
  Para “bater palmas de longe” deixe o JARVIS aberto em primeiro plano (ex.: PC ou tablet na tomada).
- **Sem `ANTHROPIC_API_KEY`**: não há conversa livre; desabafo e conversa recebem respostas
  locais limitadas (avisando isso); notícias usam seleção automática sem resumo por IA.
- **Combustíveis**: o JARVIS calcula a **média simples** das coletas da semana mais recente dos
  dados abertos da ANP; pode diferir levemente da “Síntese semanal” oficial. O site gov.br às vezes
  bloqueia acessos automatizados — nesse caso o JARVIS informa que não conseguiu obter os preços.
- **Texto bíblico**: Almeida Corrigida Fiel (ACF) do repositório público `thiagobodruk/biblia`
  (baixado para uso pessoal; não é redistribuído neste repositório). Reserva: bible-api.com (Almeida).
- **Casa**: só Home Assistant está implementado; outras plataformas exigem um adaptador novo em
  `server/modules/house/house.js`.
