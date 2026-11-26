// PALMAS — algoritmo de detecção de DUAS PALMAS (puro, sem DOM: testável no Node).
//
// Cada "quadro" de áudio (~5 ms) traz: rms (energia), peak (pico absoluto) e
// hf (fração de energia em altas frequências, via derivada do sinal).
// Uma palma válida precisa de:
//   1. ataque súbito: energia sobe bruscamente em relação ao quadro anterior;
//   2. amplitude acima do limiar adaptativo (piso de ruído × fator) e do mínimo absoluto;
//   3. duração curta (decai em até maxClapMs) — fala e música são sustentadas;
//   4. conteúdo de alta frequência alto (palma é ruído impulsivo de banda larga);
// Duas palmas válidas formam o comando se:
//   5. intervalo entre ataques entre minGapMs e maxGapMs;
//   6. intensidades semelhantes (razão de picos < 3,5×);
//   7. NÃO houver terceira palma logo em seguida (aplauso/ritmo é rejeitado);
//   8. respeitado o tempo de espera (cooldown) após uma ativação.
export const DEFAULTS = {
  sensitivity: 0.6, // 0 (difícil) … 1 (fácil)
  minGapMs: 120,
  maxGapMs: 700,
  maxClapMs: 110,
  confirmMs: 350, // janela para garantir que não veio a 3ª palma
  cooldownMs: 2500,
  hfMin: 0.18,
  thresholdOverride: 0,
  attackRatio: 3.2,
  // Modo RIGOROSO (JARVIS dormindo): só acorda com duas palmas fortes e nítidas em
  // ambiente calmo — barulhos de casa, fala, TV, portas e batidas não acordam.
  strict: false,
};
const STRICT = { thr: 1.8, attackRatio: 5, hfMin: 0.3, maxClapMs: 80, similar: 2.2, minGapMs: 150, maxGapMs: 650, quietBefore: 3 };

export class ClapDetector {
  constructor(opts = {}) {
    this.configure(opts);
    this.floor = 0.004;
    this.prevRms = 0;
    this.state = 'idle'; // idle | clap | sustained
    this.claps = [];
    this.pendingAt = null;
    this.lastFire = -Infinity;
    this.cur = null;
    this.ambient = 0.004; // energia média dos últimos ~300 ms (para exigir calma antes da 1ª palma)
  }

  configure(opts = {}) {
    this.o = { ...DEFAULTS, ...(this.o || {}), ...opts };
    const s = Math.min(1, Math.max(0, this.o.sensitivity));
    this.ratio = 16 - s * 11; // 16× (pouco sensível) … 5× (muito sensível) acima do piso
    // Limiar manual (0 = automático pela sensibilidade). Pico mínimo na escala 0..1.
    this.absMin = this.o.thresholdOverride > 0 ? this.o.thresholdOverride : 0.22 - s * 0.17;
  }

  threshold() { return Math.max(this.absMin, this.floor * this.ratio * 2.2) * (this.o.strict ? STRICT.thr : 1); }

  /** Processa um quadro. Retorna eventos: {type:'clap'|'double'|'reject', ...} */
  process({ rms, peak, hf = 0.5, t }) {
    const events = [];
    const thr = this.threshold();

    // Confirmação pendente: dispara se nenhuma 3ª palma chegou a tempo.
    if (this.pendingAt != null && t - this.pendingAt >= this.o.confirmMs && this.state === 'idle') {
      this.pendingAt = null;
      this.claps = [];
      this.lastFire = t;
      events.push({ type: 'double', t });
    }

    const strict = !!this.o.strict;
    if (this.state === 'idle') {
      const attack = rms > Math.max(this.prevRms, this.floor) * (strict ? STRICT.attackRatio : this.o.attackRatio);
      // Rigoroso: a 1ª palma precisa vir depois de um momento calmo (barulho contínuo não vale).
      const calm = !strict || this.claps.length > 0 || this.ambient < this.floor * STRICT.quietBefore;
      if (peak >= thr && attack && calm && t - this.lastFire >= this.o.cooldownMs) {
        this.state = 'clap';
        this.cur = { start: t, peak, peakRms: rms, hfSum: hf, n: 1 };
      } else if (rms < this.floor * 4) {
        // Atualiza o piso de ruído apenas com som "calmo" (palmas não sobem o piso).
        this.floor = Math.max(0.0008, this.floor * 0.995 + rms * 0.005);
      }
    } else if (this.state === 'clap') {
      const c = this.cur;
      c.peak = Math.max(c.peak, peak); c.peakRms = Math.max(c.peakRms, rms); c.hfSum += hf; c.n += 1;
      const dur = t - c.start;
      if (rms < c.peakRms * 0.22 || rms < this.floor * 2.5) {
        this.state = 'idle';
        const hfAvg = c.hfSum / c.n;
        if (hfAvg < (strict ? STRICT.hfMin : this.o.hfMin)) events.push({ type: 'reject', reason: 'pouca alta frequência (voz/batida grave)', t });
        else events.push(...this.#onClap({ t: c.start, peak: c.peak, dur }));
      } else if (dur > (strict ? STRICT.maxClapMs : this.o.maxClapMs)) {
        this.state = 'sustained';
        this.claps = []; this.pendingAt = null;
        events.push({ type: 'reject', reason: 'som sustentado (fala/música)', t });
      }
    } else if (this.state === 'sustained') {
      if (rms < this.floor * 3 || peak < thr * 0.35) this.state = 'idle';
    }
    this.prevRms = rms;
    this.ambient = this.ambient * 0.985 + rms * 0.015;
    return events;
  }

  #onClap(clap) {
    const ev = [{ type: 'clap', t: clap.t, peak: clap.peak }];
    if (this.pendingAt != null) {
      // 3ª palma dentro da janela de confirmação → padrão rítmico/aplauso
      if (clap.t - this.claps[this.claps.length - 1].t <= this.o.maxGapMs) {
        this.pendingAt = null; this.claps = [];
        ev.push({ type: 'reject', reason: 'mais de duas palmas', t: clap.t });
        this.claps = [];
        return ev;
      }
    }
    const prev = this.claps[this.claps.length - 1];
    if (prev) {
      const gap = clap.t - prev.t;
      const strict = !!this.o.strict;
      if (gap < (strict ? STRICT.minGapMs : this.o.minGapMs)) return ev; // eco/reverberação da mesma palma
      const similar = Math.max(prev.peak, clap.peak) / Math.min(prev.peak, clap.peak) < (strict ? STRICT.similar : 3.5);
      if (gap <= (strict ? STRICT.maxGapMs : this.o.maxGapMs) && similar) {
        this.claps.push(clap);
        this.pendingAt = clap.t;
        return ev;
      }
      if (!similar) ev.push({ type: 'reject', reason: 'intensidades muito diferentes', t: clap.t });
    }
    this.claps = [clap];
    this.pendingAt = null;
    return ev;
  }
}

/** Calcula rms, pico e fração de alta frequência de um bloco de amostras. */
export function analyzeBlock(samples) {
  let sum = 0, peak = 0, dsum = 0, prev = samples[0] || 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    sum += x * x;
    const a = x < 0 ? -x : x;
    if (a > peak) peak = a;
    const d = x - prev; dsum += d * d; prev = x;
  }
  const rms = Math.sqrt(sum / samples.length);
  // Derivada enfatiza altas frequências: para ruído branco dsum/sum ≈ 2; para tons graves ≈ 0.
  const hf = sum > 1e-12 ? Math.min(1, dsum / sum / 2) : 0;
  return { rms, peak, hf };
}
