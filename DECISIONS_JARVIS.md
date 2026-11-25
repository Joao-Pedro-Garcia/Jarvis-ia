# DECISIONS_JARVIS — decisões já tomadas

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
