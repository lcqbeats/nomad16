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
    const rec = LPR.rec; if (!rec) return; LPR.rec = null;
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
