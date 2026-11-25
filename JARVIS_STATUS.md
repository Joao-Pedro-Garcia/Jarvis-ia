# JARVIS_STATUS — estado real (v2.1.0 · 25/11/2026)

Branch: `claude/desenvolvimento-anterior-mq06fb` · Testes: **221/221** automáticos (194 originais + 27 novos) ·
**34/34** etapas no navegador (27 originais + 7 novas).

Legenda: **TESTE REAL** = executado de verdade nesta sessão · **SIMULADO** = testado com resposta
falsa controlada (porque o recurso real não existe neste ambiente) · **NÃO TESTADO** = não foi possível testar.

> Ambiente de desenvolvimento: contêiner na nuvem **sem acesso** a notícias, câmbio, ANP, Ollama ou
> Hugging Face (rede bloqueada; só npm e GitHub respondem). Por isso, tudo que depende dessas fontes foi
> testado com respostas simuladas, e o diagnóstico daqui mostra corretamente **INTERNET LIMITADA**.

## FUNCIONANDO

| Sistema | O que funciona | Como foi testado |
|---|---|---|
| CÉREBRO | Orquestrador; entende frases naturais (todas as frases de exemplo do pedido chegam ao módulo certo); contexto ("avance/volte" seguem a Bíblia usada por último; "continue" retoma a leitura); confirmação de ações destrutivas; modo da resposta (CONVERSA, AJUDA, ESTUDO, TÉCNICO, DESABAFO, BRINCADEIRA, ORDEM, REVISÃO, CÁLCULO, BÍBLIA, URGENTE) | TESTE REAL (unitário + navegador) |
| MODO LOCAL INTELIGENTE | Sem IA: desabafo com escuta natural e acompanhamento (CVV 188 quando o assunto pesa), cumprimentos, piadas, base técnica local (motor/engenharia), "me explica isso" sobre o último cálculo, revisão do dia, tarefa em duas etapas, honestidade quando não sabe | TESTE REAL |
| IA LOCAL (arquitetura) | `AI_PROVIDER=auto` (padrão) detecta Ollama / LM Studio / llama.cpp, escolhe o modelo, conversa sem chave, re-detecta a cada 30 s, cai para o modo local se a IA parar | SIMULADO (servidor Ollama falso) — o Ollama real não pôde ser baixado aqui |
| MOTOR | Potência/torque, cilindrada, consumo, **distância/tempo/velocidade**, **autonomia**, **litros e custo de viagem**, **rpm ↔ velocidade por marcha, diferencial e pneu**, conceitos técnicos | TESTE REAL |
| ENGENHARIA | Contas, conversões, Lei de Ohm, **força, peso, pressão, energia cinética/potencial, trabalho, potência, aceleração, consumo elétrico** — sempre com fórmula, substituição, unidades e 3 algarismos significativos | TESTE REAL |
| BÍBLIA | Abre exatamente de onde parou; continue/passe a página/volte/próximo capítulo; plano diário; progresso salvo no servidor; sobrevive a fechar, recarregar e reiniciar o servidor | TESTE REAL (navegador) |
| MEMÓRIA | Lembrar, consultar, editar, apagar (com confirmação), dados sensíveis criptografados | TESTE REAL |
| TAREFAS | Criar (inclusive "crie uma tarefa" → "qual?"), listar, concluir ("marque como concluído"), adiar, cancelar (com confirmação), editar, lembretes, "o que tenho para hoje" | TESTE REAL |
| INTERNET | Estados ONLINE / INTERNET LIMITADA / OFFLINE / SERVIÇO EXTERNO INDISPONÍVEL, latência e pontos de teste (`/api/internet`) | TESTE REAL (aqui: LIMITADA, 1 de 3 pontos) + SIMULADO (online/offline) |
| FALLBACKS | Câmbio A→B→C→cache rotulado→indisponível; notícias multi-fonte → cache rotulado → indisponível; combustíveis semanal → mensal → última pesquisa rotulada; falhas não ficam presas no cache | SIMULADO (fontes bloqueadas aqui) |
| DIAGNÓSTICO | 16 componentes com OK / LIMITADO / INDISPONÍVEL / ERRO / NÃO VERIFICADO e motivo; nada aparece como OK sem evidência | TESTE REAL (navegador) |
| VOZ | Teste real: vozes instaladas, idioma, volume, reprodução e interrupção; botão **PARAR FALA**; pausar/continuar | Lógica TESTE REAL; áudio SIMULADO (o navegador de teste não tem vozes) |
| OUVIDO | Suporte, permissão, transcrição na tela, erros registrados; sem suporte: "Reconhecimento de voz não suportado neste navegador." + texto | SIMULADO (reconhecimento roteirizado) |
| PALMAS | Detector local (8 critérios), evento **PALMS_DETECTED** → "Sim?" → ouvir → responder; botão **Testar palmas** com AudioContext, limiar e pico | TESTE REAL com áudio de palmas pelo microfone falso do Chromium |
| MICROFONE | **Testar microfone**: PERMISSÃO → ACESSO → ÁUDIO RECEBIDO → NÍVEL (dBFS), com o motivo exato de cada falha | TESTE REAL (microfone falso do Chromium) |
| INTERFACE | HUD futurista preservado; estado no topo (ONLINE/OUVINDO/PROCESSANDO/FALANDO/OFFLINE/LIMITADO); PC (teclado, mouse) e celular (Pixel 7 emulado, toque) | TESTE REAL (navegador) |
| PWA | Manifest, ícones, service worker, offline; atualização segura (rede primeiro, sempre revalida, aviso "Atualizar") | TESTE REAL (instalação física NÃO TESTADA) |
| OFFLINE | Sem internet: Bíblia, memória, tarefas, contas, motor, engenharia, interface e comandos funcionam. Sem servidor: hora, data, contas, conversões e cálculos de motor/física no próprio navegador | TESTE REAL (navegador) |
| SEGURANÇA | CSRF, token opcional, sem comandos do sistema operacional, ações destrutivas com confirmação, chaves só no servidor, logs sem dados sensíveis | TESTE REAL |
| DADOS | Nenhum dado do usuário foi alterado. Novo utilitário de migração cria backup em `data/backups/` antes de mudar estrutura (não foi preciso migrar nada) | TESTE REAL |

## LIMITADO

| Item | Motivo |
|---|---|
| Conversa livre | Sem IA local aberta, o JARVIS responde no modo local (regras + base técnica). Para conversa livre gratuita: instalar o Ollama. |
| Reconhecimento de fala | Só Chrome, Edge e Android; no Chrome precisa de internet (processado pelo serviço do navegador). Firefox não tem. |
| Palmas e lembretes | Exigem o JARVIS aberto e em primeiro plano; com a tela bloqueada o navegador/Android pode cortar o microfone (limite do sistema, não contornado). |
| Android | Palmas e reconhecimento disputam o microfone: as palmas pausam enquanto ele ouve. |
| Notificações | Só com o app aberto ou em segundo plano; com o app fechado exigiria servidor de push. Se estiverem bloqueadas, o diagnóstico mostra **ATIVAR NOTIFICAÇÕES** e o passo a passo. |
| Combustíveis | O gov.br às vezes recusa acesso automatizado → "Dados indisponíveis no momento." (o bloqueio não é contornado). |
| IA do navegador | Experimental: só em Chrome recente para computador, com o recurso ativado. |
| Voz | Qualidade depende das vozes instaladas no aparelho; sem voz pt-BR o diagnóstico mostra LIMITADO com o motivo. |

## INDISPONÍVEL

| Item | Motivo |
|---|---|
| CASA | **AGUARDANDO CONFIGURAÇÃO**: nenhum Home Assistant configurado. A arquitetura cobre luzes, tomadas, sensores, temperatura, portas/fechaduras, câmeras e automações; nenhum dispositivo é simulado. |
| Notícias / câmbio / combustíveis **neste ambiente** | Rede bloqueada. Na internet do usuário devem funcionar (fontes gratuitas, sem chave). |

## PENDENTE (não feito / não testado)

- Teste em **Android físico**: microfone real, palmas reais, vozes reais, instalação do PWA.
- Teste com **Ollama real** no PC do usuário (a integração foi testada com servidor simulado).
- Teste das **fontes externas ao vivo** (AwesomeAPI, Banco Central, BCE, RSS, ANP).
- Notificações com o app fechado (Web Push).
- App Android nativo (palmas com tela bloqueada) — só existe a ponte `AndroidNativeWakeDetector`.
- O plano da Bíblia continua com **3 capítulos por dia** (Gn 2–4 → 5–7…), como decidido antes e como no exemplo "Gênesis 2–4". O pedido também menciona "≈2 capítulos por dia" e "4–6"; dá para ajustar em Memória → Progresso da Bíblia (capítulos por dia) ou confirmar a preferência.

## Erros conhecidos da v2.0 — situação

1. Bíblia mostrava "GN 2" no painel Memória → **corrigido** (mostra "Gênesis 2").
2. Microfone 🟢 quando INATIVO → **corrigido** ("⚪ EM ESPERA"; permissão mostrada separadamente).
3. Painel Módulos com status em inglês → **corrigido** (ONLINE, MODO LOCAL, AGUARDANDO CONFIGURAÇÃO…).
4. Teste de palmas não determinístico → **corrigido** (ruído com semente fixa).
5. Auto-diagnóstico gastava tokens de IA paga → **corrigido** (IA online só é chamada com `?ai=1`; IA local é testada de graça).
6. `resumo-jarvis.png` → mantido (documentação).
7. `API_FAILURE` e `TASK_UPDATED` nunca emitidos → **corrigido** (agora são emitidos).
8. `privacy.saveConversationLogs` e `notifications.enabled` sem uso → sem mudança (não removidos para não quebrar configurações salvas).

## Dependências e serviços

- **Dependências:** Node.js 18+ e `@anthropic-ai/sdk` (biblioteca gratuita, usada só se o provedor online opcional for escolhido). Testes de navegador usam Playwright (instalado à parte).
- **Serviços externos gratuitos, sem chave:** AwesomeAPI, Banco Central (PTAX), Banco Central Europeu (api.frankfurter.app), feeds RSS (Agência Brasil, g1, Folha, BBC Brasil, DW), ANP (dados abertos), texto da Bíblia (GitHub, uma vez). Opcionais: Ollama (local), Home Assistant (local).
- **Pagos:** nenhum é necessário.
