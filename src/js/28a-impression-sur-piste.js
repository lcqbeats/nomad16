  // ---------- Impression sur une piste du looper (onglets SP et FX) ----------
  // Un tour complet de la piste passe dans les effets et la remplace (annulable). Tout est gravé en temps réel :
  // un effet lancé sur un seul temps ne reste que sur ce temps. Une seule impression à la fois.
  const LPR = { rec: null };
  function loopPrint(o) {
    if (LPR.rec) { loopPrintStop(false); return; }
    const l = o.layer, say = m => lcd("lcdPad", o.who, m);
    if (!ctx || !hasWorklet || !o.tap) { say("impression non disponible ici"); return; }
    if (!l) { say("choisis d'abord une piste (P1 à P6 ou touches blanches)"); return; }
    if (!LP.playing) { say("lance la boucle, puis imprime"); return; }
    if (l.muted || l.vol < 0.05) { say("la piste est coupée"); return; }
    const Lk = l.k * LP.Lf, sF = LP.t0F + l.m * LP.Lf, startF = Math.ceil(ctx.currentTime * sr + 0.03 * sr);
    const node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
    const silent = ctx.createGain(); silent.gain.value = 0; node.connect(silent); silent.connect(ctx.destination);
    o.tap.connect(node);
    const rec = LPR.rec = { o, l, node, silent, Lk, sF, startF, endF: startF + Lk, L: new Float32Array(Lk), R: new Float32Array(Lk), pct: 0, last: 0 };
    node.port.onmessage = e => {
      const { f, l: a, r: b } = e.data;
      for (let j = 0; j < a.length; j++) { const p = f + j; if (p < rec.startF || p >= rec.endF) continue; const i = (((p - rec.sF) % rec.Lk) + rec.Lk) % rec.Lk; rec.L[i] = a[j]; rec.R[i] = b[j]; }
      rec.pct = Math.max(0, Math.min(1, (f + a.length - rec.startF) / rec.Lk));
      if (performance.now() - rec.last > 150) { rec.last = performance.now(); o.ui(rec.pct); }
      if (f + a.length >= rec.endF) loopPrintStop(true);
    };
    o.ui(0);
    say(`impression sur la piste ${LP.layers.indexOf(l) + 1} : joue tes effets pendant un tour`);
  }
  const printing = who => !!(LPR.rec && LPR.rec.o.who === who);
  function loopPrintStop(done) {
    const rec = LPR.rec; if (!rec) return;
    if (rec.song) { songPrintEnd(done); return; }
    LPR.rec = null;
    const o = rec.o;
    try { o.tap.disconnect(rec.node); } catch (e) {} rec.node.disconnect(); rec.node.port.onmessage = null;
    const l = rec.l, i = LP.layers.indexOf(l);
    if (!done || i < 0) { o.ui(null); lcd("lcdPad", o.who, "impression annulée"); return; }
    const g = o.gain(), sc = g > 0.05 ? 1 / g : 1;
    let pk = 0; for (let j = 0; j < rec.Lk; j++) pk = Math.max(pk, Math.abs(rec.L[j] * sc), Math.abs(rec.R[j] * sc));
    const lim = pk > 0.98 ? 0.98 / pk : 1;   // jamais de saturation numérique dans la piste
    const buf = ctx.createBuffer(2, rec.Lk, sr), d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
    for (let j = 0; j < rec.Lk; j++) { d0[j] = rec.L[j] * sc * lim; d1[j] = rec.R[j] * sc * lim; }
    const old = { buf: l.buf, k: l.k, m: l.m, notes: l.notes }, now = { buf, k: l.k, m: l.m, notes: l.notes };
    const apply = st => { stopLayer(l); Object.assign(l, st); if (LP.playing) startLayer(l, ctx.currentTime + 0.005); drawSeqSel(); };
    apply(now);
    pushHist(`couleur ${o.who} piste ${i + 1}`, () => apply(old), () => apply(now), true);
    o.done(i);
    o.ui(null);
    lcd("lcdPad", o.who, `piste ${i + 1} imprimée · effets remis à zéro (Retour arrière = annuler)`);
  }

  // ---------- Impression sur une ligne de SONG ----------
  // La ligne se rejoue (boucles et gestes, ou son déjà imprimé) ; FX ou SP ciblé sur SONG colore toutes les boucles.
  // Le son des boucles avec effets est enregistré pendant toute la ligne, puis remplace la ligne (annulable).
  function songPrint(i) {
    const st = SONG.steps[i], say = m => lcd("lcdPad", "SONG", m);
    if (!ctx || !hasWorklet) { say("impression non disponible ici"); return; }
    if (!st || !st.take) { say("choisis une ligne de SONG"); return; }
    if (LPR.rec) loopPrintStop(false);
    if (st.take.len > sr * 60 * 8) { say("ligne trop longue pour l'imprimer (8 min max)"); return; }
    // effets : SP s'il vise déjà SONG, sinon FX
    let who = "FX";
    if (SPX.target === "song" && sp) who = "SP"; else if (fxTarget !== "song") setFxTarget("song");
    const tap = who === "SP" ? sp.mix : fxMaster;
    songPlay(i); if (!SONG.playing) return;
    const len = st.take.len, startF = SONG.stepT0;
    const node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
    const silent = ctx.createGain(); silent.gain.value = 0; node.connect(silent); silent.connect(ctx.destination);
    tap.connect(node);
    const o = { who, tap,
      gain: () => (loopBus.gain.value || 1) * (who === "FX" ? fxMaster.gain.value || 1 : 1),
      ui: p => { drawSong(true); if (who === "FX") { drawFxPrint(); if (p !== null) fxDisp("PRT", Math.round(p * 100) + " %"); else fxDisp("SNG", "SONG"); } else { drawSpTargets(); if (p !== null) spSeg("PRT", Math.round(p * 100) + " %"); else spSeg("F" + String(SPX.cur + 1).padStart(2, "0"), SP_FX[SPX.cur].name); } },
      done: () => { if (who === "FX") { if (fxActive >= 0) fxEnd(fxActive); for (let k = 0; k < 7; k++) { knobVals.fx[k] = FX_HOME[k]; applyFxKnob(k); } if (tab === "fx") drawKnobs(); } else spAllOff(); } };
    const rec = LPR.rec = SONG.print = { song: true, i, o, node, silent, startF, endF: startF + len, L: new Float32Array(len), R: new Float32Array(len), pct: 0, last: 0, take: st.take };
    node.port.onmessage = e => {
      const { f, l: a, r: b } = e.data;
      for (let j = 0; j < a.length; j++) { const p = f + j - rec.startF; if (p < 0 || p >= len) continue; rec.L[p] = a[j]; rec.R[p] = b[j]; }
      rec.pct = Math.max(0, Math.min(1, (f + a.length - rec.startF) / len));
      if (performance.now() - rec.last > 250) { rec.last = performance.now(); o.ui(rec.pct); }
      if (f + a.length >= rec.endF) songPrintEnd(true);
    };
    o.ui(0);
    say(`impression de la ligne ${i + 1} (${fmtLen(len)}) : va dans ${who} (cible SONG) et joue tes effets`);
  }
  function songPrintEnd(done) {
    const rec = SONG.print; if (!rec) return;
    SONG.print = null; if (LPR.rec === rec) LPR.rec = null;
    const o = rec.o;
    try { o.tap.disconnect(rec.node); } catch (e) {} rec.node.disconnect(); rec.node.port.onmessage = null;
    const i = SONG.steps.findIndex(st => st.take === rec.take);
    if (!done || i < 0) { o.ui(null); lcd("lcdPad", "SONG", "impression annulée"); return; }
    const n = rec.L.length, g = o.gain(), sc = g > 0.05 ? 1 / g : 1;
    let pk = 0; for (let j = 0; j < n; j++) pk = Math.max(pk, Math.abs(rec.L[j] * sc), Math.abs(rec.R[j] * sc));
    const lim = pk > 0.98 ? 0.98 / pk : 1;
    const buf = ctx.createBuffer(2, n, sr), d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
    for (let j = 0; j < n; j++) { d0[j] = rec.L[j] * sc * lim; d1[j] = rec.R[j] * sc * lim; }
    rec.L = rec.R = null;
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tk = rec.take, old = tk.pid || null;
    SONG.prints.set(id, buf);
    // mémoire : on garde les sons des lignes, plus les 2 derniers remplacés (pour annuler)
    if (old) SONG.keep = [old, ...SONG.keep].slice(0, 2);
    const used = new Set([...SONG.steps.map(st => st.take && st.take.pid).filter(Boolean), id, ...SONG.keep]);
    [...SONG.prints.keys()].forEach(k => { if (!used.has(k)) SONG.prints.delete(k); });
    const set = pid => { const t = SONG.steps.find(st => st.take === tk); if (!t) return; if (pid && !SONG.prints.has(pid)) { lcd("lcdPad", "SONG", "ancienne impression plus en mémoire"); return; } if (pid) tk.pid = pid; else delete tk.pid; drawSong(true); };
    set(id);
    pushHist(`impression ${o.who} sur la ligne ${i + 1} de SONG`, () => set(old), () => set(id), true);
    o.done(); o.ui(null);
    lcd("lcdPad", "SONG", `ligne ${i + 1} imprimée · effets remis à zéro (Retour arrière = annuler)`);
  }
