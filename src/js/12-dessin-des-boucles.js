  // ---------- Dessin des boucles ----------
  const cv = $("loopCanvas"), g2 = cv.getContext("2d");
  function resizeCanvas() { const r = cv.getBoundingClientRect(); const d = window.devicePixelRatio || 1; cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
  window.addEventListener("resize", () => { if (tab === "loops") resizeCanvas(); });
  function cellGeom(i) { const W = cv.width, H = cv.height, col = i % 3, row = Math.floor(i / 3); const w = W / 3, h = H / 2; return { x: col * w + w / 2, y: row * h + h / 2, r: Math.min(w, h) * 0.36 }; }
  function ring(x, y, r, a0, a1, color, width) { g2.beginPath(); g2.arc(x, y, r, a0, a1); g2.strokeStyle = color; g2.lineWidth = width; g2.stroke(); }
  function ticks(x, y, r, n, lit, color, size) {
    const nn = Math.min(n, 32);
    for (let j = 0; j < nn; j++) {
      const a = -Math.PI / 2 + j / nn * Math.PI * 2;
      g2.beginPath(); g2.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, j === lit ? size * 1.7 : size, 0, Math.PI * 2);
      g2.fillStyle = j === lit ? color : "#4a4641"; g2.fill();
    }
  }
  function text(s, x, y, size, color, font) { g2.font = `${size}px ${font || "Archivo Black, Arial Black, sans-serif"}`; g2.fillStyle = color; g2.textAlign = "center"; g2.textBaseline = "middle"; g2.fillText(s, x, y); }
  function draw() {
    requestAnimationFrame(draw);
    if (!ctx) return;
    updateLoopLcd();
    drawLcdStrip();
    if (tab === "fx") drawFxBar();
    if (tab === "sample") drawDig();
    if (tab === "song") drawSong();
    drawMixMeters();
    if (tab === "guitar") { drawMeter(); drawTuner(); }
    if (tab !== "loops") return;
    if (!cv.width) resizeCanvas();
    const d = window.devicePixelRatio || 1;
    g2.clearRect(0, 0, cv.width, cv.height);
    const nowF = ctx.currentTime * sr;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
    const p = LP.pending;
    for (let i = 0; i < MAX_LAYERS; i++) {
      const { x, y, r } = cellGeom(i);
      const l = LP.layers[i];
      const col = COLORS[i];
      const lw = 7 * d;
      if (l) {
        g2.beginPath(); g2.arc(x, y, r - lw, 0, Math.PI * 2); g2.fillStyle = l.muted ? "#1c1b19" : "#26231f"; g2.fill();
        ring(x, y, r, 0, Math.PI * 2, "#34302c", lw);
        const Lk = l.k * LP.Lf, sF = LP.t0F + l.m * LP.Lf;
        const prog = LP.playing ? ((((nowF - sF) % Lk) + Lk) % Lk) / Lk : 0;
        ring(x, y, r, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2, l.muted ? "#5d574f" : col, lw);
        const n = LP.beats * l.k;
        ticks(x, y, r + 11 * d, n, LP.playing ? Math.floor(prog * Math.min(n, 32)) : -1, l.muted ? "#5d574f" : col, 1.6 * d);
        text(String(i + 1), x, y - 4 * d, 26 * d, l.muted ? "#5d574f" : "#ece3d3");
        text(l.muted ? "MUET" : (l.k > 1 ? "×" + l.k : Math.round(l.vol * 100) + "%"), x, y + 18 * d, 15 * d, "#8f877a", "VT323, monospace");
      } else if (p && i === LP.layers.length) {
        const heard = nowF - (p.comp || 0);
        const recording = p.type === "first" ? p.phase !== "armed" : heard >= p.sF;
        g2.beginPath(); g2.arc(x, y, r - lw, 0, Math.PI * 2);
        g2.fillStyle = recording ? `rgba(217,43,47,${0.25 + 0.35 * pulse})` : "#1e1c1a"; g2.fill();
        if (p.type === "first") {
          if (p.phase === "armed") {
            ring(x, y, r, 0, Math.PI * 2, `rgba(217,43,47,${0.3 + 0.7 * pulse})`, lw);
            text("JOUEZ", x, y, 17 * d, "#ece3d3");
          } else {
            const el = ctx.currentTime - p.sT;
            const a = -Math.PI / 2 + (el % 2) / 2 * Math.PI * 2;
            ring(x, y, r, a, a + 1.2, "#d92b2f", lw);
            text("REC", x, y - 6 * d, 20 * d, "#fff");
            text(el.toFixed(1) + " s", x, y + 16 * d, 16 * d, "#ece3d3", "VT323, monospace");
          }
        } else {
          const Lk = p.k * LP.Lf, beatF = LP.Lf / LP.beats;
          if (!recording) {
            const left = Math.ceil((p.sF - heard) / beatF);
            ring(x, y, r, 0, Math.PI * 2, `rgba(217,43,47,${0.3 + 0.7 * pulse})`, lw);
            ticks(x, y, r + 11 * d, LP.beats, LP.beats - left, "#d92b2f", 1.6 * d);
            text(String(left), x, y - 4 * d, 30 * d, "#ece3d3");
            text("DANS", x, y + 20 * d, 15 * d, "#8f877a", "VT323, monospace");
          } else {
            const prog = (heard - p.sF) / Lk;
            ring(x, y, r, 0, Math.PI * 2, "#34302c", lw);
            ring(x, y, r, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2, "#d92b2f", lw);
            text("REC", x, y - 6 * d, 20 * d, "#fff");
            text("×" + p.k, x, y + 16 * d, 16 * d, "#ece3d3", "VT323, monospace");
          }
        }
      } else {
        g2.setLineDash([4 * d, 6 * d]);
        ring(x, y, r, 0, Math.PI * 2, "#3a3733", 2 * d);
        g2.setLineDash([]);
        text("+", x, y, 22 * d, "#3a3733");
      }
    }
    drawDragGhost();
  }
  function drawDragGhost() {
    if (!dragLoop || !dragLoop.moved) return;
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    const x = (dragLoop.x - r.left) * d, y = (dragLoop.y - r.top) * d, rr = cellGeom(0).r * 0.7;
    g2.globalAlpha = 0.6; g2.beginPath(); g2.arc(x, y, rr, 0, Math.PI * 2); g2.fillStyle = COLORS[dragLoop.from]; g2.fill(); g2.globalAlpha = 1;
    text("+", x, y, 26 * d, "#0c0b0a");
  }
  let lastLcd = "";
  function updateLoopLcd() {
    const p = LP.pending;
    let s, cls = "";
    if (performance.now() - lcdFull < 1200) { s = "6 pistes pleines · UNDO"; }
    else if (p && p.type === "first") { s = p.phase === "armed" ? "ARMÉE · jouez pour lancer" : "REC · Sustain sur le 1er temps"; cls = "rec"; }
    else if (LP.t0F === null) { s = "vide · Sustain pour armer"; }
    else {
      const bpm = (60 * LP.beats / loopLen()).toFixed(1);
      const mb = Math.round(SQ.list.reduce((a, x) => a + x.reduce((b, l) => b + l.buf.length * l.buf.numberOfChannels * 4, 0), 0) / 1048576);
      s = `SÉQ ${SEQ_N[SQ.cur]} · ${bpm} BPM · ${LP.layers.length}/${MAX_LAYERS}` + (mb >= 40 ? ` · ${mb} Mo` : "");
      if (p) { s += ctx.currentTime * sr - (p.comp || 0) < p.sF ? " · ARMÉE" : " · REC ×" + p.k; cls = "rec"; }
      else if (!LP.playing) s += " · STOP";
    }
    if (latMs > 0) s += " · BT +" + latMs + "ms";
    const key = s + cls;
    if (key !== lastLcd) { lastLcd = key; lcd("lcdLoop", "BOUCLE", s, cls); }
    $("btnRec").classList.toggle("armed", !!(p && ((p.type === "first" && p.phase === "armed") || (p.type === "layer" && ctx.currentTime * sr - (p.comp || 0) < p.sF))));
    $("btnPlay").textContent = LP.playing ? "STOP" : "PLAY";
    const armed = !!(p && ((p.type === "first" && p.phase === "armed") || (p.type === "layer" && ctx.currentTime * sr - (p.comp || 0) < p.sF)));
    $("trRec").classList.toggle("armed", armed); $("trRec").classList.toggle("rec", !!p && !armed);
    const pl = LP.playing && LP.t0F !== null, pt = pl ? "■ STOP" : "▶ PLAY"; if ($("trPlay").textContent !== pt) $("trPlay").textContent = pt;
  }
  let pressT = null, pressCell = -1;
  function cellAt(e) {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    const px = (e.clientX - r.left) * d, py = (e.clientY - r.top) * d;
    for (let i = 0; i < MAX_LAYERS; i++) { const c = cellGeom(i); if (Math.hypot(px - c.x, py - c.y) < c.r * 1.25) return i; }
    return -1;
  }
  // Toucher : muet. Appui long : effacer. Glisser un cercle sur un autre : fusionner les deux pistes.
  let dragLoop = null;
  cv.addEventListener("pointerdown", e => {
    pressCell = cellAt(e); if (pressCell < 0 || !LP.layers[pressCell]) return;
    cv.setPointerCapture(e.pointerId);
    dragLoop = { from: pressCell, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false };
    pressT = setTimeout(() => { if (!dragLoop || dragLoop.moved) return; removeLayer(pressCell); pressCell = -1; dragLoop = null; }, 650);
  });
  cv.addEventListener("pointermove", e => {
    if (!dragLoop) return;
    dragLoop.x = e.clientX; dragLoop.y = e.clientY;
    if (Math.hypot(e.clientX - dragLoop.x0, e.clientY - dragLoop.y0) > 12) { dragLoop.moved = true; if (pressT) clearTimeout(pressT); }
  });
  cv.addEventListener("pointerup", e => {
    if (pressT) clearTimeout(pressT); pressT = null;
    const dl = dragLoop; dragLoop = null;
    if (!dl) return;
    if (dl.moved) { const to = cellAt(e); if (to >= 0 && to !== dl.from && LP.layers[to]) mergeLayers(dl.from, to); }
    else if (LP.layers[dl.from]) toggleMute(dl.from);
    pressCell = -1;
  });
  cv.addEventListener("pointercancel", () => { if (pressT) clearTimeout(pressT); pressCell = -1; dragLoop = null; });
  function mergeLayers(a, b, hist = true) {
    const A = LP.layers[a], B = LP.layers[b];
    const old = { buf: B.buf, k: B.k, m: B.m, vol: B.vol, muted: B.muted };
    const gcd = (x, y) => y ? gcd(y, x % y) : x;
    const k = A.k * B.k / gcd(A.k, B.k);
    if (k > 8) { lcd("lcdLoop", "BOUCLE", "fusion impossible : boucles trop longues ensemble"); return; }
    const Lk = k * LP.Lf, out = ctx.createBuffer(2, Lk, sr);
    [A, B].forEach(l => {
      const g = l.muted ? 0 : l.vol, LkL = l.k * LP.Lf, off = l.m * LP.Lf;
      for (let ch = 0; ch < 2; ch++) {
        const src = l.buf.getChannelData(Math.min(ch, l.buf.numberOfChannels - 1)), dst = out.getChannelData(ch);
        for (let p = 0; p < Lk; p++) dst[p] += src[(((p - off) % LkL) + LkL) % LkL] * g;
      }
    });
    stopLayer(B); B.buf = out; B.k = k; B.m = 0; B.vol = 1; B.muted = false; B.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.01);
    if (LP.playing) startLayer(B, ctx.currentTime + 0.005);
    removeLayer(a, false);
    if (hist) pushHist(`fusion pistes ${a + 1} + ${b + 1}`, () => {
      stopLayer(B); Object.assign(B, old); B.gain.gain.setValueAtTime(B.muted ? 0 : B.vol, ctx.currentTime); if (LP.playing) startLayer(B, ctx.currentTime + 0.005);
      reinsertLayer(A, a, { Lf: LP.Lf, beats: LP.beats });
    }, () => { const ia = LP.layers.indexOf(A), ib = LP.layers.indexOf(B); if (ia >= 0 && ib >= 0) mergeLayers(ia, ib, false); });
    lcd("lcdLoop", "BOUCLE", `pistes ${a + 1} + ${b + 1} fusionnées`);
  }

