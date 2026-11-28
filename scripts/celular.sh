#!/usr/bin/env sh
# JARVIS no celular (Termux) — UM comando liga tudo:
#   1) impede o Android de fechar o Termux (termux-wake-lock)
#   2) baixa as atualizações do JARVIS (nunca mexe nos seus dados em data/)
#   3) liga a IA (Ollama) se estiver desligada e baixa o modelo só se faltar
#   4) inicia o JARVIS
# Na primeira vez cria o atalho "jarvis": depois é só digitar  jarvis
# Modelo: AI_MODEL (padrão qwen2.5:0.5b). Ex.: AI_MODEL=qwen2.5:1.5b jarvis
#
# Tudo fica dentro de main(): o shell lê a função inteira antes de executar, então
# o "git pull" pode atualizar este próprio arquivo sem atrapalhar a execução.

main() {
  MODEL="${AI_MODEL:-qwen2.5:0.5b}"
  ROOT="$(cd "$(dirname "$0")/.." && pwd)" || exit 1
  cd "$ROOT" || exit 1
  msg() { printf '\n  %s\n' "$*"; }
  ollama_up() { curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; }

  # Atalho "jarvis" (Termux: $PREFIX/bin já está no PATH)
  if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ] && [ ! -e "$PREFIX/bin/jarvis" ]; then
    printf '#!%s/bin/sh\nexec sh "%s/scripts/celular.sh" "$@"\n' "$PREFIX" "$ROOT" > "$PREFIX/bin/jarvis" && chmod +x "$PREFIX/bin/jarvis" \
      && msg "Atalho criado. Da próxima vez, digite só:  jarvis"
  fi

  # Ligar sozinho quando o celular reiniciar (app gratuito Termux:Boot, da F-Droid, aberto 1 vez)
  if [ -d "$HOME/.termux/boot" ] && [ ! -e "$HOME/.termux/boot/jarvis.sh" ]; then
    printf '#!%s/bin/sh\ntermux-wake-lock\nnohup sh "%s/scripts/celular.sh" > "$HOME/jarvis-boot.log" 2>&1 &\n' "${PREFIX:-/data/data/com.termux/files/usr}" "$ROOT" > "$HOME/.termux/boot/jarvis.sh" \
      && chmod +x "$HOME/.termux/boot/jarvis.sh" && msg "Pronto: o JARVIS vai ligar sozinho quando o celular reiniciar (Termux:Boot)."
  fi

  # 1) Não deixar o Android fechar o Termux
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

  # 2) Atualizações (se não houver internet, segue com a versão atual)
  if [ "${JARVIS_NO_UPDATE:-0}" != "1" ] && command -v git >/dev/null 2>&1; then
    if git pull --ff-only -q >/dev/null 2>&1; then msg "JARVIS atualizado."; else msg "Sem atualização agora (sem internet?) — seguindo com a versão atual."; fi
  fi
  [ -d node_modules ] || npm install --no-audit --no-fund --silent

  # Voz masculina offline de reserva (eSpeak), usada quando a voz própria não tiver internet
  if ! command -v espeak >/dev/null 2>&1 && ! command -v espeak-ng >/dev/null 2>&1 && command -v pkg >/dev/null 2>&1; then
    msg "Instalando a voz masculina offline de reserva (eSpeak)…"
    pkg install -y espeak >/dev/null 2>&1 || msg "Não consegui instalar o eSpeak agora (sem internet?)."
  fi

  # Comandos do celular (bateria, lanterna): pacote termux-api (precisa também do app Termux:API)
  if ! command -v termux-battery-status >/dev/null 2>&1 && command -v pkg >/dev/null 2>&1; then
    pkg install -y termux-api >/dev/null 2>&1 || true
  fi

  # 3) IA local (Ollama)
  if command -v ollama >/dev/null 2>&1; then
    if ! ollama_up; then
      msg "Ligando a IA (Ollama)…"
      nohup ollama serve > "$HOME/ollama.log" 2>&1 &
      i=0
      while [ "$i" -lt 30 ] && ! ollama_up; do sleep 1; i=$((i + 1)); done
      ollama_up || msg "A IA não respondeu em 30 s (veja ~/ollama.log). O JARVIS funciona no modo local."
    fi
    if ollama_up && ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$MODEL"; then
      msg "Baixando o modelo $MODEL (só na primeira vez)…"
      ollama pull "$MODEL" || msg "Não consegui baixar o modelo agora. O JARVIS funciona no modo local."
    fi
  else
    msg "Ollama não instalado: o JARVIS funciona no modo local. Para ter IA: pkg install ollama"
  fi

  # 4) Um JARVIS antigo ainda ligado (outra sessão do Termux) prenderia a porta 3000
  #    e o Chrome continuaria falando com a versão velha: desliga antes.
  if pkill -f "node server/index.js" 2>/dev/null; then msg "Desliguei o JARVIS antigo que estava aberto."; sleep 1; fi

  msg "Abra no Chrome:  http://localhost:3000     (para desligar: CTRL + C)"
  AI_MODEL="$MODEL" exec node server/index.js
}

main "$@"
exit
