  // ---------- Looper ----------
  const LP = { t0F: null, Lf: 0, beats: 4, layers: [], pending: null, playing: true };
  // Banks A, B, C : 6 pistes chacune, et les 3 banks jouent ENSEMBLE (18 pistes au plus). La bank affichée est celle
  // que l'écran, les pads de muet / solo, FX, SP et la table de mixage commandent. Le tempo (LP.Lf, LP.beats) est commun.
  const NB = 3;
  const SQ = { list: Array.from({ length: NB }, () => []), cur: 0, next: -1, sw: null, metro: false, metroF: 0, solo: [] };
  SQ.list[0] = LP.layers;
  const allLayers = () => SQ.list.flat();
  const cycAll = () => cycF(allLayers());
  const gcdI = (x, y) => y ? gcdI(y, x % y) : x;
  function cycF(layers) { let k = 1; layers.forEach(l => { k = k * l.k / gcdI(k, l.k); }); return Math.min(k, 8) * LP.Lf; }
  function seqOf(l) { return SQ.list.findIndex(x => x.includes(l)); }
  function syncLoopKnobs() { LP.layers.forEach((l, i) => { knobVals.loops[i] = l.vol; }); for (let i = LP.layers.length; i < 6; i++) knobVals.loops[i] = 1; if (tab === "loops" || tab === "song") drawKnobs(); }
  // Change la bank affichée (le son ne change pas : toutes les banks continuent de jouer)
  function showBank(i) {
    SQ.solo[SQ.cur] = LP.solo; SQ.cur = i; LP.layers = SQ.list[i]; LP.solo = SQ.solo[i] || null; LP.sel = -1;
    routeFx(); syncLoopKnobs(); drawSeqSel();
  }
  // clavier de l'Akai dans LOOPER : do, ré, mi (les 3 premières touches blanches) = bank A, B, C ; le reste joue SONS
  function bankKey(note) { const w = [0, 2, 4].indexOf(note - 48); if (w < 0) return false; selectSeq(w); return true; }
  function selectSeq(i) {
    if (!ctx || i < 0 || i >= NB) return;
    if (i === SQ.cur) { drawSeqSel(); return; }
    if (LP.pending) { lcd("lcdPad", "BANK", "attends la fin de l'enregistrement"); return; }
    if (LPR.rec && !LPR.rec.song) { lcd("lcdPad", "BANK", "impression en cours : attends la fin"); return; }
    showBank(i);
    const n = SQ.list[i].length, on = SQ.list[i].filter(l => !l.muted).length;
    lcd("lcdPad", "BANK " + SEQ_N[i], n ? `${n} piste(s) · ${on} audible(s)` : "vide · REC pour la remplir");
  }
  function seqTick() {
    if (!ctx || LP.t0F === null) return;
    const nowF = ctx.currentTime * sr;
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
  // Sélecteur de banks du LOOPER (toucher : afficher ; glisser une bank sur une autre : copier)
  function drawSeqSel() {
    try { drawLenBar(); } catch (e) {}
    try { spRoute(); drawSpTargets(); } catch (e) {}
    try { scheduleKey(); } catch (e) {}
    drawBanks(); drawTargetNames(); try { drawMixPresets(); } catch (e) {}
    $("metroBtn").classList.toggle("on", SQ.metro); $("trMetro").classList.toggle("on", SQ.metro);
  }
  function drawBanks() {
    for (let i = 0; i < NB; i++) {
      const on = SQ.list[i].filter(l => !l.muted).length;
      document.querySelectorAll(`[data-bank="${i}"]`).forEach(b => {
        b.classList.toggle("on", i === SQ.cur); b.classList.toggle("has", SQ.list[i].length > 0); b.classList.toggle("live", on > 0);
        const c = b.querySelector("small"); if (c) c.textContent = SQ.list[i].length ? `${on}/${SQ.list[i].length}` : "";
      });
    }
    // table de mixage ouverte : on la reconstruit si la bank ou le nombre de pistes a changé
    try { if (MIX.redraw) { if (!$("mixSheet").hidden && (MIX.bank !== SQ.cur || MIX.n !== LP.layers.length)) buildMixer(); else MIX.redraw(); } } catch (e) {}
  }
  function copySeq(a, b) {
    if (a === b || !SQ.list[a].length) return;
    const old = SQ.list[b].slice();
    // la copie arrive coupée : les banks jouent ensemble, sinon on entendrait tout en double
    const make = () => SQ.list[a].map(l => { const gain = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 256; gain.gain.value = 0; gain.connect(loopBus); return { buf: l.buf, k: l.k, m: l.m, gain, an, vol: l.vol, muted: true, src: null, pan: l.pan || 0, hp: !!l.hp, notes: l.notes || [], name: l.name || "" }; });
    const put = arr => { const T = SQ.list[b]; T.forEach(l => { stopLayer(l); try { l.gain.disconnect(); } catch (e) {} }); T.length = 0; arr.forEach(l => { l.gain.gain.value = l.muted ? 0 : l.vol; T.push(l); }); routeFx(); if (LP.playing) T.forEach(l => startLayer(l, ctx.currentTime + 0.005)); if (b === SQ.cur) syncLoopKnobs(); drawSeqSel(); };
    const fresh = make(); put(fresh);
    pushHist(`copie ${SEQ_N[a]} → ${SEQ_N[b]}`, () => put(old), () => put(fresh));
    lcd("lcdPad", "BANK", `${SEQ_N[a]} copiée sur ${SEQ_N[b]} · pistes coupées, rétablis celles que tu veux`);
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
    if (p && p.type === "layer") { if (p.half) p.half = false; else p.k = Math.min(8, p.k + 1); return; }
    if (p) return;
    if (LP.layers.length >= MAX_LAYERS) { lcdFull = performance.now(); return; }
    // Avec un casque à retard, on raisonne sur ce que l'oreille entend.
    const heardF = now * sr - compF();
    const rel = heardF - LP.t0F;
    const cyc = Math.floor(rel / LP.Lf);
    const pos = rel - cyc * LP.Lf;
    const m = pos < 0.15 * LP.Lf ? cyc : cyc + 1;
    const nl = LP.nextLen || "1";
    LP.pending = { type: "layer", m, sF: LP.t0F + m * LP.Lf, k: nl === "h" ? 1 : +nl, half: nl === "h" && LP.beats % 2 === 0, comp: compF() };
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
      addLayer(buf, 1, 0, true, notesIn(sF, eF - sF));
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
    const len = p.half ? Math.floor(LP.Lf / 2) : p.k * LP.Lf, eF = p.sF + len + p.comp;
    if (capLatest >= eF) {
      let buf = extract(p.sF + p.comp, len), notes = notesIn(p.sF + p.comp, len);
      LP.pending = null;
      // ÷2 : la demi-boucle jouée deux fois remplit un tour de boucle
      if (buf && p.half) { const full = ctx.createBuffer(buf.numberOfChannels, LP.Lf, buf.sampleRate); for (let c = 0; c < buf.numberOfChannels; c++) { const a = buf.getChannelData(c), d = full.getChannelData(c); for (let j = 0; j < LP.Lf; j++) d[j] = a[j % a.length]; } buf = full; notes = notes.concat(notes.map(n => ({ ...n, at: n.at + len }))); }
      if (buf) addLayer(buf, p.half ? 1 : p.k, p.m, true, notes);
    }
  }
  function addLayer(buf, k, m, hist = true, notes = null) {
    const idx = LP.layers.length;
    const gain = ctx.createGain();
    const an = ctx.createAnalyser(); an.fftSize = 256;
    const l = { buf, k, m, gain, an, vol: knobVals.loops[idx] ?? 1, muted: false, src: null, notes: notes || [] };
    gain.gain.value = l.vol;
    gain.connect(loopBus);
    LP.layers.push(l); LP.sel = -1;
    routeFx();
    if (LP.playing) startLayer(l, ctx.currentTime + 0.005);
    // nouvelle piste plus longue (×2, ×4) : les autres se mettent à sa longueur
    const plan = hist ? equalizePlan() : [];
    if (plan.length) applyPlan(plan, "now");
    if (hist) { const st = { Lf: LP.Lf, beats: LP.beats, si: SQ.cur }; pushHist("nouvelle piste " + (idx + 1), () => { dropLayer(l); applyPlan(plan, "old"); drawSeqSel(); }, () => { reinsertLayer(l, idx, st); applyPlan(plan, "now"); drawSeqSel(); }, plan.length > 0); }
    drawSeqSel();
  }
  function dropLayer(l) {
    const si = seqOf(l); if (si < 0) return;
    if (si === SQ.cur) removeLayer(LP.layers.indexOf(l), false);
    else { SQ.list[si].splice(SQ.list[si].indexOf(l), 1); stopLayer(l); try { l.gain.disconnect(); } catch (e) {} }
    drawSeqSel();
  }
  function reinsertLayer(l, idx, st) {
    if (LP.t0F === null && st) { LP.Lf = st.Lf; LP.beats = st.beats; LP.t0F = Math.round((ctx.currentTime + 0.03) * sr); LP.playing = true; }
    const si = st && st.si !== undefined ? st.si : SQ.cur, arr = SQ.list[si];
    arr.splice(Math.min(idx, arr.length), 0, l);
    routeFx();
    l.gain.gain.setValueAtTime(l.muted ? 0 : l.vol, ctx.currentTime);
    if (LP.playing) startLayer(l, ctx.currentTime + 0.005);
    drawSeqSel();
  }
  // chaîne de chaque piste : coupe-bas → panoramique → volume (réglés dans la table de mixage)
  function layerIn(l) {
    if (!l.pn) {
      l.hpf = ctx.createBiquadFilter(); l.hpf.type = "highpass"; l.hpf.Q.value = 0.7;
      l.pn = ctx.createStereoPanner(); l.hpf.connect(l.pn); l.pn.connect(l.gain);
    }
    l.hpf.frequency.value = l.hp ? 120 : 10; l.pn.pan.value = l.pan || 0;
    return l.hpf;
  }
  function startLayer(l, T) {
    const Lk = l.k * LP.Lf;
    const sF = LP.t0F + l.m * LP.Lf;
    const phase = (((T * sr - sF) % Lk) + Lk) % Lk;
    const src = ctx.createBufferSource();
    src.buffer = l.buf; src.loop = true;
    src.connect(layerIn(l));
    src.start(T, phase / sr);
    l.src = src;
  }
  function stopLayer(l) { if (l.src) { try { l.src.stop(); } catch (e) {} l.src.disconnect(); l.src = null; } }
  function stopAll() { perfOnStop(); if (typeof drStop === "function") drStop(); allLayers().forEach(stopLayer); LP.playing = false; SQ.sw = null; if (SONG.playing) songStop(); if (LP.pending && LP.pending.type === "layer") LP.pending = null; }
  function playAll() {
    if (!ctx || LP.t0F === null) return;
    const T = ctx.currentTime + 0.03;
    LP.t0F = Math.round(T * sr); SQ.metroF = 0; SQ.sw = null;
    allLayers().forEach(l => { stopLayer(l); startLayer(l, T); });
    LP.playing = true;
    perfOnPlay();
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
    SQ.cur = 0; SQ.solo = []; SQ.mixp = []; LP.solo = null; LP.layers = SQ.list[0]; LP.t0F = null; LP.Lf = 0; LP.pending = null; LP.playing = true; SQ.next = -1; SQ.sw = null;
    drawSeqSel();
  }
  function undo() { if (LP.pending) { LP.pending = null; return; } removeLayer(LP.layers.length - 1); }
  // ---------- Longueurs : prochaine piste (×1, ×2, ×4, ÷2) et piste existante (÷2, ×2) ----------
  const LEN_ORDER = ["h", "1", "2", "4"], LEN_NAME = { h: "÷2", 1: "×1", 2: "×2", 4: "×4" };
  LP.nextLen = "1"; LP.sel = -1;
  // Quand une piste devient plus longue (×2, ×4), les pistes plus courtes sont recopiées bout à bout jusqu'à la même
  // longueur : on entend exactement la même chose, mais toutes les pistes ont la même durée (fusion, export, ÷2 plus simples).
  function equalizePlan() {
    const K = Math.max(1, ...LP.layers.map(l => l.k)), plan = [];
    LP.layers.forEach(l => {
      if (l.k >= K || K % l.k) return;
      const r = K / l.k, n = l.buf.length, notes = l.notes || [];
      plan.push({ l, old: { buf: l.buf, k: l.k, notes }, now: { buf: repeatBuf(l.buf, r), k: K, notes: Array.from({ length: r }, (_, q) => notes.map(x => ({ ...x, at: x.at + q * n }))).flat() } });
    });
    return plan;
  }
  function applyPlan(plan, which) { plan.forEach(p => { stopLayer(p.l); Object.assign(p.l, p[which]); if (LP.playing) startLayer(p.l, ctx.currentTime + 0.005); }); }
  function repeatBuf(b, n) { const o = ctx.createBuffer(b.numberOfChannels, b.length * n, b.sampleRate); for (let c = 0; c < b.numberOfChannels; c++) { const s = b.getChannelData(c), d = o.getChannelData(c); for (let r = 0; r < n; r++) d.set(s, r * b.length); } return o; }
  function setNextLen(v) {
    LP.nextLen = v; drawLenBar();
    lcd("lcdLoop", "BOUCLE", `prochaine piste : ${LEN_NAME[v]}` + (v === "h" ? " (demi-boucle répétée)" : v === "1" ? "" : ` (${v} tours de boucle)`));
  }
  function selLayer() { const i = LP.sel >= 0 && LP.layers[LP.sel] ? LP.sel : LP.layers.length - 1; return i; }
  function resizeLayer(i, mode) {
    const l = LP.layers[i]; if (!l || !ctx) return;
    const old = { buf: l.buf, k: l.k, m: l.m, notes: l.notes };
    const LkL = l.k * LP.Lf, n = l.buf.length;
    let buf, k = l.k, m = l.m, notes = l.notes || [];
    if (mode === "double") {
      if (l.k * 2 > 8) { lcd("lcdLoop", "BOUCLE", "piste déjà trop longue pour ×2"); return; }
      buf = repeatBuf(l.buf, 2); k = l.k * 2; notes = notes.concat(notes.map(x => ({ ...x, at: x.at + n })));
    } else {
      // ÷2 : garde la moitié qui joue en ce moment
      const off = l.m * LP.Lf, ph = LP.playing ? ((((ctx.currentTime * sr - compF() - LP.t0F - off) % LkL) + LkL) % LkL) : 0, h = ph < LkL / 2 ? 0 : 1, half = Math.floor(n / 2);
      const hb = ctx.createBuffer(l.buf.numberOfChannels, half, l.buf.sampleRate);
      for (let c = 0; c < l.buf.numberOfChannels; c++) hb.copyToChannel(l.buf.getChannelData(c).subarray(h * half, h * half + half), c);
      const hn = notes.filter(x => x.at >= h * half && x.at < (h + 1) * half).map(x => ({ ...x, at: x.at - h * half }));
      if (l.k % 2 === 0) { buf = hb; k = l.k / 2; m = l.m + h * k; notes = hn; }
      else { buf = ctx.createBuffer(l.buf.numberOfChannels, n, l.buf.sampleRate); for (let c = 0; c < l.buf.numberOfChannels; c++) { const src = hb.getChannelData(c), dst = buf.getChannelData(c); for (let j = 0; j < n; j++) dst[j] = src[j % half]; } notes = hn.concat(hn.map(x => ({ ...x, at: x.at + half }))); }
    }
    const apply = st => { stopLayer(l); Object.assign(l, st); if (LP.playing) startLayer(l, ctx.currentTime + 0.005); drawSeqSel(); };
    const now = { buf, k, m, notes };
    apply(now);
    const plan = mode === "double" ? equalizePlan() : [];
    if (plan.length) { applyPlan(plan, "now"); drawSeqSel(); }
    pushHist(`piste ${i + 1} ${mode === "double" ? "×2" : "÷2"}`, () => { applyPlan(plan, "old"); apply(old); }, () => { apply(now); applyPlan(plan, "now"); drawSeqSel(); }, plan.length > 0);
    lcd("lcdLoop", "BOUCLE", `piste ${i + 1} ${mode === "double" ? "doublée (×2)" : "coupée en deux (÷2)"}` + (plan.length ? ` · ${plan.length} autre(s) piste(s) mise(s) à la même longueur` : ""));
  }
  function drawLenBar() {
    if (!$("lenNext")) return;
    $("lenNext").textContent = "PROCHAINE : " + LEN_NAME[LP.nextLen];
    $("lcdLen").textContent = LEN_NAME[LP.nextLen]; $("lcdLen").classList.toggle("on", LP.nextLen !== "1");
    const i = selLayer();
    $("lenSel").textContent = LP.layers.length ? layerName(i, true) : "PISTE —";
  }
  function toggleMute(i) {
    const l = LP.layers[i]; if (!l) return;
    LP.solo = null;
    l.muted = !l.muted;
    l.gain.gain.setTargetAtTime(l.muted ? 0 : l.vol, ctx.currentTime, 0.01);
    perfMark(); drawBanks();
  }
  // Commandes du looper aux pads : tout couper, tout rétablir, solo, arrêt en ralentissant, lecture
  function setMute(l, m) { l.muted = m; l.gain.gain.setTargetAtTime(m ? 0 : l.vol, ctx.currentTime, 0.01); }
  function muteAll(m) { if (!ctx) return; LP.solo = null; LP.layers.forEach(l => setMute(l, m)); perfMark(); drawBanks(); lcd("lcdLoop", "BOUCLE", m ? "toutes les pistes coupées" : "toutes les pistes rétablies"); }
  function soloLayer(i) {
    if (!ctx || !LP.layers[i]) return;
    if (LP.solo && LP.solo.i === i) { LP.layers.forEach((l, j) => setMute(l, LP.solo.saved[j] ?? false)); LP.solo = null; perfMark(); drawBanks(); lcd("lcdLoop", "BOUCLE", "solo terminé"); return; }
    const saved = LP.solo ? LP.solo.saved : LP.layers.map(l => l.muted);
    LP.layers.forEach((l, j) => setMute(l, j !== i));
    LP.solo = { i, saved }; perfMark(); drawBanks();
    lcd("lcdLoop", "BOUCLE", `solo piste ${i + 1}`);
  }
  function tapeStopAll() {
    if (!ctx || !LP.playing) return;
    const t = ctx.currentTime, dur = 0.9;
    allLayers().forEach(l => { if (!l.src) return; const r = l.src.playbackRate; r.cancelScheduledValues(t); r.setValueAtTime(r.value, t); r.exponentialRampToValueAtTime(0.02, t + dur); });
    loopBus.gain.cancelScheduledValues(t); loopBus.gain.setValueAtTime(loopBus.gain.value, t + dur * 0.6); loopBus.gain.linearRampToValueAtTime(0, t + dur);
    const vol = knobVals.loops[6];
    setTimeout(() => { stopAll(); loopBus.gain.cancelScheduledValues(ctx.currentTime); loopBus.gain.setValueAtTime(vol, ctx.currentTime); lcd("lcdLoop", "BOUCLE", "arrêt (tape stop)"); }, dur * 1000 + 30);
  }
  function playLoops() { if (!ctx || LP.t0F === null) return; if (!LP.playing) playAll(); }

  $("btnRec").addEventListener("pointerdown", e => { e.preventDefault(); recPress(); });
  // bouton de l'écran, au-dessus du cercle : ×1 → ×2 → ×4 → ÷2 → ×1
  $("lcdLen").addEventListener("click", () => setNextLen({ 1: "2", 2: "4", 4: "h", h: "1" }[LP.nextLen]));
  $("lenNext").addEventListener("click", () => setNextLen(LEN_ORDER[(LEN_ORDER.indexOf(LP.nextLen) + 1) % LEN_ORDER.length]));
  $("lenSel").addEventListener("click", () => { if (!LP.layers.length) return; LP.sel = (selLayer() + 1) % LP.layers.length; drawLenBar(); });
  $("lenHalf").addEventListener("click", () => resizeLayer(selLayer(), "half"));
  $("lenDouble").addEventListener("click", () => resizeLayer(selLayer(), "double"));
  $("btnUndo").addEventListener("click", undo);
  $("btnPlay").addEventListener("click", togglePlay);
  let clearTimer = null;
  $("btnClear").addEventListener("pointerdown", e => { e.currentTarget.classList.add("holding"); clearTimer = setTimeout(() => {
    const ls = LP.layers.slice(), st = { Lf: LP.Lf, beats: LP.beats, si: SQ.cur };
    resetLooper(); $("btnClear").classList.remove("holding");
    if (ls.length) pushHist("effacer la bank " + SEQ_N[st.si], () => ls.forEach((l, i) => reinsertLayer(l, i, st)), () => ls.forEach(dropLayer));
  }, 700); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => $("btnClear").addEventListener(ev, () => { clearTimeout(clearTimer); $("btnClear").classList.remove("holding"); }));

