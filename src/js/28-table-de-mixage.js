  // ---------- Table de mixage ----------
  const MIX = { ch: [
    { id: "pads", name: "PADS", vol: 0.894, mute: false, solo: false },
    { id: "sons", name: "SONS", vol: 0.894, mute: false, solo: false },
    { id: "gtr", name: "GUITARE", vol: 0.894, mute: false, solo: false },
    { id: "loop", name: "LOOPER", vol: 0.9, mute: false, solo: false },
    { id: "master", name: "MASTER", vol: 1, mute: false, solo: false }] };
  (store.get("mix", null) || []).forEach((v, i) => { if (MIX.ch[i]) Object.assign(MIX.ch[i], { vol: v.vol, mute: false, solo: false }); });
  const mixNode = id => ({ pads: chPads, sons: chSons, gtr: chGtr, master: chMaster })[id];
  const mixAn = {};
  function applyMix() {
    if (!ctx || !chPads) return;
    const anySolo = MIX.ch.some(c => c.solo && c.id !== "master"), t = ctx.currentTime;
    MIX.ch.forEach(c => {
      const on = c.id === "master" ? !c.mute : !c.mute && (!anySolo || c.solo), g = on ? Math.pow(c.vol, 2) * 1.25 : 0;
      if (c.id === "loop") { knobVals.loops[6] = c.vol; loopBus.gain.setTargetAtTime(on ? c.vol : 0, t, 0.02); if (fxSolo) fxSolo.gain.setTargetAtTime(on ? c.vol : 0, t, 0.02); }
      else mixNode(c.id).gain.setTargetAtTime(c.id === "master" ? (on ? c.vol : 0) : g, t, 0.02);
    });
    store.set("mix", MIX.ch.map(c => ({ vol: c.vol })));
  }
  // Table : 6 tranches pour les boucles de la bank affichée (volume, panoramique, coupe-bas, muet, solo)
  // + les voies générales (PADS, SONS, GUITARE, BOUCLES, MASTER). Presets pour harmoniser vite, AUTO analyse les boucles.
  const FH = 120;
  function strip(o) {
    const d = document.createElement("div"); d.className = "mch" + (o.loop ? " lp" : "") + (o.empty ? " empty" : "");
    d.innerHTML = `<b>${o.name}</b>${o.pan ? '<input type="range" class="pan" min="-1" max="1" step="0.05" aria-label="Panoramique">' : '<span class="nopan"></span>'}<div class="fader"><i class="meter"></i><div class="cap"></div></div><span class="val"></span><div class="mb">${o.hp ? '<button type="button" class="h" title="Coupe-bas 120 Hz">BAS</button>' : ""}<button type="button" class="m">M</button>${o.hasSolo ? '<button type="button" class="s">S</button>' : ""}</div>`;
    const fd = d.querySelector(".fader"), cap = d.querySelector(".cap"), val = d.querySelector(".val"), pan = d.querySelector(".pan");
    const draw = () => {
      const v = o.get(); cap.style.top = ((1 - v) * FH) + "px"; val.textContent = v <= 0.001 ? "-∞" : (20 * Math.log10(o.db ? o.db(v) : v)).toFixed(1);
      d.querySelector(".m").classList.toggle("on", !!o.muted()); const sb = d.querySelector(".s"); if (sb) sb.classList.toggle("on", !!o.soloed());
      if (pan) { pan.value = o.pan.get(); pan.title = panTxt(o.pan.get()); } const hb = d.querySelector(".h"); if (hb) hb.classList.toggle("on", !!o.hp.get());
    };
    if (!o.empty) {
      let y0 = 0, v0 = 0;
      fd.addEventListener("pointerdown", e => { fd.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = o.get(); });
      fd.addEventListener("pointermove", e => { if (!fd.hasPointerCapture(e.pointerId)) return; o.set(Math.min(1, Math.max(0, v0 + (y0 - e.clientY) / FH))); draw(); });
      fd.addEventListener("dblclick", () => { o.set(o.def); draw(); });
      d.querySelector(".m").addEventListener("click", () => { o.mute(); MIX.redraw(); });
      const sb = d.querySelector(".s"); if (sb) sb.addEventListener("click", () => { o.solo(); MIX.redraw(); });
      if (pan) { pan.addEventListener("input", () => { o.pan.set(+pan.value); pan.title = panTxt(+pan.value); lcd("lcdPad", "MIX", `${o.name} : ${panTxt(+pan.value)}`); }); pan.addEventListener("dblclick", () => { o.pan.set(0); draw(); }); }
      const hb = d.querySelector(".h"); if (hb) hb.addEventListener("click", () => { o.hp.set(!o.hp.get()); draw(); lcd("lcdPad", "MIX", `${o.name} : coupe-bas ${o.hp.get() ? "oui (120 Hz)" : "non"}`); });
    } else d.querySelectorAll("button, input").forEach(x => x.disabled = true);
    o.draw = draw; o.meter = d.querySelector(".meter"); draw();
    return { el: d, o };
  }
  const panTxt = p => Math.abs(p) < 0.03 ? "centre" : (p < 0 ? "gauche " : "droite ") + Math.round(Math.abs(p) * 100) + " %";
  function setLayerPan(l, p) { l.pan = p; if (l.pn) l.pn.pan.setTargetAtTime(p, ctx.currentTime, 0.02); }
  function setLayerHp(l, on) { l.hp = on; if (l.hpf) l.hpf.frequency.setTargetAtTime(on ? 120 : 10, ctx.currentTime, 0.02); }
  function setLayerVol(i, v) { const l = LP.layers[i]; if (!l) return; l.vol = v; knobVals.loops[i] = v; if (!l.muted) l.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
  let strips = [];
  function buildMixer() {
    const el = $("mixer"); el.innerHTML = ""; strips = [];
    const lpBox = document.createElement("div"); lpBox.className = "mixrow lps";
    for (let i = 0; i < 6; i++) {
      const l = () => LP.layers[i];
      const st = strip({ name: "P" + (i + 1), loop: true, empty: !l(), pan: { get: () => (l() && l().pan) || 0, set: v => l() && setLayerPan(l(), v) }, hp: { get: () => l() && l().hp, set: v => l() && setLayerHp(l(), v) }, hasSolo: true, def: 1,
        get: () => l() ? l().vol : 0, set: v => setLayerVol(i, v), muted: () => l() && l().muted, soloed: () => LP.solo && LP.solo.i === i, mute: () => toggleMute(i), solo: () => soloLayer(i), node: () => l() && l().gain });
      strips.push(st.o); lpBox.appendChild(st.el);
    }
    const busBox = document.createElement("div"); busBox.className = "mixrow bus";
    MIX.ch.forEach(c => {
      const st = strip({ name: c.id === "loop" ? "BOUCLES" : c.name, def: c.id === "loop" ? 0.9 : c.id === "master" ? 1 : 0.894, hasSolo: c.id !== "master",
        db: v => c.id === "loop" || c.id === "master" ? v : Math.pow(v, 2) * 1.25, get: () => c.vol, set: v => { c.vol = v; applyMix(); }, muted: () => c.mute, soloed: () => c.solo,
        mute: () => { c.mute = !c.mute; applyMix(); }, solo: () => { c.solo = !c.solo; applyMix(); }, node: () => c.id === "loop" ? loopBus : mixNode(c.id) });
      strips.push(st.o); busBox.appendChild(st.el);
    });
    // sélecteur de bank : les 6 tranches montrent la bank choisie (les 3 banks jouent ensemble)
    const h1 = document.createElement("h4"); h1.className = "mixh mixbanks"; h1.innerHTML = "BOUCLES · BANK";
    for (let b = 0; b < NB; b++) { const x = document.createElement("button"); x.type = "button"; x.className = "pat bank"; x.dataset.bank = b; x.innerHTML = `${SEQ_N[b]}<small></small>`; x.addEventListener("click", () => selectSeq(b)); h1.appendChild(x); }
    const h2 = document.createElement("h4"); h2.className = "mixh"; h2.textContent = "GÉNÉRAL";
    el.append(h1, lpBox, h2, busBox);
    MIX.redraw = () => strips.forEach(o => o.draw());
    MIX.bank = SQ.cur; MIX.n = LP.layers.length; drawBanks();
  }
  // Presets : AUTO (analyse : niveaux rapprochés, basses au centre, le reste écarté, coupe-bas où il n'y a pas de basses),
  // À PLAT (tout au centre, sans coupe-bas), LARGE et ÉTROIT (écartement gauche / droite en alternance)
  const anaCache = new WeakMap();
  function analyse(buf) {
    if (anaCache.has(buf)) return anaCache.get(buf);
    const d0 = buf.getChannelData(0), d1 = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0), st = Math.max(1, Math.floor(buf.length / 200000));
    const aL = 1 - Math.exp(-2 * Math.PI * 150 * st / buf.sampleRate), aH = Math.exp(-2 * Math.PI * 3000 * st / buf.sampleRate);
    let e = 0, lo = 0, hi = 0, lp = 0, hx = 0, hy = 0, n = 0;
    for (let i = 0; i < buf.length; i += st) { const x = (d0[i] + d1[i]) / 2; e += x * x; lp += aL * (x - lp); lo += lp * lp; const y = aH * (hy + x - hx); hx = x; hy = y; hi += y * y; n++; }
    const r = { rms: Math.sqrt(e / n), low: e ? lo / e : 0, high: e ? hi / e : 0 }; anaCache.set(buf, r); return r;
  }
  function mixPreset(kind) {
    if (!ctx || !LP.layers.length) { lcd("lcdPad", "MIX", "pas encore de boucles dans cette bank"); return; }
    const ls = LP.layers, side = i => (i % 2 ? 1 : -1);
    if (kind === "flat") ls.forEach(l => { setLayerPan(l, 0); setLayerHp(l, false); });
    if (kind === "wide" || kind === "narrow") ls.forEach((l, i) => setLayerPan(l, ls.length === 1 ? 0 : side(i) * (kind === "wide" ? 0.5 : 0.18)));
    if (kind === "auto") {
      const a = ls.map(l => analyse(l.buf)), bass = a.map(x => x.low > 0.45);
      const dbs = a.map(x => 20 * Math.log10(Math.max(1e-5, x.rms))), mean = dbs.reduce((s, v) => s + v, 0) / dbs.length;
      const vols = dbs.map((v, i) => Math.pow(10, (Math.max(-8, Math.min(6, -(v - mean) * 0.6)) + (bass[i] ? 1.5 : 0)) / 20)), mx = Math.max(...vols);
      ls.forEach((l, i) => setLayerVol(i, Math.max(0.3, Math.min(1, vols[i] / mx * 0.95))));
      const others = ls.map((l, i) => i).filter(i => !bass[i]).sort((x, y) => a[x].high - a[y].high);
      ls.forEach((l, i) => { if (bass[i]) { setLayerPan(l, 0); setLayerHp(l, false); } });
      others.forEach((i, k) => { const w = others.length === 1 ? 0 : 0.15 + 0.35 * (k / Math.max(1, others.length - 1)); setLayerPan(ls[i], (k % 2 ? 1 : -1) * w); setLayerHp(ls[i], a[i].low < 0.25); });
      syncLoopKnobs();
    }
    if (MIX.redraw) MIX.redraw();
    lcd("lcdPad", "MIX", { auto: "AUTO : niveaux rapprochés, basses au centre, le reste écarté", flat: "À PLAT : tout au centre, sans coupe-bas", wide: "LARGE : pistes écartées gauche / droite", narrow: "ÉTROIT : image resserrée, esprit lo-fi" }[kind]);
  }
  document.querySelectorAll("[data-mixp]").forEach(b => b.addEventListener("click", () => mixPreset(b.dataset.mixp)));
  function drawMixMeters() {
    if ($("mixSheet").hidden || !ctx) return;
    strips.forEach(o => {
      if (o.empty || !o.meter) return;
      const node = o.node(); if (!node) return;
      if (!o.an || o.anNode !== node) { o.an = ctx.createAnalyser(); o.an.fftSize = 256; node.connect(o.an); o.anNode = node; }
      const v = level(o.an); o.meter.style.height = Math.min(FH + 18, Math.sqrt(v) * (FH + 18)) + "px"; o.meter.style.background = v > 0.9 ? "var(--red)" : "var(--green)";
    });
  }
  $("mixBtn").addEventListener("click", () => { buildMixer(); $("mixSheet").hidden = false; });
  $("mixClose").addEventListener("click", () => { $("mixSheet").hidden = true; });

