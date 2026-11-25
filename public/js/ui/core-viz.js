// Núcleo central animado (canvas 2D). Leve: limita FPS, pausa em 2º plano,
// reduz partículas no modo econômico e respeita "reduzir movimento".
const COLORS = {
  standby: [94, 242, 255], listening: [200, 255, 255], thinking: [255, 181, 71], speaking: [94, 242, 255], error: [255, 77, 109],
};

export function createCore(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, dpr = 1, raf = 0, last = 0;
  let state = 'standby';
  let level = 0, target = 0; // energia visual 0..1
  let fpsCap = 60, particlesOn = true, animOn = true;
  let color = [...COLORS.standby];
  let rot = 0;
  let covered = false; // pausado quando um painel cobre o núcleo (economia de bateria)
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let particles = [];

  function themeRgb() {
    const v = getComputedStyle(document.body).getPropertyValue('--accent-rgb').trim();
    return v ? v.split(',').map(Number) : COLORS.standby;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    const n = particlesOn ? (fpsCap < 40 ? 28 : 70) : 0;
    particles = Array.from({ length: n }, () => ({
      a: Math.random() * Math.PI * 2, r: 0.42 + Math.random() * 0.12, s: (Math.random() * 0.4 + 0.1) * (Math.random() < 0.5 ? -1 : 1), z: Math.random(),
    }));
  }

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function draw(ts) {
    raf = requestAnimationFrame(draw);
    if (document.hidden || covered) return;
    const minDt = 1000 / fpsCap;
    if (ts - last < minDt - 1) return;
    const dt = Math.min(64, ts - last || 16); last = ts;
    const speed = animOn && !reduce ? 1 : 0.15;

    // Alvo de energia por estado
    const t = ts / 1000;
    if (state === 'listening') target = Math.max(target * 0.96, 0.35 + Math.sin(t * 3) * 0.1);
    else if (state === 'speaking') target = Math.max(target * 0.92, 0.25 + Math.abs(Math.sin(t * 7.3)) * 0.35);
    else if (state === 'thinking') target = 0.45;
    else if (state === 'error') target = 0.6;
    else target = 0.12 + Math.sin(t * 1.2) * 0.04;
    level += (target - level) * 0.18;

    const goal = state === 'standby' || state === 'speaking' ? themeRgb() : COLORS[state];
    for (let i = 0; i < 3; i++) color[i] += (goal[i] - color[i]) * 0.08;
    const c = color.map(Math.round);

    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
    ctx.clearRect(0, 0, w, h);
    rot += dt * 0.00025 * speed * (state === 'thinking' ? 6 : state === 'listening' ? 2 : 1);

    // Halo
    const g = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 0.62);
    g.addColorStop(0, rgba(c, 0.35 + level * 0.4));
    g.addColorStop(0.45, rgba(c, 0.08 + level * 0.12));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2); ctx.fill();

    ctx.lineCap = 'round';
    // Anel externo com marcações
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot * 0.6);
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const long = i % 10 === 0;
      ctx.strokeStyle = rgba(c, long ? 0.55 : 0.18);
      ctx.lineWidth = long ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
      ctx.lineTo(Math.cos(a) * R * (long ? 0.86 : 0.89), Math.sin(a) * R * (long ? 0.86 : 0.89));
      ctx.stroke();
    }
    ctx.restore();

    // Arcos concêntricos girando em sentidos opostos
    const arcs = [
      { r: 0.8, w: 2, segs: 3, len: 0.7, sp: 1.0, a: 0.6 },
      { r: 0.72, w: 6, segs: 4, len: 0.35, sp: -1.6, a: 0.35 },
      { r: 0.64, w: 1.5, segs: 2, len: 1.2, sp: 2.4, a: 0.5 },
    ];
    for (const arc of arcs) {
      ctx.strokeStyle = rgba(c, arc.a + level * 0.3);
      ctx.lineWidth = arc.w;
      for (let s = 0; s < arc.segs; s++) {
        const start = rot * arc.sp * (state === 'thinking' ? 2.2 : 1) + (s / arc.segs) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(cx, cy, R * arc.r, start, start + arc.len); ctx.stroke();
      }
    }

    // Onda circular (reage à voz/escuta)
    const baseR = R * 0.5;
    ctx.beginPath();
    const pts = 96;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const n = Math.sin(a * 6 + t * 4 * speed) * 0.5 + Math.sin(a * 11 - t * 6 * speed) * 0.3 + Math.sin(a * 3 + t * 2) * 0.2;
      const amp = state === 'standby' ? 0.01 : 0.03 + level * 0.09;
      const rr = baseR * (1 + n * amp);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = 2;
    ctx.shadowColor = rgba(c, 0.9); ctx.shadowBlur = fpsCap < 40 ? 0 : 14;
    ctx.stroke(); ctx.shadowBlur = 0;

    // LISTENING: ondas que se expandem (o JARVIS está captando)
    if (state === 'listening') {
      for (let k = 0; k < 3; k++) {
        const ph = ((t * 0.9 + k / 3) % 1);
        ctx.strokeStyle = rgba(c, (1 - ph) * 0.55); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, R * (0.4 + ph * 0.55), 0, Math.PI * 2); ctx.stroke();
      }
    }
    // SPEAKING: barras radiais de áudio
    if (state === 'speaking') {
      ctx.lineWidth = 3;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const amp = (0.04 + level * 0.14) * (0.5 + 0.5 * Math.abs(Math.sin(t * 9 + i * 1.7)));
        ctx.strokeStyle = rgba(c, 0.7);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 0.53, cy + Math.sin(a) * R * 0.53);
        ctx.lineTo(cx + Math.cos(a) * R * (0.53 + amp), cy + Math.sin(a) * R * (0.53 + amp));
        ctx.stroke();
      }
    }
    // THINKING: pontos orbitando rápido
    if (state === 'thinking') {
      for (let k = 0; k < 6; k++) {
        const a = t * 4 + (k / 6) * Math.PI * 2;
        ctx.fillStyle = rgba(c, 0.9 - k * 0.12);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.44, cy + Math.sin(a) * R * 0.44, 3.2 - k * 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Núcleo interno
    const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.38);
    inner.addColorStop(0, rgba(c, 0.22 + level * 0.25));
    inner.addColorStop(1, rgba(c, 0.02));
    ctx.fillStyle = inner; ctx.beginPath(); ctx.arc(cx, cy, R * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(c, 0.25); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R * 0.38, 0, Math.PI * 2); ctx.stroke();

    // Partículas orbitando
    for (const p of particles) {
      p.a += p.s * dt * 0.0006 * speed * (1 + level * 3);
      const rr = R * (p.r + Math.sin(t + p.z * 9) * 0.01);
      const x = cx + Math.cos(p.a) * rr, y = cy + Math.sin(p.a) * rr * (0.94 + p.z * 0.06);
      ctx.fillStyle = rgba(c, 0.25 + p.z * 0.6);
      ctx.fillRect(x, y, 1.2 + p.z * 1.6, 1.2 + p.z * 1.6);
    }

    // Erro: interferência
    if (state === 'error' && Math.random() < 0.3) {
      ctx.fillStyle = rgba(c, 0.15);
      ctx.fillRect(cx - R * 0.6, cy - R * 0.6 + Math.random() * R * 1.2, R * 1.2, 2);
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  raf = requestAnimationFrame(draw);

  return {
    setState(s) { state = s; if (s === 'listening' || s === 'speaking') target = 0.7; },
    pulse(amount = 0.5) { target = Math.min(1, target + amount); },
    setCovered(v) { covered = !!v; },
    configure({ eco, particles: p, animations } = {}) {
      fpsCap = eco ? 24 : 60; particlesOn = p !== false && !eco; animOn = animations !== false; seed();
    },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
