  // ---------- Time-stretch : la portion choisie dure N temps sans changer de hauteur ----------
  // BEATS : découpe aux attaques et replace chaque tranche (batteries, breaks). MODERNE : WSOLA (nappes, voix, boucles mélodiques).
  const tsCache = new Map(), bufIds = new WeakMap(); let bufIdN = 0;
  const bufId = b => { if (!bufIds.has(b)) bufIds.set(b, ++bufIdN); return bufIds.get(b); };
  function tsKey(i) { const p = padParams[i], b = buffers[i]; return b ? [bufId(b), p.start, p.end, p.rev, p.fitBeats, p.fitMode, Math.round(curBpm() * 100)].join("|") : ""; }
  function stretched(i, force) {
    const c = tsCache.get(i), k = tsKey(i);
    if (c && c.key === k) return c.buf;
    if (force) { computeStretch(i); return tsCache.get(i).buf; }
    return null;
  }
  function computeStretch(i) {
    const p = padParams[i], base = buffers[i], b = p.rev ? reversed(base) : base;
    let a = Math.floor(p.start * b.length), e = Math.ceil(p.end * b.length);
    if (p.rev) { const a2 = b.length - e, e2 = b.length - a; a = a2; e = e2; }
    const inCh = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c).subarray(a, e));
    const outLen = Math.max(64, Math.round(p.fitBeats * 60 / curBpm() * b.sampleRate)), ratio = outLen / Math.max(1, e - a);
    const outCh = p.fitMode === 1 ? stretchBeats(inCh, ratio, outLen, b.sampleRate) : stretchWsola(inCh, ratio, outLen);
    const o = ctx.createBuffer(outCh.length, outLen, b.sampleRate);
    outCh.forEach((d, c) => o.getChannelData(c).set(d));
    tsCache.set(i, { key: tsKey(i), buf: o });
  }
  function stretchWsola(chs, ratio, outLen) {
    const N = 2048, Hs = 1024, tol = 512, L = 1024, inLen = chs[0].length, nc = chs.length;
    const win = new Float32Array(N); for (let n = 0; n < N; n++) win[n] = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N);
    const mono = new Float32Array(inLen); for (let c = 0; c < nc; c++) for (let n = 0; n < inLen; n++) mono[n] += chs[c][n] / nc;
    const out = chs.map(() => new Float32Array(outLen + N)), norm = new Float32Array(outLen + N);
    let prev = 0;
    for (let k = 0; k * Hs < outLen; k++) {
      const ideal = Math.round(k * Hs / ratio); let best = ideal;
      if (k > 0) {
        const tgt = prev + Hs; let bestC = -Infinity;
        for (let q = Math.max(0, ideal - tol); q <= ideal + tol; q += 4) {
          let cc = 0; for (let n = 0; n < L; n += 4) { const x = tgt + n, y = q + n; if (y >= inLen || x >= inLen) break; cc += mono[x] * mono[y]; }
          if (cc > bestC) { bestC = cc; best = q; }
        }
      }
      const o0 = k * Hs;
      for (let n = 0; n < N; n++) { const idx = best + n; norm[o0 + n] += win[n]; if (idx < inLen) for (let c = 0; c < nc; c++) out[c][o0 + n] += chs[c][idx] * win[n]; }
      prev = best;
    }
    return out.map(d => { const r = new Float32Array(outLen); for (let n = 0; n < outLen; n++) r[n] = norm[n] > 1e-3 ? d[n] / norm[n] : 0; for (let n = 0; n < 64 && n < outLen; n++) r[outLen - 1 - n] *= n / 64; return r; });
  }
  function stretchBeats(chs, ratio, outLen, rate) {
    const inLen = chs[0].length, nc = chs.length, hop = 256;
    // attaques : montée d'énergie
    const n = Math.floor(inLen / hop), e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s2 = 0; for (let j = 0; j < hop; j++) { let v = 0; for (let c = 0; c < nc; c++) v += chs[c][i * hop + j]; s2 += v * v; } e[i] = Math.log(1e-6 + s2); }
    const fl = new Float32Array(n); for (let i = 1; i < n; i++) fl[i] = Math.max(0, e[i] - e[i - 1]);
    let m = 0; fl.forEach(v => { m += v; }); m /= Math.max(1, n); let sd = 0; fl.forEach(v => { sd += (v - m) ** 2; }); sd = Math.sqrt(sd / Math.max(1, n));
    const gap = Math.floor(0.05 * rate / hop), on = [0];
    for (let i = 1; i < n - 1; i++) if (fl[i] > m + sd * 1.2 && fl[i] >= fl[i - 1] && fl[i] >= fl[i + 1] && i * hop - on[on.length - 1] > gap * hop) on.push(Math.max(0, i * hop - 128));
    on.push(inLen);
    const out = chs.map(() => new Float32Array(outLen)), fade = Math.round(0.004 * rate);
    for (let s = 0; s < on.length - 1; s++) {
      const a = on[s], b = on[s + 1], st = Math.round(a * ratio), slot = Math.min(outLen, Math.round(b * ratio)) - st;
      if (slot <= 0) continue;
      const len = Math.min(b - a, slot);
      for (let c = 0; c < nc; c++) for (let j = 0; j < len; j++) {
        let g = 1; if (len < b - a && j > len - fade) g = (len - j) / fade; if (s && j < 32) g *= j / 32;
        out[c][st + j] += chs[c][a + j] * g;
      }
    }
    return out;
  }
  // calcule en tâche de fond les pads dont le tempo a changé (une fois la boucle posée, etc.)
  let tsBusy = false;
  function stretchSoon() { setTimeout(stretchTick, 30); }
  function stretchTick() {
    if (!ctx || tsBusy) return;
    for (let i = 0; i < 16; i++) {
      const p = padParams[i];
      if (p.fitBeats && p.fitMode && buffers[i] && (!tsCache.has(i) || tsCache.get(i).key !== tsKey(i))) {
        tsBusy = true; try { computeStretch(i); } catch (e) { console.warn(e); } tsBusy = false;
        if (i === selected && !$("editor").hidden) drawEditor();
        return stretchSoon();
      }
    }
  }
  setInterval(stretchTick, 400);

