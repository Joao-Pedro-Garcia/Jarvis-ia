// Gera um WAV mono 48 kHz com ruído ambiente e DUAS PALMAS (rajadas de ruído
// de banda larga com decaimento rápido) — usado como microfone falso no teste.
import fs from 'node:fs';
export function makeClapWav(file, { claps = [1.5, 1.82], total = 6, rate = 48000 } = {}) {
  const n = Math.floor(total * rate);
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let x = (Math.random() * 2 - 1) * 0.004; // ruído ambiente
    for (const c of claps) {
      const dt = t - c;
      if (dt >= 0 && dt < 0.09) x += (Math.random() * 2 - 1) * 0.85 * Math.exp(-dt / 0.012);
    }
    data[i] = Math.max(-1, Math.min(1, x)) * 32767;
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  Buffer.from(data.buffer).copy(buf, 44);
  fs.writeFileSync(file, buf);
}
