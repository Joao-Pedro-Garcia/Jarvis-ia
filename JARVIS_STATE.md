# JARVIS_STATE — estado atual

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
