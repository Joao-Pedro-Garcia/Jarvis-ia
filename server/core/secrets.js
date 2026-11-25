// Criptografia de dados sensíveis (AES-256-GCM).
// Chave: JARVIS_SECRET_KEY (64 hex) ou arquivo data/.secret.key gerado
// automaticamente com permissão 0600. Melhor que texto aberto, mas quem tiver
// acesso ao disco E à chave consegue ler — documentado no README.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

let cachedKey = null;
function key() {
  if (cachedKey) return cachedKey;
  if (/^[0-9a-f]{64}$/i.test(process.env.JARVIS_SECRET_KEY || '')) return (cachedKey = Buffer.from(process.env.JARVIS_SECRET_KEY, 'hex'));
  const file = path.join(DATA_DIR, '.secret.key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return (cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex'));
}

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decrypt(box) {
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8');
}
