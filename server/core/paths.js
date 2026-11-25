import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = process.env.JARVIS_DATA_DIR ? path.resolve(process.env.JARVIS_DATA_DIR) : path.join(ROOT, 'data');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const PUBLIC_DIR = path.join(ROOT, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });
