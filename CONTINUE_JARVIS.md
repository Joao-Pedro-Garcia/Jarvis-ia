# CONTINUE_JARVIS — leia isto primeiro

> **Você está assumindo o desenvolvimento de um projeto JARVIS existente. NÃO comece do zero.
> Leia este arquivo, depois `HANDOFF_JARVIS.md` e o restante da documentação antes de modificar
> qualquer código.**

Ordem de leitura obrigatória:

1. `CONTINUE_JARVIS.md` (este arquivo)
2. `HANDOFF_JARVIS.md` — manual completo (arquitetura, fluxos, módulos, diagnóstico)
3. `JARVIS_STATE.md` — estado atual: funcionando / limitado / pendente / erros
4. `PROJECT_INVENTORY.md` — todos os arquivos e o que cada um faz
5. `DECISIONS_JARVIS.md` — decisões já tomadas (não desfaça sem motivo)
6. `TRANSFER_CHECKLIST.md` — confirme que nada foi perdido
7. `docs/AUDITORIA.md` — auditoria da v1 e o que a Fase 2 corrigiu

Depois, **antes de qualquer alteração**:

```bash
git status                       # deve estar limpo
git log --oneline | head         # último commit esperado: ver JARVIS_STATE.md
npm install
npm test                         # esperado: 194 testes, 194 aprovados
npm start                        # abrir http://127.0.0.1:3000
```
Confirme que o resultado bate com `JARVIS_STATE.md`. Só então modifique código.

---

## 1. Onde o projeto está
- Repositório GitHub: `joao-pedro-garcia/jarvis-ia`
- **Branch com todo o trabalho: `ccr-8d48bdce-skxdvi`** (o `main` contém apenas o commit inicial;
  nada foi mesclado nem há pull request). Use: `git fetch origin ccr-8d48bdce-skxdvi && git checkout ccr-8d48bdce-skxdvi`.
- Código 100% versionado. Ficam **fora do Git** (por segurança/tamanho): `.env`, `data/`, `certs/`,
  `node_modules/`, `tests/e2e/screenshots/`. Veja a seção "Dados locais" em `HANDOFF_JARVIS.md`.

## 2. Como executar
```bash
npm install
cp .env.example .env    # opcional; sem ele roda no modo local (sem IA)
npm start               # http://127.0.0.1:3000 → "TOQUE PARA INICIAR"
```
Não existe etapa de build (HTML/CSS/JS servidos direto pelo Node).

## 3. Como testar
```bash
npm test                              # 194 testes (node:test), não precisam de internet
npm run e2e                           # 27 etapas no Chromium; exige Playwright instalado
```
Se o Playwright estiver instalado globalmente (como no ambiente original):
`NODE_PATH=$(npm root -g) node tests/e2e/run-e2e.js`.

## 4. Estado atual (resumo — detalhes em JARVIS_STATE.md)
Versão **2.0.0**. Fase 1 (construção) e Fase 2 (auditoria, robustez, Android/PWA) concluídas.
Todos os testes passam. Nada foi testado em Android físico, com IA real ou com as fontes externas
ao vivo (a rede do ambiente original bloqueava esses sites).

## 5. Problemas conhecidos
Lista completa em `JARVIS_STATE.md → ERROS CONHECIDOS`. Nenhum impede o uso.

## 6. Próximo trabalho recomendado
1. Testar em um Android físico (Termux ou servidor no PC com HTTPS) e calibrar as palmas.
2. Configurar uma IA real (`AI_PROVIDER`/`AI_API_KEY`) e validar conversa e resumo de notícias.
3. Validar notícias, câmbio e combustíveis com a internet real do usuário.
4. Só depois: melhorias (ver "Futuro" abaixo).

## 7. Funcionalidades concluídas
Cérebro/orquestrador, comandos em linguagem natural, 7 tons, IA multi-provedor, modo local,
ouvido (Web Speech), voz (síntese, pausar, parar, silêncio), duas palmas, Bíblia com plano diário
e continuidade, notícias/câmbio/combustíveis com fallbacks, memória (com criptografia de dados
sensíveis), tarefas e lembretes com data/hora, notificações, "meu dia", status, ajuda,
diagnóstico com semáforo e auto-diagnóstico, casa (Home Assistant), engenharia e motor
(cálculos locais), segurança (CSRF, token, modo seguro), PWA instalável, modo offline.

## 8. Funcionalidades em andamento
Nenhuma. O trabalho parou num ponto estável (todos os testes passando, tudo commitado).

## 9. Funcionalidades futuras (NÃO implementadas)
- App Android nativo com serviço em primeiro plano (palmas com tela bloqueada) — existe apenas
  a ponte `AndroidNativeWakeDetector`, inativa sem o app.
- Notificações com o app fechado (exigiria Web Push com servidor).
- Integrações de casa além do Home Assistant.

## Regras do usuário que continuam valendo
Funcionalidade real > efeito visual · nunca inventar dados, APIs ou testes · nunca dizer que testou o
que não testou · priorizar soluções **gratuitas** · não remover testes · não mudar a identidade visual
sem pedido · pedir confirmação para ações destrutivas · chaves só no `.env` do servidor.
