// Exemplo de comando personalizado (pode copiar este arquivo como modelo).
// Os padrões recebem o texto já normalizado: minúsculo e sem acentos.
import crypto from 'node:crypto';

export default {
  name: 'custom.coin',
  module: 'PERSONALIZADO',
  description: 'Cara ou coroa',
  aliases: ['Cara ou coroa', 'Joga uma moeda'],
  patterns: [/\b(cara ou coroa|jog\w+ uma moeda)\b/],
  permission: 'safe',
  action: async () => ({ text: crypto.randomInt(2) ? 'Deu cara.' : 'Deu coroa.' }),
};
