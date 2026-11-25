# Auditoria — JARVIS v1.0 (início da Fase 2)

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
