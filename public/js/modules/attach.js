// ANEXOS — imagens (até 5) ou 1 vídeo para o JARVIS analisar.
// Tudo é preparado aqui no celular antes de enviar:
//   • imagem: reduzida para no máximo 1280 px (JPEG) — rápido e dentro do limite do Groq;
//   • vídeo: 4 quadros espalhados pelo vídeo (768 px) + o próprio vídeo para o Whisper
//     transcrever o áudio (se tiver até 24 MB).
const MAX_IMAGES = 5;
const MAX_VIDEO_AUDIO = 24 * 1024 * 1024;

function canvasJpeg(source, w, h, max, quality) {
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export async function imageToDataUrl(file, max = 1280) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Não consegui abrir essa imagem.')); i.src = url; });
    let q = 0.82; let out = canvasJpeg(img, img.naturalWidth, img.naturalHeight, max, q);
    while (out.length > 3.5e6 && q > 0.4) { q -= 0.15; out = canvasJpeg(img, img.naturalWidth, img.naturalHeight, max, q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
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
