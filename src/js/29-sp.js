  // ---------- SP : station de couleur façon sampler de poche ----------
  // 16 effets sur les 16 pads (appui court = verrou, appui long = tant qu'on tient), plusieurs à la fois.
  // Potards : réglage 1, réglage 2 et dosage de l'effet choisi ; isolateur graves / médiums / aigus ; sortie.
  const SPX = { on: true, cur: 0 };
  const SP_FX = [
    // banque A : couleur
    { id: "comp", name: "SP COMP", sub: "écrase et fait pomper", p: ["Écrasement", "Pompe"], a: 0.65, b: 0.5 },
    { id: "vinyl", name: "VINYL SIM", sub: "craquements, bande étroite", p: ["Craquements", "Usure"], a: 0.5, b: 0.55 },
    { id: "tape", name: "CASSETTE", sub: "pleurage et saturation", p: ["Pleurage", "Saturation"], a: 0.5, b: 0.4 },
    { id: "lofi", name: "LO-FI", sub: "moins de bits, moins d'aigus", p: ["Bits", "Échantillonnage"], a: 0.45, b: 0.45 },
    { id: "filt", name: "FILTRE + DRIVE", sub: "passe-bas résonant saturé", p: ["Fréquence", "Drive"], a: 0.45, b: 0.45 },
    { id: "hpf", name: "PASSE-HAUT", sub: "on retire le bas", p: ["Fréquence", "Résonance"], a: 0.4, b: 0.35 },
    { id: "radio", name: "RADIO", sub: "petit poste qui grésille", p: ["Couleur", "Grésillement"], a: 0.5, b: 0.4 },
    { id: "sat", name: "SATURATION", sub: "ampli poussé", p: ["Drive", "Tonalité"], a: 0.45, b: 0.5 },
    // banque B : espace et jeu
    { id: "loop", name: "LOOPER DJ", sub: "bégaie la fin du temps", p: ["Longueur", "Vitesse"], a: 0.5, b: 0.5 },
    { id: "echo", name: "ÉCHO", sub: "écho à bande au tempo", p: ["Temps", "Retours"], a: 0.5, b: 0.45 },
    { id: "verb", name: "RÉVERBE", sub: "salle sombre", p: ["Taille", "Brillance"], a: 0.5, b: 0.4 },
    { id: "slice", name: "SLICER", sub: "coupe au rythme", p: ["Division", "Profondeur"], a: 0.5, b: 0.9 },
    { id: "kbass", name: "KILL BASSES", sub: "plus de basses", p: ["Fréquence", "—"], a: 0.45, b: 0 },
    { id: "khigh", name: "KILL AIGUS", sub: "plus d'aigus", p: ["Fréquence", "—"], a: 0.45, b: 0 },
    { id: "flang", name: "FLANGER", sub: "avion qui passe", p: ["Vitesse", "Profondeur"], a: 0.3, b: 0.6 },
    { id: "chorus", name: "DÉSACCORD", sub: "bande qui dérive", p: ["Vitesse", "Profondeur"], a: 0.35, b: 0.5 }
  ];
  const SP_ORDER = ["lofi", "vinyl", "tape", "filt", "hpf", "radio", "sat", "kbass", "khigh", "flang", "chorus", "slice", "loop", "echo", "verb", "comp"];
  const spState = store.get("spFx", null);
  SP_FX.forEach((f, i) => { f.on = false; f.m = 1; if (spState && spState[i]) { f.a = spState[i].a; f.b = spState[i].b; f.m = spState[i].m ?? 1; } });
  const spSave = () => store.set("spFx", SP_FX.map(f => ({ a: f.a, b: f.b, m: f.m })));
  let sp = null;
  const spBeat = () => 60 / (typeof curBpm === "function" ? curBpm() : 90);
  function buildSp(input, output) {
    sp = { u: {} };
    const t0 = ctx.currentTime;
    const G = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const BQ = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const WS = c => { const w = ctx.createWaveShaper(); w.curve = c; w.oversample = "2x"; return w; };
    const LFO = (f, depth, target, type) => { const o = ctx.createOscillator(); o.type = type || "sine"; o.frequency.value = f; const g = G(depth); o.connect(g); g.connect(target); o.start(); return { o, g }; };
    // bruit de vinyle partagé
    const n = ctx.sampleRate * 4, nb = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { lp = lp * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = lp * 0.35; if (Math.random() < 0.00018) { const a = (Math.random() * 0.9 + 0.1) * (Math.random() < 0.5 ? -1 : 1); for (let k = 0; k < 40 && i + k < n; k++) d[i + k] += a * Math.exp(-k / 6); } } }
    // chaque effet : entrée → (chemin sec + chemin traité) → sortie ; « send » = le sec reste à fond (écho, réverbe)
    // le chemin traité n'est branché que quand l'effet est allumé (économie de calcul)
    const unit = (id, wetIn, wetOut, send) => { const u = { i: G(1), o: G(1), dry: G(1), wet: G(0), send, wi: wetIn, wc: false }; u.i.connect(u.dry); u.dry.connect(u.o); wetOut.connect(u.wet); u.wet.connect(u.o); sp.u[id] = u; return u; };
    let x;
    // saturation à niveau constant : on pousse avant la courbe, on rattrape après
    const DRV = () => { const pg = G(1), w = WS(makeDriveCurve(0)), po = G(1); pg.connect(w); w.connect(po); return { pg, w, po }; };
    // LO-FI : bits + échantillonnage réduit (worklet), puis aigus coupés
    if (hasWorklet) { const w = new AudioWorkletNode(ctx, "nomad-lofi", { outputChannelCount: [2] }), lp = BQ("lowpass", 9000); w.connect(lp); x = unit("lofi", w, lp); x.node = w; x.lp = lp; }
    else { const g = G(1); x = unit("lofi", g, g); }
    // VINYL SIM : bande étroite, compression, pleurage léger, craquements
    { const hp = BQ("highpass", 120), lp = BQ("lowpass", 6000), dl = ctx.createDelay(0.05), cp = ctx.createDynamicsCompressor(), out = G(1), nz = ctx.createBufferSource(), nzG = G(0), nhp = BQ("highpass", 300);
      dl.delayTime.value = 0.008; cp.threshold.value = -22; cp.ratio.value = 4; cp.attack.value = 0.005; cp.release.value = 0.12;
      const mk = G(1.9); hp.connect(lp); lp.connect(dl); dl.connect(cp); cp.connect(mk); mk.connect(out); nz.buffer = nb; nz.loop = true; nz.connect(nhp); nhp.connect(nzG); nzG.connect(out); nz.start();
      x = unit("vinyl", hp, out); Object.assign(x, { hp, lp, nzG, w: LFO(0.55, 0, dl.delayTime) }); }
    // CASSETTE
    { const dl = ctx.createDelay(0.05), sat = DRV(), lp = BQ("lowpass", 9000); dl.delayTime.value = 0.012; dl.connect(sat.pg); sat.po.connect(lp);
      x = unit("tape", dl, lp); Object.assign(x, { sat, lp, w: LFO(0.9, 0, dl.delayTime), f: LFO(9, 0, dl.delayTime) }); }
    // FILTRE + DRIVE
    { const pre = DRV(), lp = BQ("lowpass", 2000, 6), g = G(0.8); pre.po.connect(lp); lp.connect(g); x = unit("filt", pre.pg, g); Object.assign(x, { pre, lp }); }
    // PASSE-HAUT
    { const hp = BQ("highpass", 400, 2); x = unit("hpf", hp, hp); x.hp = hp; }
    // RADIO
    { const bp = BQ("bandpass", 1400, 1.4), sat = DRV(), g = G(3); bp.connect(sat.pg); sat.po.connect(g); x = unit("radio", bp, g); Object.assign(x, { bp, sat }); }
    // SATURATION
    { const sat = DRV(), tone = BQ("lowpass", 8000), g = G(1); sat.po.connect(tone); tone.connect(g); x = unit("sat", sat.pg, g); Object.assign(x, { sat, tone }); }
    // KILL BASSES / AIGUS (24 dB/oct)
    { const a = BQ("highpass", 300, 0.7), b = BQ("highpass", 300, 0.7); a.connect(b); x = unit("kbass", a, b); x.f = [a, b]; }
    { const a = BQ("lowpass", 1500, 0.7), b = BQ("lowpass", 1500, 0.7); a.connect(b); x = unit("khigh", a, b); x.f = [a, b]; }
    // FLANGER
    { const dl = ctx.createDelay(0.02), fb = G(0.6), mix = G(0.55); dl.delayTime.value = 0.003; dl.connect(fb); fb.connect(dl); const inp = G(1); inp.connect(mix); inp.connect(dl); dl.connect(mix);
      x = unit("flang", inp, mix); Object.assign(x, { fb, l: LFO(0.3, 0.002, dl.delayTime) }); }
    // DÉSACCORD (chorus lent)
    { const dl = ctx.createDelay(0.05), mix = G(0.6), inp = G(1); dl.delayTime.value = 0.02; inp.connect(mix); inp.connect(dl); dl.connect(mix);
      x = unit("chorus", inp, mix); x.l = LFO(0.6, 0.004, dl.delayTime); }
    // SLICER : gain haché au tempo
    { const g = G(1), sq = ctx.createOscillator(); sq.type = "square"; const d = G(0); sq.connect(d); d.connect(g.gain); sq.start(); x = unit("slice", g, g); Object.assign(x, { g, sq, d }); }
    // LOOPER DJ (worklet)
    if (hasWorklet) { const w = new AudioWorkletNode(ctx, "nomad-djloop", { outputChannelCount: [2] }); x = unit("loop", w, w); x.node = w; }
    else { const g = G(1); x = unit("loop", g, g); }
    // ÉCHO à bande
    { const dl = ctx.createDelay(4), fb = G(0.45), lp = BQ("lowpass", 3200), hp = BQ("highpass", 250); dl.connect(lp); lp.connect(hp); hp.connect(fb); fb.connect(dl);
      x = unit("echo", dl, hp, true); Object.assign(x, { dl, fb }); }
    // RÉVERBE
    { const cv = ctx.createConvolver(), lp = BQ("lowpass", 4000); cv.buffer = impulse(2.2, 2.6, 0.4); cv.connect(lp); x = unit("verb", cv, lp, true); Object.assign(x, { cv, lp, size: 2.2 }); }
    // SP COMP : compresseur qui pompe + gain de rattrapage
    { const cp = ctx.createDynamicsCompressor(), mk = G(1); cp.knee.value = 2; cp.attack.value = 0.002; cp.connect(mk); x = unit("comp", cp, mk); Object.assign(x, { cp, mk }); }
    // chaîne
    // entrée : toute la sortie (cible TOUT) ou une seule piste du looper (sp.lay) ; sp.post = après les effets
    sp.in = input; sp.head = G(1); sp.lay = G(1); sp.lay.connect(sp.head); sp.post = G(1);
    input.connect(sp.head);
    let prev = sp.head;
    SP_ORDER.forEach(id => { prev.connect(sp.u[id].i); prev = sp.u[id].o; });
    sp.tap = prev; prev.connect(sp.post);
    sp.iso = [["lowshelf", 250], ["peaking", 1200], ["highshelf", 4200]].map(([type, f]) => BQ(type, f, type === "peaking" ? 0.7 : 0));
    sp.post.connect(sp.iso[0]); sp.iso[0].connect(sp.iso[1]); sp.iso[1].connect(sp.iso[2]);
    sp.out = G(1); sp.iso[2].connect(sp.out); sp.out.connect(output);
    SP_FX.forEach((f, i) => spParams(i));
    for (let k = 3; k < 7; k++) applySp(k);
  }
  // réglages d'un effet (a, b entre 0 et 1)
  const spDrive = (d, amt, t) => { d.pg.gain.setTargetAtTime(1 + amt * 12, t, 0.03); d.po.gain.setTargetAtTime(1 / (1 + amt * 2.4), t, 0.03); };
  function spParams(i) {
    if (!sp) return;
    const f = SP_FX[i], u = sp.u[f.id], a = f.a, b = f.b, t = ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.03), beat = spBeat();
    if (f.id === "comp") { set(u.cp.threshold, -6 - a * 38); set(u.cp.ratio, 3 + a * 17); set(u.cp.release, 0.05 + b * 0.35); set(u.mk.gain, 1 + a * 1.6); }
    if (f.id === "vinyl") { set(u.nzG.gain, a * 0.16); set(u.lp.frequency, 9000 - b * 6500); set(u.hp.frequency, 60 + b * 220); set(u.w.g.gain, b * 0.0012); }
    if (f.id === "tape") { set(u.w.g.gain, a * 0.004); set(u.f.g.gain, a * 0.0005); spDrive(u.sat, 0.05 + b * 0.6, t); set(u.lp.frequency, 12000 - b * 6000); }
    if (f.id === "lofi") { if (u.node) u.node.port.postMessage({ bits: 16 - a * 12, hold: 1 + Math.round(b * b * 15) }); if (u.lp) set(u.lp.frequency, 16000 - b * 12000); }
    if (f.id === "filt") { set(u.lp.frequency, 120 * Math.pow(12000 / 120, a)); spDrive(u.pre, b * 0.8, t); set(u.lp.Q, 2 + b * 7); }
    if (f.id === "hpf") { set(u.hp.frequency, 40 * Math.pow(6000 / 40, a)); set(u.hp.Q, 0.7 + b * 12); }
    if (f.id === "radio") { set(u.bp.frequency, 500 + a * 2500); spDrive(u.sat, 0.2 + b * 0.7, t); }
    if (f.id === "sat") { spDrive(u.sat, 0.1 + a * 0.9, t); set(u.tone.frequency, 1500 * Math.pow(14, b)); }
    if (f.id === "kbass") u.f.forEach(x => set(x.frequency, 80 * Math.pow(15, a)));
    if (f.id === "khigh") u.f.forEach(x => set(x.frequency, 300 * Math.pow(20, 1 - a)));
    if (f.id === "flang") { set(u.l.o.frequency, 0.05 + a * a * 4); set(u.l.g.gain, 0.0005 + b * 0.0028); set(u.fb.gain, 0.3 + b * 0.55); }
    if (f.id === "chorus") { set(u.l.o.frequency, 0.1 + a * 3); set(u.l.g.gain, 0.0005 + b * 0.008); }
    if (f.id === "slice") { const div = [2, 4, 8, 16, 32][Math.min(4, Math.floor(a * 5))]; set(u.sq.frequency, div / 4 / beat * 2); set(u.d.gain, f.on ? b * 0.5 : 0); set(u.g.gain, f.on ? 1 - b * 0.5 : 1); }
    if (f.id === "loop") { if (u.node) u.node.port.postMessage({ len: Math.round(beat * [1, 0.5, 0.25, 0.125, 0.0625][Math.min(4, Math.floor(a * 5))] * ctx.sampleRate), rate: b < 0.45 ? 0.5 + b / 0.45 * 0.5 : b > 0.55 ? 1 + (b - 0.55) / 0.45 : 1 }); }
    if (f.id === "echo") { set(u.dl.delayTime, Math.min(3.9, beat * [0.25, 0.375, 0.5, 0.75, 1][Math.min(4, Math.floor(a * 5))])); set(u.fb.gain, b * 0.85); }
    if (f.id === "verb") { const s = 0.8 + a * 3.5; if (Math.abs(s - u.size) > 0.25) { u.size = s; u.cv.buffer = impulse(s, 2.4, 0.4); } set(u.lp.frequency, 1500 * Math.pow(8, b)); }
    spMix(i);
  }
  // marche / arrêt d'un effet : fondu court pour ne pas claquer
  function spMix(i) {
    if (!sp) return;
    const f = SP_FX[i], u = sp.u[f.id], on = f.on && SPX.on, t = ctx.currentTime, m = f.m;
    if (on && !u.wc) { u.i.connect(u.wi); u.wc = true; }
    if (!on && u.wc) { clearTimeout(u.off); u.off = setTimeout(() => { if (u.wc && !(f.on && SPX.on)) { try { u.i.disconnect(u.wi); } catch (e) {} u.wc = false; } }, 120); }
    u.wet.gain.setTargetAtTime(on ? m : 0, t, 0.015);
    u.dry.gain.setTargetAtTime(on && !u.send ? 1 - m : 1, t, 0.015);
    if (f.id === "loop" && u.node) u.node.port.postMessage({ on });
    if (f.id === "slice") { u.d.gain.setTargetAtTime(on ? f.b * 0.5 : 0, t, 0.01); u.g.gain.setTargetAtTime(on ? 1 - f.b * 0.5 : 1, t, 0.01); }
  }
  // potards : 1 = réglage 1, 2 = réglage 2, 3 = dosage de l'effet choisi ; 4-6 isolateur ; 7 sortie
  function applySp(k) {
    if (!sp) return;
    const t = ctx.currentTime, x = knobVals.sp[k], f = SP_FX[SPX.cur];
    const isoDb = y => y < 0.5 ? -40 * Math.pow((0.5 - y) * 2, 1.5) : (y - 0.5) * 12;
    if (k <= 2) { if (k === 0) f.a = x; if (k === 1) { if (f.p[1] === "—") return; f.b = x; } if (k === 2) f.m = x; spParams(SPX.cur); spSave();
      if (tab === "sp") { lcd("lcdPad", "SP", `${f.name} · ${k === 2 ? "dosage" : f.p[k].toLowerCase()} ${Math.round(x * 100)} %`); spSeg("F" + String(SPX.cur + 1).padStart(2, "0"), f.name); } return; }
    if (k >= 3 && k <= 5) { sp.iso[k - 3].gain.setTargetAtTime(SPX.on ? isoDb(x) : 0, t, 0.02); if (tab === "sp") lcd("lcdPad", "SP", `${["graves", "médiums", "aigus"][k - 3]} ${isoDb(x) > 0 ? "+" : ""}${isoDb(x).toFixed(0)} dB`); }
    if (k === 6) { sp.out.gain.setTargetAtTime(x * 1.25, t, 0.02); if (tab === "sp") lcd("lcdPad", "SP", `sortie ${Math.round(x * 100)} %`); }
  }
  function spSelect(i) {
    SPX.cur = i; const f = SP_FX[i];
    knobVals.sp[0] = f.a; knobVals.sp[1] = f.b; knobVals.sp[2] = f.m;
    KNOB_LABELS.sp[0] = f.p[0]; KNOB_LABELS.sp[1] = f.p[1]; KNOB_LABELS.sp[2] = "Dosage";
    if (tab === "sp") drawKnobs();
  }
  // pads : appui court = verrou (marche / arrêt), appui long = tant qu'on tient
  const spDown = {};
  function spPad(i, down) {
    const f = SP_FX[i]; if (!f) return;
    if (down) {
      spDown[i] = { t: performance.now(), was: f.on };
      f.on = true; spSelect(i); spParams(i); drawSpFx();
      spSeg("F" + String(i + 1).padStart(2, "0"), f.name); lcd("lcdPad", "SP", `${f.name} · ${f.sub}`);
    } else {
      const d = spDown[i]; delete spDown[i]; if (!d) return;
      const held = performance.now() - d.t > 380;
      f.on = held ? false : !d.was; spMix(i); drawSpFx();
      if (!f.on) lcd("lcdPad", "SP", `${f.name} coupé`);
    }
  }
  // ---------- Cible : toute la sortie ou une piste du looper ; impression des couleurs sur la piste ----------
  SPX.target = "all"; let spLayer = null;
  function spRoute() {
    if (!sp) return;
    const want = SPX.target === "all" ? null : LP.layers[+SPX.target - 1] || null;
    if (want === spLayer) return;
    spLayer = want;
    try { sp.in.disconnect(sp.head); } catch (e) {} try { sp.in.disconnect(sp.post); } catch (e) {}
    sp.in.connect(spLayer ? sp.post : sp.head);
    sp.lay.gain.value = loopBus.gain.value;
    if (typeof routeFx === "function" && fxDry) routeFx();
    else LP.layers.forEach(l => { try { l.gain.disconnect(); } catch (e) {} l.gain.connect(l === spLayer ? sp.lay : loopBus); if (l.an) l.gain.connect(l.an); });
  }
  function setSpTarget(t) {
    if (SPR.rec) return;
    SPX.target = t; spRoute(); drawSpTargets();
    lcd("lcdPad", "SP", t === "all" ? "les effets colorent toute la sortie" : (LP.layers[+t - 1] ? `effets sur la piste ${t} · Sustain = imprimer` : `piste ${t} vide`));
  }
  function drawSpTargets() {
    document.querySelectorAll(".spt").forEach(b => { const t = b.dataset.t; b.classList.toggle("on", t === SPX.target); b.classList.toggle("empty", t !== "all" && !LP.layers[+t - 1]); });
    const b = $("spPrint"); if (!b) return;
    b.classList.toggle("on", !!SPR.rec); b.classList.toggle("idle", !SPR.rec && SPX.target === "all");
    b.textContent = SPR.rec ? `■ ARRÊTER · ${Math.round(SPR.rec.pct * 100)} %` : SPX.target === "all" ? "● IMPRIMER : CHOISIS UNE PISTE" : `● IMPRIMER SUR LA PISTE ${SPX.target}`;
  }
  document.querySelectorAll(".spt").forEach(b => b.addEventListener("click", () => setSpTarget(b.dataset.t)));
  // clavier de l'Akai dans SP : les 8 premières touches blanches = TOUT, P1 à P6
  function spKey(note) {
    const r = note - 48, pc = ((r % 12) + 12) % 12, wi = [0, 2, 4, 5, 7, 9, 11].indexOf(pc);
    if (wi < 0) return;
    const w = (((Math.floor(r / 12) * 7 + wi) % 14) + 14) % 14;
    if (w < 7) setSpTarget(["all", "1", "2", "3", "4", "5", "6"][w]);
  }
  // Impression : un tour complet de la piste passe dans les effets et remplace la piste (annulable).
  // Ce qu'on fait pendant le tour est gravé à cet endroit-là de la boucle (un effet sur un seul temps reste sur ce temps).
  const SPR = { rec: null };
  function spPrintToggle() {
    if (SPR.rec) { spPrintStop(false); return; }
    const l = spLayer;
    if (!ctx || !hasWorklet || !sp) { lcd("lcdPad", "SP", "impression non disponible ici"); return; }
    if (!l) { lcd("lcdPad", "SP", "choisis d'abord une piste (P1 à P6 ou touches blanches)"); return; }
    if (!LP.playing) { lcd("lcdPad", "SP", "lance la boucle, puis imprime"); return; }
    if (l.muted || l.vol < 0.05) { lcd("lcdPad", "SP", "la piste est coupée"); return; }
    const Lk = l.k * LP.Lf, sF = LP.t0F + l.m * LP.Lf, startF = Math.ceil(ctx.currentTime * sr + 0.03 * sr);
    const node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
    const silent = ctx.createGain(); silent.gain.value = 0; node.connect(silent); silent.connect(ctx.destination);
    sp.tap.connect(node);
    const rec = SPR.rec = { l, node, silent, Lk, sF, startF, endF: startF + Lk, L: new Float32Array(Lk), R: new Float32Array(Lk), pct: 0, last: 0 };
    node.port.onmessage = e => {
      const { f, l: a, r: b } = e.data;
      for (let j = 0; j < a.length; j++) { const p = f + j; if (p < rec.startF || p >= rec.endF) continue; const i = (((p - rec.sF) % rec.Lk) + rec.Lk) % rec.Lk; rec.L[i] = a[j]; rec.R[i] = b[j]; }
      rec.pct = Math.max(0, Math.min(1, (f + a.length - rec.startF) / rec.Lk));
      if (performance.now() - rec.last > 150) { rec.last = performance.now(); drawSpTargets(); spSeg("PRT", Math.round(rec.pct * 100) + " %"); }
      if (f + a.length >= rec.endF) spPrintStop(true);
    };
    drawSpTargets(); spSeg("PRT", "0 %");
    lcd("lcdPad", "SP", `impression sur la piste ${LP.layers.indexOf(l) + 1} : joue tes effets pendant un tour`);
  }
  function spPrintStop(done) {
    const rec = SPR.rec; if (!rec) return; SPR.rec = null;
    try { sp.tap.disconnect(rec.node); } catch (e) {} rec.node.disconnect(); rec.node.port.onmessage = null;
    const l = rec.l, i = LP.layers.indexOf(l);
    if (!done || i < 0) { drawSpTargets(); spSeg("F" + String(SPX.cur + 1).padStart(2, "0"), SP_FX[SPX.cur].name); lcd("lcdPad", "SP", "impression annulée"); return; }
    const g = l.vol * (sp.lay.gain.value || 1), sc = g > 0.05 ? 1 / g : 1;
    const buf = ctx.createBuffer(2, rec.Lk, sr), d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
    for (let j = 0; j < rec.Lk; j++) { d0[j] = rec.L[j] * sc; d1[j] = rec.R[j] * sc; }
    const old = { buf: l.buf, k: l.k, m: l.m, notes: l.notes }, now = { buf, k: l.k, m: l.m, notes: l.notes };
    const apply = st => { stopLayer(l); Object.assign(l, st); if (LP.playing) startLayer(l, ctx.currentTime + 0.005); drawSeqSel(); };
    apply(now);
    pushHist(`couleur SP piste ${i + 1}`, () => apply(old), () => apply(now));
    spAllOff();
    lcd("lcdPad", "SP", `piste ${i + 1} imprimée · effets remis à zéro (Retour arrière = annuler)`);
    drawSpTargets();
  }
  $("spPrint").addEventListener("click", spPrintToggle);
  function spAllOff() { SP_FX.forEach((f, i) => { f.on = false; spMix(i); }); drawSpFx(); lcd("lcdPad", "SP", "tous les effets coupés"); }
  const spFxEls = [];
  [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].forEach(i => {
    const b = document.createElement("button"); b.type = "button"; b.className = "spfx"; b.innerHTML = `<i></i><b>${SP_FX[i].name}</b><span>${i + 1}</span>`;
    b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); spPad(i, true); });
    ["pointerup", "pointercancel"].forEach(ev => b.addEventListener(ev, () => spPad(i, false)));
    $("spFxGrid").appendChild(b); spFxEls[i] = b;
  });
  function drawSpFx() { spFxEls.forEach((b, i) => { b.classList.toggle("on", SP_FX[i].on); b.classList.toggle("cur", i === SPX.cur); }); }
  $("spAllOff").addEventListener("click", spAllOff);
  $("spBypass").addEventListener("click", () => { SPX.on = !SPX.on; SP_FX.forEach((f, i) => spMix(i)); for (let k = 3; k < 6; k++) applySp(k); $("spBypass").textContent = "EFFETS SP : " + (SPX.on ? "OUI" : "NON"); $("spBypass").classList.toggle("on", !SPX.on); });
  // le tempo change : on recale écho, slicer et looper
  setInterval(() => { if (sp) ["echo", "slice", "loop"].forEach(id => { const i = SP_FX.findIndex(f => f.id === id); if (SP_FX[i].on || id === "echo") spParams(i); }); }, 2000);
  spSelect(0); drawSpFx();

  // Rééchantillonnage : la sortie complète vers un pad du kit (enregistré en kit perso « … · RÉÉCH »)
  const RS = { target: 0, sync: true, rec: null };
  const spPadEls = [];
  for (let r = 1; r >= 0; r--) for (let c = 0; c < 8; c++) {
    const i = r * 8 + c, b = document.createElement("button"); b.type = "button"; b.className = "dpad"; b.textContent = i + 1;
    b.addEventListener("pointerdown", e => { e.preventDefault(); RS.target = i; drawSpPads(); playPad(i, 0.9); });
    $("spPads").appendChild(b); spPadEls[i] = b;
  }
  // petit afficheur rouge à segments de la façade SP
  function spSeg(big, small) { $("spSeg").textContent = big; $("spSegSub").textContent = small; }
  function drawSpPads() {
    spPadEls.forEach((b, i) => { b.classList.toggle("target", i === RS.target); b.classList.toggle("has", !!buffers[i]); });
    if (!RS.rec) $("spInfo").textContent = `Destination : pad ${RS.target + 1}` + (names[RS.target] ? ` (remplace « ${names[RS.target]} »)` : "");
  }
  $("spSync").addEventListener("click", () => { RS.sync = !RS.sync; $("spSync").textContent = "CALÉ : " + (RS.sync ? "BOUCLE" : "LIBRE"); });
  $("spRec").addEventListener("click", () => { if (RS.rec) rsStop(); else rsStart(); });
  function rsStart() {
    if (!ctx || !hasWorklet) { lcd("lcdPad", "RÉÉCH.", "non disponible ici"); return; }
    const sync = RS.sync && LP.t0F !== null && LP.playing && LP.layers.length;
    const node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
    const silent = ctx.createGain(); silent.gain.value = 0; node.connect(silent); silent.connect(ctx.destination);
    mixOut.connect(node);
    const rec = { node, silent, chunks: [], startF: null, endF: null };
    if (sync) { const C = cycF(LP.layers), nowF = ctx.currentTime * sr; rec.startF = LP.t0F + Math.ceil((nowF + 0.05 * sr - LP.t0F) / C) * C; rec.endF = rec.startF + C; }
    node.port.onmessage = e => { rec.chunks.push([e.data.f, e.data.l, e.data.r]); if (rec.endF && e.data.f + e.data.l.length >= rec.endF) rsStop(); else if (rec.chunks.length * 1024 > sr * 60) rsStop(); };
    RS.rec = rec;
    $("spRec").textContent = "■ STOP"; $("spRec").classList.add("on"); spSeg("REC", sync ? "CALÉ" : "LIBRE");
    $("spInfo").textContent = sync ? `En attente du début de la séquence ${SEQ_N[SQ.cur]}… (un cycle)` : "Enregistrement… appuyez pour arrêter (60 s max)";
    lcd("lcdPad", "RÉÉCH.", sync ? "calé sur la boucle" : "enregistrement");
  }
  async function rsStop() {
    const rec = RS.rec; if (!rec) return; RS.rec = null;
    try { mixOut.disconnect(rec.node); } catch (e) {} rec.node.disconnect(); rec.node.port.onmessage = null;
    $("spRec").textContent = "● ENREGISTRER"; $("spRec").classList.remove("on"); spSeg("F" + String(SPX.cur + 1).padStart(2, "0"), SP_FX[SPX.cur].name);
    if (!rec.chunks.length) { drawSpPads(); return; }
    let a = rec.startF ?? rec.chunks[0][0], b = rec.endF ?? (rec.chunks[rec.chunks.length - 1][0] + 1024);
    const f0 = rec.chunks[0][0], n = b - a; if (n < sr * 0.05) { drawSpPads(); return; }
    const L = new Float32Array(n), R = new Float32Array(n);
    rec.chunks.forEach(([f, l, r]) => { for (let j = 0; j < l.length; j++) { const p = f + j - a; if (p >= 0 && p < n) { L[p] = l[j]; R[p] = r[j]; } } });
    let s0 = 0, e0 = n;
    if (!rec.endF) { const th = 0.004; while (s0 < n && Math.abs(L[s0]) < th && Math.abs(R[s0]) < th) s0++; while (e0 > s0 && Math.abs(L[e0 - 1]) < th && Math.abs(R[e0 - 1]) < th) e0--; s0 = Math.max(0, s0 - 64); }
    if (e0 - s0 < sr * 0.03) { lcd("lcdPad", "RÉÉCH.", "rien entendu"); drawSpPads(); return; }
    const buf = ctx.createBuffer(2, e0 - s0, sr); buf.getChannelData(0).set(L.subarray(s0, e0)); buf.getChannelData(1).set(R.subarray(s0, e0));
    const i = RS.target;
    kitEdit(`rééchantillonnage pad ${i + 1}`, () => { buffers[i] = buf; names[i] = "Rééch " + (i + 1); gains[i] = 1; padParams[i] = { ...PDEF }; });
    await persistResampleKit();
    lcd("lcdPad", "RÉÉCH.", `pad ${i + 1} ← ${(buf.duration).toFixed(2)} s`);
    RS.target = (i + 1) % 16; drawSpPads();
  }
  async function persistResampleKit() {
    const meta = kitIndex.find(k => k.id === kitCur) || {};
    const isRs = meta.user && / · RÉÉCH$/.test(meta.name);
    const id = isRs ? meta.id : "user-" + Date.now().toString(36), name = isRs ? meta.name : ((meta.name || "KIT").replace(/ · RÉÉCH$/, "").slice(0, 22) + " · RÉÉCH");
    await DB.put("kits", { id, name, names: names.slice(), gains: gains.slice(), params: padParams.map(p => ({ ...p })), chokeAll: kitChoke, bufs: buffers.map(packBuf), created: isRs ? (meta.created || Date.now()) : Date.now() });
    if (!isRs) { await refreshUserKits(); kitCur = id; store.set("kit", id); $("kitName").textContent = name; }
  }

