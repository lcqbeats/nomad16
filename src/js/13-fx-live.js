  // ---------- FX LIVE ----------
  // Motifs d'une mesure (16 doubles croches) rejoués à partir de la mesure qui vient de passer.
  // s : double croche source, d : subdivision (roll), r0→r1 : vitesse, v : à l'envers, g : niveau, s = -1 : son direct.
  const R16 = f => Array.from({ length: 16 }, (_, j) => f(j));
  const R32 = f => Array.from({ length: 32 }, (_, j) => f(j));
  // pas : s = double croche source (dans la mesure qui précède), d = roulement, r0→r1 = vitesse, v = à l'envers,
  // g = niveau, f→f1 = filtre (−1 grave … 0 ouvert … +1 aigu), x = bitcrush, s = −1 : son direct. 16 pas = 1 mesure, 32 = 2 mesures.
  const FX_PATTERNS = [
    // BANK 1 : réarrangements rythmiques
    { name: "BUILD-UP", sub: "2 mesures qui montent", steps: R32(j => j < 16 ? { s: j, f: j / 40, f1: (j + 1) / 40 } : { s: 12 + ((j - 16) >> 2) % 4, d: [1, 2, 4, 8][(j - 16) >> 2 & 3], r0: 1 + (j - 16) * 0.012, f: 0.4 + (j - 16) * 0.025 }) },
    { name: "BOOM CHOP", sub: "kicks doublés, fin à l'envers", steps: R16(j => j >= 14 ? { s: 15 - (j - 14), v: 1 } : { s: [0, 0, 2, 3, 4, 4, 6, 7, 8, 8, 10, 11, 12, 13][j] }) },
    { name: "HALF & BACK", sub: "demi-vitesse puis retour", steps: R32(j => j < 16 ? { s: j * 0.5, r0: 0.5, f: -0.15 } : { s: j - 16 }) },
    { name: "DROP", sub: "coupure filtrée et relance", steps: R16(j => j < 8 ? { s: j } : j < 12 ? { s: j, f: -0.55, f1: -0.8, g: 0.9 } : j < 14 ? { s: 0, g: 0 } : { s: 12, d: 4, r0: 1.1 }) },
    { name: "REVERSE TAIL", sub: "chaque fin de mesure à l'envers", steps: R32(j => (j & 15) >= 12 ? { s: 15 - ((j & 15) - 12), v: 1, f: 0.15 } : { s: j & 15 }) },
    { name: "TRAP ROLLS", sub: "roulements en triolets", steps: R16(j => ({ s: j, d: [1, 1, 2, 1, 1, 1, 3, 1, 1, 1, 2, 1, 3, 3, 4, 6][j], r0: j >= 12 ? 1 + (j - 12) * 0.04 : 1 })) },
    { name: "SCRATCH CUT", sub: "platine et coupures", steps: R16(j => j % 4 === 3 ? { s: 0, g: 0 } : j % 2 ? { s: (j >> 2) * 4, v: 1, r0: 1.7, r1: 0.4 } : { s: (j >> 2) * 4, r0: 2.1, r1: 0.5 }) },
    { name: "STOP & GO", sub: "la bande cale et repart", steps: R16(j => j < 6 ? { s: j } : j === 6 ? { s: 6, r0: 1, r1: 0.6 } : j === 7 ? { s: 7, r0: 0.6, r1: 0.3, f: -0.3 } : j === 8 ? { s: 8, r0: 0.3, r1: 0.05, f: -0.6 } : j < 11 ? { s: 0, g: 0 } : j === 11 ? { s: 11, r0: 0.2, r1: 0.9 } : { s: j }) },
    // BANK 2 : textures et classiques
    { name: "STUTTER 1/16", sub: "répète la double croche", mode: "repeat", div: 4 },
    { name: "STUTTER 1/32", sub: "mitraillette", mode: "repeat", div: 8 },
    { name: "TAPE STOP", sub: "la bande ralentit", mode: "tapestop", div: 1 },
    { name: "REVERSE", sub: "tout à l'envers", mode: "reverse", div: 1 },
    { name: "GATE TRANCE", sub: "hachage filtré", steps: R16(j => ({ s: -1, g: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0][j], f: [-0.2, 0, -0.35, -0.1, 0, -0.45, 0, -0.15, -0.25, 0, -0.4, -0.1, 0, -0.5, -0.2, 0][j] })) },
    { name: "PITCH DOWN", sub: "le morceau s'effondre", steps: R16(j => ({ s: j * (1 - j / 40), r0: 1 - j / 34, f: -j / 40 })) },
    { name: "LO-FI CRUSH", sub: "de plus en plus sale", steps: R32(j => ({ s: j & 15, x: Math.min(0.85, j / 30), f: -j / 70 })) },
    { name: "FILTRE WOBBLE", sub: "filtre qui ondule", steps: R16(j => ({ s: -1, f: j % 4 < 2 ? -0.75 : 0.1, f1: j % 4 < 2 ? 0.1 : -0.75 })) },
    // MOTIFS 17 À 32 : plus élaborés (inspirés des lecteurs de motifs type Flex Beat), mais toujours calés et musicaux
    { name: "POLY 3", sub: "3 contre 4, puis retombe", steps: R16(j => ({ s: j < 12 ? j % 3 : j })) },
    { name: "SHUFFLE", sub: "les temps changent de place", steps: R16(j => ({ s: [0, 1, 6, 7, 4, 5, 2, 3, 8, 9, 14, 15, 12, 13, 10, 11][j] })) },
    { name: "ECHO ROLL", sub: "le dernier temps s'éteint en échos", steps: R16(j => j < 12 ? { s: j } : { s: 12, d: [2, 3, 4, 6][j - 12], g: [0.95, 0.8, 0.65, 0.5][j - 12], f: -(j - 12) * 0.12 }) },
    { name: "OFFBEAT STUT", sub: "les contretemps bégaient", steps: R16(j => { const o = [0, 1, 2, 3, 4, 5, 4, 5, 8, 9, 10, 11, 12, 13, 12, 13][j]; return o !== j ? { s: o, d: 2 } : { s: j }; }) },
    { name: "VINYL BRAKE", sub: "freine sur la 2e moitié", steps: (() => { const out = []; let pos = 8; for (let j = 0; j < 16; j++) { if (j < 8) { out.push({ s: j }); continue; } const k = j - 8, r0 = 1 - k / 8, r1 = Math.max(0.03, 1 - (k + 1) / 8); out.push({ s: pos, r0, r1, f: -k * 0.06, g: k === 7 ? 0.6 : 1 }); pos += (r0 + r1) / 2; } return out; })() },
    { name: "BACKSPIN", sub: "retour arrière et relance", steps: R16(j => j < 12 ? { s: j } : j < 15 ? { s: 12, v: 1, r0: 3, r1: 0.8 } : { s: 0, g: 0 }) },
    { name: "TRANSFORM", sub: "coupures rythmées", steps: R16(j => ({ s: -1, g: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1][j] })) },
    { name: "CHIRPS", sub: "petits scratchs sur chaque temps", steps: R16(j => { const b = (j >> 2) * 4; return j % 2 ? { s: b, v: 1, r0: 1.6, r1: 0.4 } : { s: b, r0: 0.4, r1: 1.6 }; }) },
    { name: "HALF CHOP", sub: "une mesure étirée sur deux", steps: R32(j => ({ s: j >> 1 })) },
    { name: "SWEEP HP", sub: "le bas s'en va sur 2 mesures", steps: R32(j => j < 30 ? { s: j & 15, f: 0.05 + j * 0.027, f1: 0.05 + (j + 1) * 0.027 } : { s: 0, g: 0 }) },
    { name: "DUB STAB", sub: "les 2 et 4 en échos dub", steps: R16(j => { const m = j % 8; if (m < 5) return { s: j }; return { s: j - m + 4, g: [0.75, 0.55, 0.4][m - 5], f: -0.25 - (m - 5) * 0.12 }; }) },
    { name: "GLITCH", sub: "accidents choisis", steps: [{ s: 0 }, { s: 1 }, { s: 1, d: 2 }, { s: 3 }, { s: 4 }, { s: 4, d: 4 }, { s: 6, v: 1 }, { s: 7 }, { s: 8 }, { s: 9 }, { s: 10, d: 3 }, { s: 10, d: 3 }, { s: 12 }, { s: 13, x: 0.5 }, { s: 14, d: 2, r0: 1.3 }, { s: 15, v: 1 }] },
    { name: "PITCH RISE", sub: "monte peu à peu", steps: (() => { const out = []; let pos = 0; for (let j = 0; j < 16; j++) { const r0 = 0.8 + j * 0.025, r1 = 0.8 + (j + 1) * 0.025; out.push({ s: pos, r0, r1, f: j * 0.015 }); pos += (r0 + r1) / 2; } return out; })() },
    { name: "CUT & REVERSE", sub: "2e temps à l'envers, 4e en roulement", steps: R16(j => { const b = j >> 2, k = j & 3; if (b === 1) return { s: 7 - k, v: 1 }; if (b === 3) return { s: 12, d: [1, 2, 4, 8][k] }; return { s: j }; }) },
    { name: "BABY SCRATCH", sub: "va-et-vient sur le premier temps", steps: R32(j => (j & 7) >= 6 ? { s: -1 } : j % 2 ? { s: (j >> 4) * 8, v: 1, r0: 1.8, r1: 0.3 } : { s: (j >> 4) * 8, r0: 0.3, r1: 1.8 }) },
    { name: "BREAKDOWN", sub: "s'éteint, ralentit, repart", steps: R32(j => j < 16 ? { s: j, f: -j * 0.04, f1: -(j + 1) * 0.04 } : j < 24 ? { s: 8 + (j - 16) * 0.5, r0: 0.5, f: -0.7 } : j < 28 ? { s: 12, d: 4, f: -0.6 + (j - 24) * 0.15 } : { s: 12 + (j - 28), d: [1, 2, 4, 8][j - 28], r0: 1 + (j - 28) * 0.03 }) }
  ];
  // Petit graphique du motif au-dessus du nom : la position lue dans le son par rapport à une lecture normale.
  // Ligne plate = lecture normale ; marches = répétitions ; pente = scratch, ralenti ou envers ; trous = coupures.
  function fxCurve(f) {
    const pts = [];
    if (f.steps) {
      const ns = f.steps.length, R = 12;
      for (let k = 0; k <= ns * R; k++) {
        const t = Math.min(ns - 1e-6, k / R), j = Math.floor(t), p = t - j, st = f.steps[j], sl = 1 / (st.d || 1), q = p % sl, r0 = st.r0 === undefined ? 1 : st.r0, r1 = st.r1 === undefined ? r0 : st.r1;
        let pos = r0 * q + (r1 - r0) * q * q / (2 * sl); if (st.v) pos = sl * Math.abs(r0) - pos;
        const g = st.g === undefined ? 1 : st.g;
        pts.push(g < 0.05 ? null : [t / ns, st.s < 0 ? 0 : st.s + pos - t]);
      }
    } else {
      let tp = 0;
      for (let k = 0; k <= 256; k++) {
        const t = k / 16, seg = 4 / (f.div || 1);
        if (f.mode === "tapestop") { const r = Math.max(0, 1 - t / 4); tp += r * r / 16; }
        const y = f.mode === "repeat" ? (t % seg) - t + Math.floor(t / seg) * seg * 0.85 : f.mode === "reverse" ? -2 * t : f.mode === "tapestop" ? tp - t : 0;
        pts.push([t / 16, y]);
      }
    }
    const ys = pts.filter(Boolean).map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo;
    const Y = y => span < 0.3 ? 15 : 4 + (hi - y) / span * 22;
    let d = "", pen = false, prev = null;
    pts.forEach(p => { if (!p) { pen = false; return; } const x = (4 + p[0] * 92).toFixed(1), y = Y(p[1]).toFixed(1); d += (pen ? "L" : "M") + x + " " + y; pen = true; prev = p; });
    return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  let fxBank = store.get("fxPage", 0);   // page de motifs : 0 = 1 à 16, 1 = 17 à 32
  let fxNode = null, fxFilt, fxCrush, fxPost, echoSend, echoDly, echoFb, springSend, fxMaster;
  let fxActive = -1, fxQuant = true, manualBpm = 90, fxTrig = store.get("fxTrig", "hold"), fxTarget = "all", fxOneT = null;
  const FXS = FX_PATTERNS;
  const fxEls = [];
  // 16 pads dans la disposition de l'onglet PADS (pad 1 en bas à gauche, comme sur l'Akai).
  // Téléphone : seuls les 8 pads de la banque choisie s'affichent ; ordinateur : les 16 d'un coup.
  [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].forEach(i => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "fxpad"; b.id = "fx" + i;
    b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); fxStart(i); });
    ["pointerup", "pointercancel"].forEach(ev => b.addEventListener(ev, () => fxStop(i)));
    $("fxgrid").appendChild(b); fxEls[i] = b;
  });
  const fxEl = i => fxEls[i] || null;
  function setFxBank(b) {
    if (b === fxBank) return;
    if (fxActive >= 0) fxEnd(fxActive);
    fxBank = b; store.set("fxPage", b); drawFxPads();
    lcd("lcdPad", "FX", b ? "motifs 17 à 32 (élaborés)" : "motifs 1 à 16");
    if (typeof fxDisp === "function") fxDisp(b ? "17+" : "1–16", b ? "MOTIFS 17 À 32" : "MOTIFS 1 À 16");
  }
  function drawFxPads() {
    for (let i = 0; i < 16; i++) { const n = fxBank * 16 + i, f = FXS[n], b = fxEls[i]; b.innerHTML = `<i></i>${fxCurve(f)}<b>${f.name}</b><span>${n + 1}</span>`; b.title = f.sub; b.classList.toggle("on", fxActive === i); b.classList.toggle("hold", fxTrig === "hold"); }
    $("fxSet").textContent = fxBank ? "MOTIFS 17–32 ⇄" : "MOTIFS 1–16 ⇄";
    $("fxSet").classList.toggle("on", !!fxBank);
    $("fxTrig").textContent = { hold: "MAINTIEN", one: "1 MESURE", latch: "VERROU" }[fxTrig];
    document.querySelectorAll(".fxt").forEach(b => b.classList.toggle("on", b.dataset.t === fxTarget));
  }
  function curBpm() { return LP.t0F !== null && LP.Lf ? 60 * LP.beats / loopLen() : manualBpm; }
  function drawFxBar() { $("fxBpm").textContent = curBpm().toFixed(1).replace(/\.0$/, "") + " BPM"; $("fxQuant").textContent = fxQuant ? "CALÉ 1/16" : "LIBRE"; $("fxQuant").classList.toggle("on", fxQuant); }
  $("fxQuant").addEventListener("click", () => { fxQuant = !fxQuant; drawFxBar(); });
  $("fxSet").addEventListener("click", () => setFxBank(1 - fxBank));
  $("fxTrig").addEventListener("click", () => { if (fxActive >= 0) fxEnd(fxActive); fxTrig = { hold: "one", one: "latch", latch: "hold" }[fxTrig]; store.set("fxTrig", fxTrig); drawFxPads(); });
  document.querySelectorAll(".fxt").forEach(b => b.addEventListener("click", () => setFxTarget(b.dataset.t)));
  // Cible des effets : tout le morceau, le jeu en direct, ou une seule piste du looper
  let fxDry = null;
  // Clavier de l'Akai dans FX : les 8 premières touches blanches (do à do) = TOUT, LIVE, P1 à P6 ; les noires ne font rien
  const FX_KEY_T = ["all", "live", "1", "2", "3", "4", "5", "6"];
  // renvoie true si la touche a servi de sélecteur ; les autres touches jouent SONS normalement
  function fxKey(note) {
    if (note - 48 === 1) { setFxBank(1 - fxBank); return true; }   // DO# : motifs 1–16 ⇄ 17–32
    const w = [0, 2, 4, 5, 7, 9, 11, 12].indexOf(note - 48);
    if (w < 0) return false;
    setFxTarget(FX_KEY_T[w]); return true;
  }
  function setFxTarget(t) { if (LPR.rec) return; fxTarget = t;
    // une piste ne peut être dans les effets SP et FX à la fois : FX la reprend
    if (/^\d$/.test(t) && typeof SPX !== "undefined" && SPX.target === t) { SPX.target = "all"; spRoute(); drawSpTargets(); }
    drawFxPrint(); fxDisp(t === "all" ? "FX" : t === "live" ? "LIV" : "P" + t, t === "all" ? "TOUT" : t === "live" ? "JEU EN DIRECT" : "PISTE " + t); routeFx(); drawFxPads(); lcd("lcdPad", "FX", "cible : " + (t === "all" ? "tout le morceau" : t === "live" ? "jeu en direct" : "piste " + t)); }
  function routeFx() {
    if (!fxDry) return;
    [liveBus, loopBus].forEach(n => { try { n.disconnect(master); } catch (e) {} try { n.disconnect(fxDry); } catch (e) {} });
    allLayers().forEach(l => { try { l.gain.disconnect(); } catch (e) {} });
    const k = /^\d$/.test(fxTarget) ? +fxTarget - 1 : -1;
    liveBus.connect(fxTarget === "all" || fxTarget === "live" ? master : fxDry);
    loopBus.connect(fxTarget === "all" ? master : fxDry);
    // P1 à P6 = pistes de la bank affichée ; les pistes des autres banks restent sur le bus des boucles
    allLayers().forEach(l => { const i = LP.layers.indexOf(l); if (typeof spLayer !== "undefined" && l === spLayer && sp) l.gain.connect(sp.lay); else if (i >= 0 && i === k) { l.gain.connect(fxSolo); } else l.gain.connect(loopBus); if (l.an) l.gain.connect(l.an); });
  }
  let fxSolo = null;
  // Impression des effets FX sur la piste choisie (même principe que SP)
  const fxLayer = () => /^\d$/.test(fxTarget) ? LP.layers[+fxTarget - 1] || null : null;
  function fxPrintToggle() {
    const l = fxLayer();
    if (!LPR.rec && !l && fxTarget !== "all" && fxTarget !== "live") { lcd("lcdPad", "FX", `piste ${fxTarget} vide`); return; }
    loopPrint({ who: "FX", layer: l, tap: fxMaster, gain: () => l.vol * (fxSolo ? fxSolo.gain.value || 1 : 1) * (fxMaster.gain.value || 1),
      ui: p => { drawFxPrint(); if (p === null) fxDisp("P" + fxTarget, "PISTE " + fxTarget); else fxDisp("PRT", Math.round(p * 100) + " %"); },
      done: () => { if (fxActive >= 0) fxEnd(fxActive); for (let k = 0; k < 7; k++) { knobVals.fx[k] = FX_HOME[k]; applyFxKnob(k); } if (tab === "fx") drawKnobs(); } });
  }
  function drawFxPrint() {
    const b = $("fxPrint"); if (!b) return;
    const pr = printing("FX"), lay = /^\d$/.test(fxTarget);
    b.classList.toggle("on", pr); b.classList.toggle("idle", !pr && !lay);
    b.textContent = pr ? `■ ARRÊTER · ${Math.round(LPR.rec.pct * 100)} %` : lay ? `● IMPRIMER SUR LA PISTE ${fxTarget}` : "● IMPRIMER : CHOISIS UNE PISTE";
  }
  $("fxPrint").addEventListener("click", fxPrintToggle);
  $("fxBpmDown").addEventListener("click", () => { manualBpm = Math.max(60, manualBpm - 1); drawFxBar(); applyFxKnob(3); });
  $("fxBpmUp").addEventListener("click", () => { manualBpm = Math.min(180, manualBpm + 1); drawFxBar(); applyFxKnob(3); });
  function fxDisp(big, small) { $("fxSeg").textContent = big; $("fxSegSub").textContent = small; }
  function fxStart(i) {
    if (!ctx || !fxNode) return;
    fxDisp("F" + String(fxBank * 16 + i + 1).padStart(2, "0"), FXS[fxBank * 16 + i].name);
    if (fxTrig === "latch" && fxActive === i) { fxEnd(i); return; }
    const f = FXS[fxBank * 16 + i], beatF = 60 / curBpm() * sr;
    const nowF = ctx.currentTime * sr, q = f.steps ? beatF : beatF / 4;
    const base = LP.t0F !== null ? LP.t0F : 0;
    const at = fxQuant ? base + Math.ceil((nowF - base) / q) * q : nowF;
    const one = fxTrig === "one";
    if (f.steps) fxNode.port.postMessage({ type: "start", mode: "pattern", steps: f.steps, stepLen: beatF / 4, one, at: Math.round(at) });
    else fxNode.port.postMessage({ type: "start", mode: f.mode, seg: beatF / f.div, dur: beatF, at: Math.round(at) });
    clearTimeout(fxOneT);
    if (one) fxOneT = setTimeout(() => fxEnd(i), ((at - nowF) / sr + (f.steps ? f.steps.length / 4 : 4) * beatF / sr) * 1000);
    if (fxActive >= 0 && fxEl(fxActive)) fxEl(fxActive).classList.remove("on");
    fxActive = i; fxEl(i).classList.add("on");
    lcd("lcdPad", "FX", f.name + " · " + f.sub);
  }
  function fxStop(i) { if (fxTrig === "hold") fxEnd(i); }
  function fxEnd(i) {
    if (fxActive !== i || !fxNode) return;
    fxNode.port.postMessage({ type: "stop" });
    if (fxEl(i)) fxEl(i).classList.remove("on"); fxActive = -1;
  }
  function crushCurve(bits) { const n = 4096, c = new Float32Array(n), st = Math.pow(2, bits - 1); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * st) / st; } return c; }
  function springIR() {
    const n = Math.floor(sr * 2.4), b = ctx.createBuffer(2, n, sr);
    let y = new Float32Array(n); y[0] = 1;
    const a = -0.62;
    for (let it = 0; it < 60; it++) { const z = new Float32Array(n); let px = 0, py = 0; for (let i = 0; i < n; i++) { const x = y[i]; const v = a * x + px - a * py; z[i] = v; px = x; py = v; } y = z; }
    const d = Math.floor(0.037 * sr);
    for (let ch = 0; ch < 2; ch++) {
      const o = b.getChannelData(ch); const off = ch * 37;
      for (let k = 0; k * d < n; k++) { const g = Math.pow(0.7, k); for (let i = 0; i + k * d + off < n; i++) o[i + k * d + off] += y[i] * g; }
      let lpv = 0, hpv = 0; for (let i = 0; i < n; i++) { lpv += 0.35 * (o[i] - lpv); hpv += 0.03 * (lpv - hpv); o[i] = (lpv - hpv) * Math.exp(-4.5 * i / n); }
    }
    return b;
  }
  function buildFx() {
    fxFilt = ctx.createBiquadFilter(); fxFilt.type = "lowpass"; fxFilt.frequency.value = 20000;
    fxCrush = ctx.createWaveShaper();
    fxPost = ctx.createGain(); fxMaster = ctx.createGain();
    let head = master;
    if (hasWorklet) {
      fxNode = new AudioWorkletNode(ctx, "nomad-fx", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
      master.connect(fxNode); head = fxNode;
    }
    head.connect(fxFilt); fxFilt.connect(fxCrush); fxCrush.connect(fxPost); fxPost.connect(fxMaster); fxMaster.connect(fxOut);
    fxDry = ctx.createGain(); fxDry.connect(fxOut);
    fxSolo = ctx.createGain(); fxSolo.connect(master);
    // Écho dub : envoi ponctuel, filtres et saturation dans la boucle de retour
    echoSend = ctx.createGain(); echoSend.gain.value = 0;
    echoDly = ctx.createDelay(3); echoFb = ctx.createGain();
    const eh = ctx.createBiquadFilter(); eh.type = "highpass"; eh.frequency.value = 180;
    const el = ctx.createBiquadFilter(); el.type = "lowpass"; el.frequency.value = 2600;
    const es = ctx.createWaveShaper(); es.curve = makeDriveCurve(0.05);
    // limiteur dans la boucle de retour : l'écho ne peut plus s'emballer
    const eLim = ctx.createDynamicsCompressor(); eLim.threshold.value = -14; eLim.knee.value = 6; eLim.ratio.value = 20; eLim.attack.value = 0.002; eLim.release.value = 0.12;
    fxPost.connect(echoSend); echoSend.connect(echoDly); echoDly.connect(eh); eh.connect(el); el.connect(es); es.connect(eLim); eLim.connect(echoFb); echoFb.connect(echoDly);
    const echoRet = ctx.createGain(); echoRet.gain.value = 0.8; es.connect(echoRet); echoRet.connect(fxMaster);
    // Réverbe à ressort
    springSend = ctx.createGain(); springSend.gain.value = 0;
    const spr = ctx.createConvolver(); spr.normalize = true; spr.buffer = springIR();
    const sprRet = ctx.createGain(); sprRet.gain.value = 0.9;
    fxPost.connect(springSend); springSend.connect(spr); spr.connect(sprRet); sprRet.connect(fxMaster);
    for (let k = 0; k < 8; k++) applyFxKnob(k);
    drawFxBar(); drawFxPads(); routeFx();
  }
  const ECHO_DIVS = [0.5, 0.75, 1, 1.5, 2];
  const ECHO_NAMES = ["1/8", "1/8 pointée", "1/4", "3/8", "1/2"];
  // Potards FX = modulation : ils reviennent à leur position de départ dès qu'on les lâche (sauf Temps et Master)
  const FX_SPRING = [0, 1, 2, 4, 5, 6], FX_HOME = knobVals.fx.slice(), fxGlide = [], fxGest = [], fxPhys = [], fxIdle = [];
  function fxGlideStop(k) { cancelAnimationFrame(fxGlide[k]); fxGlide[k] = 0; }
  function fxSpringBack(k) {
    fxGlideStop(k);
    const from = knobVals.fx[k], to = FX_HOME[k], t0 = performance.now();
    if (Math.abs(from - to) < 0.002) return;
    const step = () => {
      const a = Math.min(1, (performance.now() - t0) / 220), v = from + (to - from) * (1 - Math.pow(1 - a, 3));
      knobVals.fx[k] = v; applyFxKnob(k); if (tab === "fx") $("dial" + k).style.setProperty("--v", v);
      if (a < 1) fxGlide[k] = requestAnimationFrame(step);
    };
    fxGlide[k] = requestAnimationFrame(step);
  }
  // potard de l'Akai dans FX : chaque geste part de la position de départ (déplacement relatif), retour au repos
  function fxModKnob(k, v) {
    const val = v / 127;
    if (!fxGest[k]) { fxGlideStop(k); fxGest[k] = { ref: fxPhys[k] ?? val }; }
    fxPhys[k] = val;
    const nv = Math.min(1, Math.max(0, FX_HOME[k] + (val - fxGest[k].ref)));
    knobVals.fx[k] = nv; applyFxKnob(k); if (tab === "fx") $("dial" + k).style.setProperty("--v", nv);
    clearTimeout(fxIdle[k]); fxIdle[k] = setTimeout(() => { fxGest[k] = null; fxSpringBack(k); }, 380);
  }
  function applyFxKnob(k) {
    if (!fxFilt) return;
    const v = knobVals.fx[k], t = ctx.currentTime;
    if (k === 0) {
      if (v < 0.47) { fxFilt.type = "lowpass"; fxFilt.frequency.setTargetAtTime(60 * Math.pow(18000 / 60, v / 0.47), t, 0.02); }
      else if (v > 0.53) { fxFilt.type = "highpass"; fxFilt.frequency.setTargetAtTime(20 * Math.pow(6000 / 20, (v - 0.53) / 0.47), t, 0.02); }
      else { fxFilt.type = "lowpass"; fxFilt.frequency.setTargetAtTime(20000, t, 0.02); }
    }
    if (k === 1) fxFilt.Q.setTargetAtTime(0.7 + v * v * 16, t, 0.02);
    if (k === 2) echoSend.gain.setTargetAtTime(v * v, t, 0.015);
    if (k === 3) { const i = Math.min(4, Math.floor(v * 5)); echoDly.delayTime.setTargetAtTime(Math.min(2.9, 60 / curBpm() * ECHO_DIVS[i]), t, 0.05); if (tab === "fx") lcd("lcdPad", "FX", "écho " + ECHO_NAMES[i]); }
    if (k === 4) echoFb.gain.setTargetAtTime(Math.min(0.82, v * 0.9), t, 0.02);
    if (k === 5) springSend.gain.setTargetAtTime(v * v * 1.2, t, 0.02);
    if (k === 6) fxCrush.curve = v < 0.03 ? null : crushCurve(Math.round(14 - v * 11));
    if (k === 7) fxMaster.gain.setTargetAtTime(v * 1.2, t, 0.02);
  }

