  // ---------- Tonalité : détectée sur les boucles du looper (et sur l'extrait de DIGGING), affichée sur l'écran ----------
  // Méthode : on additionne l'énergie de chaque note (do, do#, ré…) puis on compare aux profils majeur / mineur (Krumhansl).
  const KEY_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KEY_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const KEY_NN = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const chromaCache = new WeakMap();
  function chromaOf(buf) {
    if (chromaCache.has(buf)) return chromaCache.get(buf);
    const N = 4096, L = buf.length, out = new Float32Array(12);
    if (L < N) { chromaCache.set(buf, out); return out; }
    const nf = Math.min(120, Math.floor(L / N)), step = Math.floor((L - N) / Math.max(1, nf - 1));
    const re = new Float32Array(N), im = new Float32Array(N), d0 = buf.getChannelData(0), d1 = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0);
    const r = buf.sampleRate, lo = Math.ceil(60 * N / r), hi = Math.floor(2000 * N / r), pcOf = new Int8Array(hi + 1);
    for (let k = lo; k <= hi; k++) pcOf[k] = ((Math.round(12 * Math.log2(k * r / N / 440)) + 69) % 12 + 12) % 12;
    for (let f = 0; f < nf; f++) {
      const p = f * step;
      for (let i = 0; i < N; i++) { re[i] = (d0[p + i] + d1[p + i]) * 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
      fft(re, im, false);
      for (let k = lo; k <= hi; k++) out[pcOf[k]] += Math.sqrt(Math.hypot(re[k], im[k]));
    }
    chromaCache.set(buf, out); return out;
  }
  function keyOfChroma(c) {
    let sum = 0; c.forEach(v => sum += v); if (sum <= 0) return null;
    const corr = (prof, t) => { let mx = 0, my = 0; for (let i = 0; i < 12; i++) { mx += c[i]; my += prof[i]; } mx /= 12; my /= 12; let num = 0, dx = 0, dy = 0; for (let i = 0; i < 12; i++) { const x = c[(i + t) % 12] - mx, y = prof[i] - my; num += x * y; dx += x * x; dy += y * y; } return num / Math.sqrt(dx * dy || 1); };
    let best = { r: -2 };
    for (let t = 0; t < 12; t++) { const a = corr(KEY_MAJ, t), b = corr(KEY_MIN, t); if (a > best.r) best = { r: a, t, m: false }; if (b > best.r) best = { r: b, t, m: true }; }
    return best.r < 0.5 ? null : { name: KEY_NN[best.t] + (best.m ? "m" : ""), tonic: best.t, minor: best.m, r: best.r };
  }
  // boucles du looper : recalcul discret quand les pistes changent
  const TONAL = { loop: null, sig: "", t: null };
  function scheduleKey() {
    clearTimeout(TONAL.t);
    TONAL.t = setTimeout(() => {
      const ls = LP.layers.filter(l => !l.muted && l.buf), sig = ls.map(l => l.buf.length + ":" + l.vol).join("|") + "#" + ls.length;
      if (sig === TONAL.sig && ls.every(l => chromaCache.has(l.buf))) return;
      TONAL.sig = sig;
      const c = new Float32Array(12);
      ls.forEach(l => { const x = chromaOf(l.buf); let s = 0; x.forEach(v => s += v); if (s > 0) for (let i = 0; i < 12; i++) c[i] += x[i] / s * (l.vol || 1); });
      TONAL.loop = ls.length ? keyOfChroma(c) : null;
      try { drawKeyFromLoop(); } catch (e) {}
      if (TONAL.loop && tab === "loops") lcd("lcdLoop", "TONALITÉ", `${TONAL.loop.name} (estimée sur les boucles)`);
    }, 1200);
  }
  const keyTag = () => TONAL.loop ? " · " + TONAL.loop.name : "";
