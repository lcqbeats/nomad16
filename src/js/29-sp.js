  // ---------- SP : effets de sortie façon sampler de poche (vinyle, cassette, lo-fi, isolateur) ----------
  const SPX = { on: true };
  let sp = null;
  function buildSp(input, output) {
    sp = {};
    const iso = [["lowshelf", 250], ["peaking", 1200], ["highshelf", 4200]].map(([type, f]) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (type === "peaking") b.Q.value = 0.7; return b; });
    sp.iso = iso;
    // cassette : petit délai modulé (pleurage), saturation douce, aigus coupés ; en parallèle d'un chemin direct
    sp.dry = ctx.createGain(); sp.wet = ctx.createGain(); sp.wet.gain.value = 0;
    sp.tape = ctx.createDelay(0.05); sp.tape.delayTime.value = 0.012;
    sp.lfo = ctx.createOscillator(); sp.lfo.frequency.value = 0.9; sp.lfoG = ctx.createGain(); sp.lfoG.gain.value = 0; sp.lfo.connect(sp.lfoG); sp.lfoG.connect(sp.tape.delayTime); sp.lfo.start();
    sp.flut = ctx.createOscillator(); sp.flut.frequency.value = 9; sp.flutG = ctx.createGain(); sp.flutG.gain.value = 0; sp.flut.connect(sp.flutG); sp.flutG.connect(sp.tape.delayTime); sp.flut.start();
    sp.sat = ctx.createWaveShaper(); sp.sat.curve = makeDriveCurve(0.15);
    sp.hc = ctx.createBiquadFilter(); sp.hc.type = "lowpass"; sp.hc.frequency.value = 20000;
    sp.crush = ctx.createWaveShaper();
    sp.out = ctx.createGain();
    // vinyle : craquements et souffle en boucle
    const n = ctx.sampleRate * 4, nb = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = nb.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { lp = lp * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = lp * 0.35; if (Math.random() < 0.00018) { const a = (Math.random() * 0.9 + 0.1) * (Math.random() < 0.5 ? -1 : 1); for (let k = 0; k < 40 && i + k < n; k++) d[i + k] += a * Math.exp(-k / 6); } } }
    sp.noise = ctx.createBufferSource(); sp.noise.buffer = nb; sp.noise.loop = true; sp.noiseG = ctx.createGain(); sp.noiseG.gain.value = 0;
    const nhp = ctx.createBiquadFilter(); nhp.type = "highpass"; nhp.frequency.value = 300;
    sp.noise.connect(nhp); nhp.connect(sp.noiseG); sp.noiseG.connect(sp.out); sp.noise.start();
    input.connect(iso[0]); iso[0].connect(iso[1]); iso[1].connect(iso[2]);
    iso[2].connect(sp.dry); iso[2].connect(sp.tape); sp.tape.connect(sp.sat); sp.sat.connect(sp.wet);
    sp.dry.connect(sp.hc); sp.wet.connect(sp.hc); sp.hc.connect(sp.crush); sp.crush.connect(sp.out); sp.out.connect(output);
    for (let k = 0; k < 8; k++) applySp(k);
  }
  function crushCurve(a) { if (a < 0.02) return null; const bits = 16 - a * 13, q = Math.pow(2, bits) / 2, n = 4096, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(x * q) / q; } return c; }
  function applySp(k) {
    if (!sp) return;
    const v = SPX.on ? knobVals.sp : [0, 0, 0, 0.5, 0.5, 0.5, knobVals.sp[6], 0], t = ctx.currentTime, x = v[k];
    const isoDb = y => y < 0.5 ? -40 * Math.pow((0.5 - y) * 2, 1.5) : (y - 0.5) * 12;
    const hc = () => 20000 * Math.pow(1 - 0.85 * Math.max(v[0], v[1]), 2) + 400 * Math.max(v[0], v[1]);
    if (k === 0) { sp.noiseG.gain.setTargetAtTime(x * 0.12, t, 0.03); sp.hc.frequency.setTargetAtTime(hc(), t, 0.03); }
    if (k === 1) { sp.wet.gain.setTargetAtTime(x > 0.01 ? 1 : 0, t, 0.02); sp.dry.gain.setTargetAtTime(x > 0.01 ? 0 : 1, t, 0.02); sp.lfoG.gain.setTargetAtTime(x * 0.0035, t, 0.05); sp.flutG.gain.setTargetAtTime(x * 0.0004, t, 0.05); sp.sat.curve = makeDriveCurve(0.1 + x * 0.5); sp.hc.frequency.setTargetAtTime(hc(), t, 0.03); }
    if (k === 2) sp.crush.curve = crushCurve(x);
    if (k >= 3 && k <= 5) sp.iso[k - 3].gain.setTargetAtTime(isoDb(x), t, 0.02);
    if (k === 6) sp.out.gain.setTargetAtTime(x * 1.25, t, 0.02);
    const names = ["vinyle", "cassette", "lo-fi", "graves", "médiums", "aigus", "sortie"];
    if (tab === "sp" && k < 7) lcd("lcdPad", "SP", k >= 3 && k <= 5 ? `${names[k]} ${isoDb(knobVals.sp[k]) > 0 ? "+" : ""}${isoDb(knobVals.sp[k]).toFixed(0)} dB` : `${names[k]} ${Math.round(knobVals.sp[k] * 100)} %`);
  }
  const SP_PRESETS = [["NEUTRE", [0, 0, 0, 0.5, 0.5, 0.5]], ["VINYLE 45T", [0.55, 0, 0.15, 0.55, 0.5, 0.42]], ["CASSETTE", [0.1, 0.6, 0, 0.55, 0.5, 0.4]], ["LO-FI 12 BITS", [0.2, 0.15, 0.55, 0.55, 0.5, 0.45]],
    ["RADIO", [0, 0, 0.3, 0.05, 0.6, 0.15]], ["SANS BASSES", [0, 0, 0, 0.08, 0.5, 0.5]], ["SANS AIGUS", [0, 0, 0, 0.5, 0.5, 0.06]], ["POUSSIÈRE", [0.85, 0.35, 0.25, 0.5, 0.45, 0.35]]];
  SP_PRESETS.forEach(([name, vals], pi) => {
    const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = name;
    b.addEventListener("click", () => { vals.forEach((x, k) => { knobVals.sp[k] = x; applySp(k); }); if (tab === "sp") drawKnobs(); lcd("lcdPad", "SP", name); [...$("spPresets").children].forEach((x, j) => x.classList.toggle("on", j === pi)); spSeg("F-" + (pi + 1), name); });
    $("spPresets").appendChild(b);
  });
  $("spBypass").addEventListener("click", () => { SPX.on = !SPX.on; for (let k = 0; k < 7; k++) applySp(k); $("spBypass").textContent = "EFFETS SP : " + (SPX.on ? "OUI" : "NON"); $("spBypass").classList.toggle("on", !SPX.on); });

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
    if (!RS.rec) spSeg("P" + String(RS.target + 1).padStart(2, "0"), "RÉÉCH.");
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
    $("spRec").textContent = "● RÉÉCH."; $("spRec").classList.remove("on");
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

