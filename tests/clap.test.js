import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClapDetector, analyzeBlock } from '../public/js/modules/clap-detector.js';

const FRAME = 256 / 48; // ms por quadro (256 amostras a 48 kHz)

// Ruído pseudoaleatório com semente fixa: o teste é sempre igual (determinístico).
let seed = 20261125;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** Gera uma linha do tempo de quadros a partir de eventos sonoros. */
function timeline(totalMs, sounds, { noise = 0.003 } = {}) {
  const frames = [];
  for (let t = 0; t < totalMs; t += FRAME) {
    let rms = noise * (0.8 + rand() * 0.4), peak = rms * 3, hf = 0.5;
    for (const s of sounds) {
      const dt = t - s.at;
      if (dt < 0 || dt > s.dur) continue;
      if (s.kind === 'clap') {
        const env = Math.exp(-dt / 12); // decaimento rápido (~12 ms)
        rms = Math.max(rms, s.amp * 0.35 * env); peak = Math.max(peak, s.amp * env); hf = 0.65;
      } else if (s.kind === 'speech') {
        const env = Math.min(1, dt / 40); // ataque lento, sustentado
        rms = Math.max(rms, s.amp * 0.3 * env); peak = Math.max(peak, s.amp * env); hf = 0.12;
      } else if (s.kind === 'thud') { // batida grave (porta, mesa)
        const env = Math.exp(-dt / 15);
        rms = Math.max(rms, s.amp * 0.35 * env); peak = Math.max(peak, s.amp * env); hf = 0.05;
      }
    }
    frames.push({ rms, peak, hf, t });
  }
  return frames;
}

function run(frames, opts) {
  const d = new ClapDetector(opts);
  const events = [];
  for (const f of frames) events.push(...d.process(f));
  return events;
}
const clap = (at, amp = 0.6) => ({ kind: 'clap', at, amp, dur: 90 });
const doubles = (ev) => ev.filter((e) => e.type === 'double').length;

test('duas palmas → ativa uma vez', () => {
  const ev = run(timeline(2000, [clap(500), clap(800)]));
  assert.equal(doubles(ev), 1);
  assert.equal(ev.filter((e) => e.type === 'clap').length, 2);
});

test('uma palma só → não ativa', () => {
  assert.equal(doubles(run(timeline(2000, [clap(500)]))), 0);
});

test('três palmas seguidas (aplauso/ritmo) → não ativa', () => {
  assert.equal(doubles(run(timeline(2500, [clap(500), clap(750), clap(1000)]))), 0);
});

test('palmas muito espaçadas (> janela) → não ativa', () => {
  assert.equal(doubles(run(timeline(3000, [clap(500), clap(1500)]))), 0);
});

test('janela configurável: com maxGapMs 1200 as mesmas palmas ativam', () => {
  assert.equal(doubles(run(timeline(3500, [clap(500), clap(1500)]), { maxGapMs: 1200, confirmMs: 500 })), 1);
});

test('fala alta e sustentada → não ativa', () => {
  const ev = run(timeline(3000, [{ kind: 'speech', at: 300, amp: 0.7, dur: 700 }, { kind: 'speech', at: 1200, amp: 0.7, dur: 600 }]));
  assert.equal(doubles(ev), 0);
  assert.equal(ev.filter((e) => e.type === 'clap').length, 0);
});

test('batidas graves (porta/mesa) sem alta frequência → não ativa', () => {
  const ev = run(timeline(2000, [{ kind: 'thud', at: 500, amp: 0.7, dur: 90 }, { kind: 'thud', at: 800, amp: 0.7, dur: 90 }]));
  assert.equal(doubles(ev), 0);
});

test('palmas fracas abaixo do limiar → não ativa; sensibilidade alta → ativa', () => {
  const frames = timeline(2000, [clap(500, 0.12), clap(800, 0.12)]);
  assert.equal(doubles(run(frames, { sensitivity: 0.2 })), 0);
  assert.equal(doubles(run(frames, { sensitivity: 0.9 })), 1);
});

test('intensidades muito diferentes → não ativa', () => {
  assert.equal(doubles(run(timeline(2000, [clap(500, 0.9), clap(800, 0.1)]), { sensitivity: 1 })), 0);
});

test('cooldown: dois pares seguidos só ativam uma vez dentro do tempo de espera', () => {
  const ev = run(timeline(4000, [clap(300), clap(550), clap(1500), clap(1750)]), { cooldownMs: 2500 });
  assert.equal(doubles(ev), 1);
  const ev2 = run(timeline(6000, [clap(300), clap(550), clap(3800), clap(4050)]), { cooldownMs: 2500 });
  assert.equal(doubles(ev2), 2);
});

test('ruído ambiente alto adapta o limiar (TV ligada)', () => {
  const noisy = timeline(4000, [clap(2500, 0.15), clap(2800, 0.15)], { noise: 0.03 });
  assert.equal(doubles(run(noisy, { sensitivity: 0.6 })), 0); // palmas fracas no meio do ruído: ignora
  const loud = timeline(4000, [clap(2500, 0.9), clap(2800, 0.9)], { noise: 0.03 });
  assert.equal(doubles(run(loud, { sensitivity: 0.6 })), 1);
});

test('analyzeBlock: ruído branco tem alta frequência alta; senoide grave, baixa', () => {
  const white = Float32Array.from({ length: 256 }, () => rand() * 2 - 1);
  const low = Float32Array.from({ length: 256 }, (_, i) => Math.sin((2 * Math.PI * 100 * i) / 48000));
  assert.ok(analyzeBlock(white).hf > 0.6);
  assert.ok(analyzeBlock(low).hf < 0.01);
});

// ---------- Dormindo: detecção RIGOROSA (só palmas nítidas acordam) ----------
const strict = { strict: true };
test('rigoroso (dormindo): duas palmas fortes e nítidas acordam', () => {
  assert.equal(doubles(run(timeline(2500, [clap(800, 0.7), clap(1150, 0.7)]), strict)), 1);
});
test('rigoroso: palmas fracas/distantes, que acordariam no modo normal, não acordam', () => {
  const sounds = [clap(800, 0.19), clap(1100, 0.19)];
  assert.equal(doubles(run(timeline(2500, sounds))), 1, 'modo normal aceita');
  assert.equal(doubles(run(timeline(2500, sounds), strict)), 0, 'dormindo recusa');
});
test('rigoroso: batidas de porta/mesa e fala não acordam', () => {
  assert.equal(doubles(run(timeline(3000, [{ kind: 'thud', at: 600, amp: 0.8, dur: 90 }, { kind: 'thud', at: 900, amp: 0.8, dur: 90 }]), strict)), 0);
  assert.equal(doubles(run(timeline(3000, [{ kind: 'speech', at: 500, amp: 0.5, dur: 900 }, clap(1500, 0.7)]), strict)), 0);
});
test('rigoroso: estalos com intensidades bem diferentes não acordam', () => {
  assert.equal(doubles(run(timeline(2500, [clap(800, 0.9), clap(1100, 0.35)])), { ...strict }), 0);
});
test('rigoroso: ambiente barulhento (TV/música alta) não acorda com estalos no meio', () => {
  assert.equal(doubles(run(timeline(3000, [clap(1200, 0.7), clap(1500, 0.7)], { noise: 0.06 }), strict)), 0);
});
