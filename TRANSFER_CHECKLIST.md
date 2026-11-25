# TRANSFER_CHECKLIST — confirmar que nada foi perdido

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
