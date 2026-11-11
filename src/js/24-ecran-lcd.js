  // ---------- Écran LCD : compteur, son frappé, vumètres ----------
  const lcv = $("lcdScope"), lg = lcv.getContext("2d");
  const peakCache = new WeakMap();
  let liveAn = null, lastTr = "", lcdInk = "";
  const mBuf = new Float32Array(256);
  function level(an) { an.getFloatTimeDomainData(mBuf); let m = 0; for (let i = 0; i < 256; i++) m = Math.max(m, Math.abs(mBuf[i])); return m; }
  function transport() {
    if (LP.t0F !== null && LP.playing) {
      const C = cycF(LP.layers), pos = ((ctx.currentTime * sr - LP.t0F) % C + C) % C, bl = LP.Lf / LP.beats, beat = Math.floor(pos / bl);
      const nx = SQ.sw ? SQ.sw.i : SQ.next, tag = SONG.playing ? `♫${SONG.idx + 1} ` : "";
      return { s: `${tag}${SEQ_N[SQ.cur]}${nx >= 0 ? "→" + SEQ_N[nx] : ""} ${Math.floor(beat / 4) + 1}.${beat % 4 + 1}.${Math.floor((pos % bl) / bl * 4) + 1}`, on: (pos % bl) / bl < 0.25 };
    }
    return { s: `■ ${SEQ_N[SQ.cur]} · ${Math.round(curBpm())} BPM`, on: false };
  }
  // Cercle de la boucle : se remplit au fil du cycle, un trait par temps, repère du début en haut
  const rcv = $("lcdRing"), rg = rcv.getContext("2d");
  function drawRing() {
    fitCanvas(rcv); const W = rcv.width, H = rcv.height; if (!W) return;
    const d = window.devicePixelRatio || 1, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 3 * d;
    rg.clearRect(0, 0, W, H); rg.strokeStyle = lcdInk; rg.fillStyle = lcdInk; rg.lineCap = "butt";
    rg.globalAlpha = 0.2; rg.lineWidth = 3 * d; rg.beginPath(); rg.arc(cx, cy, R, 0, 7); rg.stroke(); rg.globalAlpha = 1;
    if (LP.t0F === null || !LP.playing || !LP.Lf) return;
    // pendant un REC de piste, le cercle suit la piste en train d'être enregistrée : ×2 = un tour en deux fois plus de temps
    const p = LP.pending, heard = ctx.currentTime * sr - (p && p.comp || 0), recL = p && p.type === "layer" && heard >= p.sF ? (p.half ? Math.floor(LP.Lf / 2) : p.k * LP.Lf) : 0;
    const C = recL || cycF(LP.layers), pos = recL ? Math.min(recL - 1, heard - p.sF) : ((ctx.currentTime * sr - LP.t0F) % C + C) % C, u = pos / C, beats = Math.max(1, Math.round(LP.beats * C / LP.Lf));
    if (recL) { rg.strokeStyle = rg.fillStyle = "#ff6b61"; }
    rg.lineWidth = 3 * d; rg.beginPath(); rg.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + u * 2 * Math.PI); rg.stroke();
    for (let k = 0; k < beats; k++) { const a = -Math.PI / 2 + k / beats * 2 * Math.PI, big = k % 4 === 0; rg.globalAlpha = big ? 1 : 0.6; rg.lineWidth = (big ? 2 : 1) * d; rg.beginPath(); rg.moveTo(cx + Math.cos(a) * (R - (big ? 7 : 4) * d), cy + Math.sin(a) * (R - (big ? 7 : 4) * d)); rg.lineTo(cx + Math.cos(a) * (R + 2 * d), cy + Math.sin(a) * (R + 2 * d)); rg.stroke(); }
    rg.globalAlpha = 1; const a = -Math.PI / 2 + u * 2 * Math.PI; rg.beginPath(); rg.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 3 * d, 0, 7); rg.fill();
  }
  function drawLcdStrip() {
    drawRing();
    const tr = transport();
    if (tr.s !== lastTr) { lastTr = tr.s; $("lcdTr").textContent = tr.s; }
    $("beatLed").classList.toggle("on", tr.on);
    fitCanvas(lcv);
    const W = lcv.width, H = lcv.height, d = window.devicePixelRatio || 1;
    lcdInk = getComputedStyle(document.documentElement).getPropertyValue("--lcd-ink").trim() || "#7dffa6";
    lg.clearRect(0, 0, W, H);
    const mw = 7 * 7 * d, sw = W - mw - 6 * d;
    // forme d'onde du dernier pad frappé, avec la tête de lecture
    if (lastHit && buffers[lastHit.i]) {
      const b = buffers[lastHit.i];
      let pk = peakCache.get(b);
      if (!pk || pk.length !== Math.floor(sw)) { pk = new Float32Array(Math.max(1, Math.floor(sw))); const x = b.getChannelData(0), L = x.length; for (let p = 0; p < pk.length; p++) { let m = 0; const s0 = Math.floor(p / pk.length * L), e0 = Math.floor((p + 1) / pk.length * L); for (let k = s0; k < e0; k += 4) m = Math.max(m, Math.abs(x[k])); pk[p] = m; } peakCache.set(b, pk); }
      lg.fillStyle = lcdInk; lg.globalAlpha = 0.55;
      for (let p = 0; p < pk.length; p++) { const h = Math.max(1, pk[p] * (H - 2)); lg.fillRect(p, (H - h) / 2, 1, h); }
      const prog = (ctx.currentTime - lastHit.t) / b.duration;
      if (prog >= 0 && prog < 1) { lg.globalAlpha = 1; lg.fillRect(prog * sw, 0, 2 * d, H); }
      lg.globalAlpha = 1;
    }
    // vumètres : direct + 6 pistes
    if (!liveAn && liveBus) { liveAn = ctx.createAnalyser(); liveAn.fftSize = 256; liveBus.connect(liveAn); }
    const lv = [liveAn ? level(liveAn) : 0].concat(Array.from({ length: 6 }, (_, i) => LP.layers[i] && LP.layers[i].an ? level(LP.layers[i].an) : -1));
    lv.forEach((v, i) => {
      const x = sw + 6 * d + i * 7 * d;
      lg.globalAlpha = 0.18; lg.fillStyle = lcdInk; lg.fillRect(x, 0, 5 * d, H);
      if (v >= 0) { lg.globalAlpha = 1; const h = Math.min(1, Math.sqrt(v)) * H; lg.fillStyle = v > 0.9 ? "#ff6b61" : lcdInk; lg.fillRect(x, H - h, 5 * d, h); }
    });
    lg.globalAlpha = 1;
  }

