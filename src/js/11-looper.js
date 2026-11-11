  // ---------- Looper ----------
  const LP = { t0F: null, Lf: 0, beats: 4, layers: [], pending: null, playing: true };
  // Séquences A à H : chacune a ses pistes ; le tempo (LP.Lf, LP.beats) est commun et fixé par la toute première boucle
  const SQ = { list: Array.from({ length: 8 }, () => []), cur: 0, next: -1, sw: null, metro: false, metroF: 0 };
  SQ.list[0] = LP.layers;
  const gcdI = (x, y) => y ? gcdI(y, x % y) : x;
  function cycF(layers) { let k = 1; layers.forEach(l => { k = k * l.k / gcdI(k, l.k); }); return Math.min(k, 8) * LP.Lf; }
  function seqOf(l) { return SQ.list.findIndex(x => x.includes(l)); }
  function syncLoopKnobs() { LP.layers.forEach((l, i) => { knobVals.loops[i] = l.vol; }); for (let i = LP.layers.length; i < 6; i++) knobVals.loops[i] = 1; if (tab === "loops" || tab === "song") drawKnobs(); }
  // Change de séquence tout de suite (arrêt)
  function switchNow(i) {
    LP.layers.forEach(stopLayer);
    SQ.cur = i; LP.layers = SQ.list[i]; SQ.next = -1; SQ.sw = null;
    routeFx(); LP.layers.forEach(l => l.gain.gain.setValueAtTime(l.muted ? 0 : l.vol, ctx.currentTime));
    syncLoopKnobs(); drawSeqSel();
  }
  // Change de séquence pile sur une fin de cycle (bF en frames)
  function doSwitch(i, bF) {
    const T = Math.max(bF / sr, ctx.currentTime + 0.005);
    LP.layers.forEach(l => { if (l.src) { try { l.src.stop(T); } catch (e) {} l.src = null; } });
    SQ.cur = i; LP.layers = SQ.list[i]; LP.t0F = bF; SQ.sw = null; SQ.next = -1;
    routeFx();
    LP.layers.forEach(l => { l.gain.gain.setValueAtTime(l.muted ? 0 : l.vol, ctx.currentTime); startLayer(l, T); });
    syncLoopKnobs(); drawSeqSel();
  }
  function selectSeq(i) {
    if (!ctx) return;
    if (SONG.playing) songStop();
    if (i === SQ.cur) { SQ.next = -1; SQ.sw = null; drawSeqSel(); return; }
    if (LP.pending && LP.pending.type === "first") return;
    if (LP.t0F === null || !LP.playing) { switchNow(i); lcd("lcdPad", "SÉQUENCE", SEQ_N[i] + (SQ.list[i].length ? "" : " · vide, REC pour la remplir")); return; }
    SQ.next = i; SQ.sw = null; drawSeqSel();
    lcd("lcdPad", "SÉQUENCE", SEQ_N[i] + " en attente · fin du cycle");
  }
  function seqTick() {
    if (!ctx || LP.t0F === null) return;
    const nowF = ctx.currentTime * sr;
    if (SQ.next >= 0 && !SQ.sw && LP.playing && !LP.pending) {
      const C = cycF(LP.layers), n = Math.ceil((nowF + 0.13 * sr - LP.t0F) / C);
      SQ.sw = { i: SQ.next, bF: LP.t0F + n * C };
    }
    if (SQ.sw && nowF >= SQ.sw.bF - 0.12 * sr) doSwitch(SQ.sw.i, SQ.sw.bF);
    // métronome : un clic par temps, accent tous les 4 temps
    if (SQ.metro && LP.playing) {
      const bF = LP.Lf / LP.beats; let n = Math.ceil((Math.max(nowF, SQ.metroF + 1) - LP.t0F) / bF);
      for (let f = LP.t0F + n * bF; f < nowF + 0.1 * sr; n++, f = LP.t0F + n * bF) {
        if (f <= SQ.metroF) continue;
        SQ.metroF = f; const t = f / sr, o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = ((n % 4) + 4) % 4 === 0 ? 1600 : 1050;
        g.gain.setValueAtTime(knobVals.song[7] * 0.4 + 0.001, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.connect(g); g.connect(fxOut); o.start(t); o.stop(t + 0.05);
      }
    }
    songTick();
  }
  // Sélecteur de séquences du LOOPER (toucher : choisir ; glisser une séquence sur une autre : copier)
  function drawSeqSel() {
    for (let i = 0; i < 8; i++) {
      const b = $("sq" + i); if (!b) return;
      b.classList.toggle("on", i === SQ.cur); b.classList.toggle("has", SQ.list[i].length > 0);
      b.classList.toggle("next", i === SQ.next || (SQ.sw && SQ.sw.i === i));
    }
    $("metroBtn").classList.toggle("on", SQ.metro); $("trMetro").classList.toggle("on", SQ.metro);
  }
  function copySeq(a, b) {
    if (a === b || !SQ.list[a].length) return;
    const old = SQ.list[b].slice();
    const make = () => SQ.list[a].map(l => { const gain = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 256; gain.gain.value = l.muted ? 0 : l.vol; gain.connect(loopBus); return { buf: l.buf, k: l.k, m: l.m, gain, an, vol: l.vol, muted: l.muted, src: null }; });
    const put = arr => { const T = SQ.list[b]; if (b === SQ.cur) T.forEach(stopLayer); T.length = 0; arr.forEach(l => T.push(l)); if (b === SQ.cur) { routeFx(); if (LP.playing) T.forEach(l => startLayer(l, ctx.currentTime + 0.005)); syncLoopKnobs(); } drawSeqSel(); };
    const fresh = make(); put(fresh);
    pushHist(`copie ${SEQ_N[a]} → ${SEQ_N[b]}`, () => put(old), () => put(fresh));
    lcd("lcdPad", "SÉQUENCE", `${SEQ_N[a]} copiée sur ${SEQ_N[b]}`);
  }
  const loopLen = () => LP.Lf / sr;
  const compF = () => Math.round(latMs / 1000 * sr);
  function onFirstNote(t) { const p = LP.pending; if (p && p.type === "first" && p.phase === "armed") { p.phase = "rec"; p.sT = t; } }
  let lcdFull = 0;
  function recPress() {
    if (!ctx) return;
    const now = ctx.currentTime;
    const p = LP.pending;
    if (LP.t0F === null) {
      if (!p) {
        const recent = notesAny.filter(t => now - t < 0.15);
        LP.pending = recent.length ? { type: "first", phase: "rec", sT: recent[0] } : { type: "first", phase: "armed" };
      } else if (p.phase === "armed") {
        LP.pending = null;
      } else if (p.phase === "rec") {
        if (now - p.sT < 0.3) return;
        p.phase = "closing"; p.pressT = now;
        setTimeout(closeFirst, 110);
      }
      return;
    }
    if (!LP.playing) playAll();
    if (p && p.type === "layer") { p.k = Math.min(8, p.k + 1); return; }
    if (p) return;
    if (LP.layers.length >= MAX_LAYERS) { lcdFull = performance.now(); return; }
    // Avec un casque à retard, on raisonne sur ce que l'oreille entend.
    const heardF = now * sr - compF();
    const rel = heardF - LP.t0F;
    const cyc = Math.floor(rel / LP.Lf);
    const pos = rel - cyc * LP.Lf;
    const m = pos < 0.15 * LP.Lf ? cyc : cyc + 1;
    LP.pending = { type: "layer", m, sF: LP.t0F + m * LP.Lf, k: 1, comp: compF() };
  }
  function closeFirst() {
    const p = LP.pending;
    if (!p || p.phase !== "closing") return;
    let endT = p.pressT, best = 0.09;
    hits.forEach(t => { const d = Math.abs(t - p.pressT); if (t > p.sT + 0.3 && d < best) { best = d; endT = t; } });
    const sF = Math.round(p.sT * sr), eF = Math.round(endT * sr);
    const finish = () => {
      if (LP.pending !== p) return;
      if (capLatest < eF) return setTimeout(finish, 10);
      const buf = extract(sF, eF - sF);
      LP.pending = null;
      if (!buf) return;
      LP.t0F = sF; LP.Lf = eF - sF;
      let beats = 1; while (60 * beats / loopLen() < 70) beats *= 2;
      LP.beats = beats;
      LP.playing = true;
      addLayer(buf, 1, 0);
    };
    finish();
  }
  // attaques de guitare : lancent l'enregistrement armé et servent de repères pour fermer la boucle, comme les pads
  let gOnset = { above: false, last: 0 };
  function guitarOnsetTick() {
    if (!gn || !G.on || !gn.onAn) return;
    const lv = level(gn.onAn), th = Math.pow(10, (store.get("gate", -55) + 18) / 20), now = ctx.currentTime;
    if (!gOnset.above && lv > th && now - gOnset.last > 0.12) {
      gOnset.above = true; gOnset.last = now;
      const t = now - 0.01; notesAny.push(t); hits.push(t); if (hits.length > 32) hits.shift();
      onFirstNote(t);
    } else if (gOnset.above && lv < th * 0.4) gOnset.above = false;
  }
  function looperTick() {
    seqTick();
    guitarOnsetTick();
    const p = LP.pending;
    if (!p || p.type !== "layer") return;
    const eF = p.sF + p.k * LP.Lf + p.comp;
    if (capLatest >= eF) {
      const buf = extract(p.sF + p.comp, p.k * LP.Lf);
      LP.pending = null;
      if (buf) addLayer(buf, p.k, p.m);
    }
  }
  function addLayer(buf, k, m, hist = true) {
    const idx = LP.layers.length;
    const gain = ctx.createGain();
    const an = ctx.createAnalyser(); an.fftSize = 256;
    const l = { buf, k, m, gain, an, vol: knobVals.loops[idx] ?? 1, muted: false, src: null };
    gain.gain.value = l.vol;
    gain.connect(loopBus);
    LP.layers.push(l);
    routeFx();
    if (LP.playing) startLayer(l, ctx.currentTime + 0.005);
    if (hist) { const st = { Lf: LP.Lf, beats: LP.beats, si: SQ.cur }; pushHist("nouvelle piste " + (idx + 1), () => dropLayer(l), () => reinsertLayer(l, idx, st)); }
    drawSeqSel();
  }
  function dropLayer(l) {
    const si = seqOf(l); if (si < 0) return;
    if (si === SQ.cur) removeLayer(LP.layers.indexOf(l), false);
    else { SQ.list[si].splice(SQ.list[si].indexOf(l), 1); try { l.gain.disconnect(); } catch (e) {} }
    drawSeqSel();
  }
  function reinsertLayer(l, idx, st) {
    if (LP.t0F === null && st) { LP.Lf = st.Lf; LP.beats = st.beats; LP.t0F = Math.round((ctx.currentTime + 0.03) * sr); LP.playing = true; }
    const si = st && st.si !== undefined ? st.si : SQ.cur, arr = SQ.list[si];
    arr.splice(Math.min(idx, arr.length), 0, l);
    if (si === SQ.cur) {
      routeFx();
      l.gain.gain.setValueAtTime(l.muted ? 0 : l.vol, ctx.currentTime);
      if (LP.playing) startLayer(l, ctx.currentTime + 0.005);
    }
    drawSeqSel();
  }
  function startLayer(l, T) {
    const Lk = l.k * LP.Lf;
    const sF = LP.t0F + l.m * LP.Lf;
    const phase = (((T * sr - sF) % Lk) + Lk) % Lk;
    const src = ctx.createBufferSource();
    src.buffer = l.buf; src.loop = true;
    src.connect(l.gain);
    src.start(T, phase / sr);
    l.src = src;
  }
  function stopLayer(l) { if (l.src) { try { l.src.stop(); } catch (e) {} l.src.disconnect(); l.src = null; } }
  function stopAll() { LP.layers.forEach(stopLayer); LP.playing = false; SQ.sw = null; if (SONG.playing) songStop(); if (LP.pending && LP.pending.type === "layer") LP.pending = null; }
  function playAll() {
    if (!ctx || LP.t0F === null) return;
    const T = ctx.currentTime + 0.03;
    LP.t0F = Math.round(T * sr); SQ.metroF = 0; SQ.sw = null;
    LP.layers.forEach(l => { stopLayer(l); startLayer(l, T); });
    LP.playing = true;
  }
  function togglePlay() { if (LP.playing) stopAll(); else playAll(); }
  function removeLayer(i, hist = true) {
    const l = LP.layers[i]; if (!l) return;
    const st = { Lf: LP.Lf, beats: LP.beats, si: SQ.cur };
    if (hist) pushHist("effacer piste " + (i + 1), () => reinsertLayer(l, i, st), () => dropLayer(l));
    stopLayer(l); l.gain.disconnect();
    LP.layers.splice(i, 1);
    routeFx();
    LP.layers.forEach((x, j) => { x.vol = knobVals.loops[j]; if (!x.muted) x.gain.gain.setTargetAtTime(x.vol, ctx.currentTime, 0.01); });
    if (!LP.layers.length) resetLooper();
  }
  function resetLooper() {
    LP.layers.forEach(l => { stopLayer(l); l.gain.disconnect(); }); LP.layers.length = 0; LP.pending = null;
    if (SQ.list.every(x => !x.length)) { LP.t0F = null; LP.Lf = 0; LP.playing = true; SQ.next = -1; SQ.sw = null; songStop(); }
    drawSeqSel();
  }
  function resetAll() {
    songStop();
    SQ.list.forEach(x => { x.forEach(l => { stopLayer(l); l.gain.disconnect(); }); x.length = 0; });
    SQ.cur = 0; LP.layers = SQ.list[0]; LP.t0F = null; LP.Lf = 0; LP.pending = null; LP.playing = true; SQ.next = -1; SQ.sw = null;
    drawSeqSel();
  }
  function undo() { if (LP.pending) { LP.pending = null; return; } removeLayer(LP.layers.length - 1); }
  function toggleMute(i) {
    const l = LP.layers[i]; if (!l) return;
    l.muted = !l.muted;
    l.gain.gain.setTargetAtTime(l.muted ? 0 : l.vol, ctx.currentTime, 0.01);
  }

  $("btnRec").addEventListener("pointerdown", e => { e.preventDefault(); recPress(); });
  $("btnUndo").addEventListener("click", undo);
  $("btnPlay").addEventListener("click", togglePlay);
  let clearTimer = null;
  $("btnClear").addEventListener("pointerdown", e => { e.currentTarget.classList.add("holding"); clearTimer = setTimeout(() => {
    const ls = LP.layers.slice(), st = { Lf: LP.Lf, beats: LP.beats, si: SQ.cur };
    resetLooper(); $("btnClear").classList.remove("holding");
    if (ls.length) pushHist("effacer la séquence " + SEQ_N[st.si], () => ls.forEach((l, i) => reinsertLayer(l, i, st)), () => ls.forEach(dropLayer));
  }, 700); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => $("btnClear").addEventListener(ev, () => { clearTimeout(clearTimer); $("btnClear").classList.remove("holding"); }));

