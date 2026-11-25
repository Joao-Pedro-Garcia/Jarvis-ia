// Sinais sonoros curtos (confirmação de ativação, erro) gerados localmente.
let ctx = null;
function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }

function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  const c = ac(); const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}

export const sounds = {
  activate() { try { tone(880, 0, 0.12); tone(1320, 0.09, 0.18); } catch {} },
  done() { try { tone(1046, 0, 0.1, 'sine', 0.06); } catch {} },
  error() { try { tone(220, 0, 0.25, 'square', 0.05); } catch {} },
  unlock() { try { ac(); } catch {} },
};
