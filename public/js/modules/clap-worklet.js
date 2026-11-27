// AudioWorklet: roda na thread de áudio (preciso mesmo com a aba em 2º plano).
// Envia, a cada 256 amostras, a energia (rms), o pico e a fração aguda (hf). Se pedirem
// ("pcm": usado para ouvir "Jarvis" pelo mesmo microfone das palmas), envia também as amostras.
class ClapAnalyzer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(256); this.len = 0; this.pcm = false;
    this.port.onmessage = (e) => { if (e.data && typeof e.data.pcm === 'boolean') this.pcm = e.data.pcm; };
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.len++] = ch[i];
      if (this.len === this.buf.length) {
        let sum = 0, peak = 0, dsum = 0, prev = this.buf[0];
        for (let k = 0; k < this.len; k++) {
          const x = this.buf[k]; sum += x * x; const a = Math.abs(x); if (a > peak) peak = a; const d = x - prev; dsum += d * d; prev = x;
        }
        const rms = Math.sqrt(sum / this.len);
        const hf = sum > 1e-12 ? Math.min(1, dsum / sum / 2) : 0;
        this.port.postMessage(this.pcm ? { rms, peak, hf, t: currentTime * 1000, pcm: this.buf.slice(0) } : { rms, peak, hf, t: currentTime * 1000 });
        this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor('clap-analyzer', ClapAnalyzer);
