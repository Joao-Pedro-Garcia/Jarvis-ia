// ANEXOS — imagens (até 5) ou 1 vídeo para o JARVIS analisar.
// Tudo é preparado aqui no celular antes de enviar:
//   • imagem: reduzida para no máximo 1280 px (JPEG) — rápido e dentro do limite do Groq;
//   • vídeo: 4 quadros espalhados pelo vídeo (768 px) + o próprio vídeo para o Whisper
//     transcrever o áudio (se tiver até 24 MB).
const MAX_IMAGES = 5;
const MAX_COPY = 80 * 1024 * 1024; // vídeos maiores ficam só como referência
export const READ_HELP = 'O Android não deixou ler esse arquivo. Escolha pela Galeria (não pelo Google Fotos/nuvem), ou tire um print da imagem e envie o print.';

/** Erros do navegador (em inglês) → português. */
export function friendlyError(err) {
  const m = String(err?.message || err || '');
  if (err?.name === 'NotReadableError' || /could not be read|NotReadable|permission/i.test(m)) return READ_HELP;
  if (err?.name === 'NotFoundError' || /not be found/i.test(m)) return 'O arquivo não foi encontrado (foi apagado ou movido). Escolha de novo.';
  return m || 'Não consegui preparar o anexo.';
}

/** Copia os arquivos escolhidos para a memória imediatamente (a permissão do Android expira). */
export async function copyFiles(files) {
  const copies = []; let failed = 0;
  for (const f of files) {
    if (f.size > MAX_COPY) { copies.push(f); continue; }
    try { copies.push(new File([await f.arrayBuffer()], f.name || 'arquivo', { type: f.type || (/\.(heic|heif)$/i.test(f.name) ? 'image/heic' : '') })); } catch { failed++; }
  }
  return { copies, failed };
}
const MAX_VIDEO_AUDIO = 24 * 1024 * 1024;

function canvasJpeg(source, w, h, max, quality) {
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

const readAsDataUrl = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
const loadImg = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('imagem ilegível')); i.src = src; });

/**
 * Abre a foto de 3 jeitos (o Android varia muito): 1) createImageBitmap (rápido, gira a
 * foto certo); 2) FileReader → <img>; 3) se o navegador não sabe abrir (ex.: HEIC), manda o
 * arquivo original quando for pequeno — o Gemini entende HEIC.
 */
export async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { const b = await createImageBitmap(file, { imageOrientation: 'from-image' }); return { src: b, w: b.width, h: b.height }; } catch { /* tenta o próximo */ }
  }
  try { const img = await loadImg(await readAsDataUrl(file)); return { src: img, w: img.naturalWidth, h: img.naturalHeight }; } catch { /* tenta o próximo */ }
  return null;
}

export async function imageToDataUrl(file, max = 1280) {
  const d = await decodeImage(file);
  if (d) {
    let q = 0.82; let out = canvasJpeg(d.src, d.w, d.h, max, q);
    while (out.length > 3.5e6 && q > 0.4) { q -= 0.15; out = canvasJpeg(d.src, d.w, d.h, max, q); }
    d.src.close?.();
    return out;
  }
  // Não deu para abrir aqui: envia o original (HEIC/HEIF etc.) se couber no limite.
  if (file.size <= 3.4e6 && /^image\/(heic|heif|jpeg|png|webp)$/.test(file.type || '')) return readAsDataUrl(file);
  throw new Error(/heic|heif/.test(file.type || file.name || '') ? 'Essa foto está em HEIC e é grande demais para enviar sem converter. Tire um print dela e envie o print.' : 'Não consegui abrir essa imagem. Tente outra, ou tire um print dela e envie o print.');
}

/** Miniatura (data URL) para a pré-visualização — não depende de blob: nem do formato. */
export async function thumbnail(file) {
  if (/^video\//.test(file.type)) return null;
  const d = await decodeImage(file);
  if (!d) return null;
  const t = canvasJpeg(d.src, d.w, d.h, 160, 0.7);
  d.src.close?.();
  return t;
}

export async function videoFrames(file, n = 4, max = 768) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((resolve, reject) => { v.onloadedmetadata = resolve; v.onerror = () => reject(new Error('Não consegui abrir esse vídeo neste navegador.')); setTimeout(() => reject(new Error('O vídeo demorou demais para abrir.')), 15000); });
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const at = d * ((i + 0.5) / n);
      await new Promise((resolve) => { const done = () => { v.removeEventListener('seeked', done); resolve(); }; v.addEventListener('seeked', done); v.currentTime = Math.min(at, Math.max(0, d - 0.05)); setTimeout(done, 4000); });
      if (v.videoWidth) frames.push(canvasJpeg(v, v.videoWidth, v.videoHeight, max, 0.75));
    }
    if (!frames.length) throw new Error('Não consegui tirar imagens desse vídeo.');
    return { frames, duration: Math.round(d) };
  } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); }
}

/** Transcreve o áudio do vídeo pelo Whisper (servidor). Nunca lança: '' se não der. */
export async function videoTranscript(file) {
  if (!file || file.size > MAX_VIDEO_AUDIO || /quicktime/.test(file.type)) return '';
  try {
    const res = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': file.type || 'video/mp4' }, body: file });
    if (!res.ok) return '';
    return String((await res.json()).text || '');
  } catch { return ''; }
}

/** Arquivos escolhidos → itens prontos para a fila de anexos. */
export function classify(files, current = []) {
  const list = [...files];
  const video = list.find((f) => /^video\//.test(f.type));
  if (video) return { items: [{ kind: 'video', file: video }], note: list.length > 1 ? 'Vídeo: envio um por vez.' : '' };
  const imgs = list.filter((f) => /^image\//.test(f.type));
  const keep = current.filter((x) => x.kind === 'image');
  const room = MAX_IMAGES - keep.length;
  return { items: [...keep, ...imgs.slice(0, Math.max(0, room)).map((file) => ({ kind: 'image', file }))], note: imgs.length > room ? `No máximo ${MAX_IMAGES} imagens por vez.` : '' };
}

/** Prepara a fila para envio: { kind, images, transcript, duration, count }. */
export async function prepare(items, onStep = () => {}) {
  if (items[0]?.kind === 'video') {
    onStep('🎬 tirando imagens do vídeo…');
    const { frames, duration } = await videoFrames(items[0].file);
    onStep('✍ ouvindo o áudio do vídeo…');
    const transcript = await videoTranscript(items[0].file);
    return { kind: 'video', images: frames, transcript, duration, count: 1 };
  }
  onStep('📷 preparando a imagem…');
  const images = [];
  for (const it of items) images.push(await imageToDataUrl(it.file));
  return { kind: 'image', images, count: images.length };
}
