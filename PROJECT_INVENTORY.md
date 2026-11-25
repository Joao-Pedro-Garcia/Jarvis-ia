# PROJECT_INVENTORY — todos os arquivos

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
