  // ---------- Ampli guitare ----------
  const AMPS = {
    cristal: { label: "CRISTAL 22", skin: "cristal", maxDrive: 5, asym: 0.05, midF: 500, midQ: 0.7, midBase: -3, cab: 6500, low: 1 },
    brit: { label: "BRIT 59", skin: "", maxDrive: 24, asym: 0.15, midF: 800, midQ: 0.8, midBase: 2, cab: 5200, low: 0 },
    agrume: { label: "AGRUME 30", skin: "agrume", maxDrive: 38, asym: 0.2, midF: 600, midQ: 0.7, midBase: 4, cab: 4800, low: 2 },
    bois: { label: "BOIS · ACOUSTIQUE", skin: "bois" }
  };
  const PEDALS = [
    { id: "comp", label: "COMP", color: "#2f6fb5" }, { id: "drive", label: "DRIVE", color: "#1f8a4c" }, { id: "fuzz", label: "FUZZ", color: "#b8432f" },
    { id: "vibe", label: "VIBE", color: "#7a4aa0" }, { id: "chorus", label: "CHORUS", color: "#2a9aa0" }, { id: "delay", label: "ÉCHO", color: "#3a3a3a" }
  ];
  // Valeurs : gain, basses, médiums, aigus, présence, réverbe, master, écho (0 à 1)
  const PRESETS = [
    { name: "CLEAN CHAUD", sub: "esprit Mayer", amp: "cristal", k: [0.35, 0.55, 0.5, 0.6, 0.55, 0.35, 0.6, 0.15], fx: ["comp"] },
    { name: "TEXAS BLUES", sub: "esprit SRV", amp: "cristal", k: [0.55, 0.55, 0.6, 0.6, 0.6, 0.3, 0.6, 0.0], fx: ["drive"] },
    { name: "FUZZ 69", sub: "esprit Hendrix", amp: "brit", k: [0.45, 0.6, 0.55, 0.55, 0.5, 0.25, 0.55, 0.0], fx: ["fuzz"] },
    { name: "VIBE", sub: "Hendrix, ballade", amp: "brit", k: [0.3, 0.55, 0.5, 0.55, 0.5, 0.35, 0.6, 0.1], fx: ["vibe"] },
    { name: "FUNK CLAIR", sub: "esprit Frusciante", amp: "cristal", k: [0.3, 0.45, 0.45, 0.7, 0.65, 0.2, 0.6, 0.0], fx: ["comp"] },
    { name: "CRUNCH", sub: "rythmique Brit", amp: "brit", k: [0.6, 0.55, 0.6, 0.55, 0.55, 0.2, 0.55, 0.0], fx: [] },
    { name: "LEAD CHAUD", sub: "solo, sustain", amp: "agrume", k: [0.6, 0.55, 0.6, 0.5, 0.45, 0.3, 0.5, 0.35], fx: ["drive", "delay"] },
    { name: "ACOUSTIQUE", sub: "chaude et ronde", amp: "bois", k: [0.3, 0.55, 0.45, 0.55, 0.55, 0.3, 0.65, 0.0], fx: ["comp"] }
  ];
  const AMP_LABELS = ["GAIN", "BASS", "MIDDLE", "TREBLE", "PRESENCE", "REVERB", "MASTER"];
  const G = { amp: "brit", fx: new Set(), preset: -1, on: false };
  let tuning = false;
  let gn = null; // nœuds audio de la guitare

  // Interface de la tête
  const gkEls = [];
  AMP_LABELS.forEach((lab, k) => {
    const d = document.createElement("div");
    d.className = "gk"; d.id = "gk" + k;
    d.innerHTML = `<div class="cap"></div><label>${lab}</label><span class="val"></span>`;
    let startY = 0, startV = 0;
    d.addEventListener("pointerdown", e => { d.setPointerCapture(e.pointerId); startY = e.clientY; startV = knobVals.guitar[k]; });
    d.addEventListener("pointermove", e => { if (!d.hasPointerCapture(e.pointerId)) return; setGuitarKnob(k, Math.min(1, Math.max(0, startV + (startY - e.clientY) / 150))); });
    $("ampKnobs").appendChild(d); gkEls.push(d);
  });
  PEDALS.forEach(p => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pedal"; b.id = "pd-" + p.id; b.style.background = p.color;
    b.innerHTML = `<i></i>${p.label}`;
    b.addEventListener("click", () => { if (G.fx.has(p.id)) G.fx.delete(p.id); else G.fx.add(p.id); applyGuitar(); });
    $("pedals").appendChild(b);
  });
  PRESETS.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "preset"; b.id = "pr" + i;
    b.innerHTML = `<b>${p.name}</b><span>${p.sub}</span>`;
    b.addEventListener("click", () => loadPreset(i));
    $("presets").appendChild(b);
  });
  function drawGuitar() {
    const a = AMPS[G.amp];
    $("amp").className = "amp " + (a.skin || "");
    $("ampModel").textContent = a.label;
    gkEls.forEach((el, k) => { el.style.setProperty("--v", knobVals.guitar[k]); el.querySelector(".val").textContent = Math.round(knobVals.guitar[k] * 10 * 10) / 10; });
    PEDALS.forEach(p => $("pd-" + p.id).classList.toggle("on", G.fx.has(p.id)));
    PRESETS.forEach((p, i) => $("pr" + i).classList.toggle("on", i === G.preset));
    $("inBtn").textContent = G.on ? "ENTRÉE ON" : "ENTRÉE OFF";
    $("inBtn").classList.toggle("on", G.on);
  }
  function setGuitarKnob(k, v) { knobVals.guitar[k] = v; applyGuitar(); }
  function loadPreset(i) {
    const p = PRESETS[i];
    G.preset = i; G.amp = p.amp; G.fx = new Set(p.fx);
    knobVals.guitar = p.k.slice();
    applyGuitar();
    if (tab === "guitar") lcd("lcdPad", "GUITARE", p.name + " · " + p.sub);
    store.set("gpreset", i);
  }

  function curve(drive, asym) {
    const n = 2048, c = new Float32Array(n), k = drive, b = asym;
    const norm = Math.tanh(k * (1 + b)) - Math.tanh(k * b);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = (Math.tanh(k * (x + b)) - Math.tanh(k * b)) / norm; }
    return c;
  }
  function fuzzCurve() {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; const y = x > 0 ? 1 - Math.exp(-x * 9) : -(1 - Math.exp(x * 5)) * 0.85; c[i] = y; }
    return c;
  }
  function impulse(sec, decay, damp) {
    const n = Math.floor(sec * sr), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lpv = 0;
      for (let i = 0; i < n; i++) { const w = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); lpv += damp * (w - lpv); d[i] = lpv; }
    }
    return b;
  }
  const bq = (type, f, q, g) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q !== undefined) n.Q.value = q; if (g !== undefined) n.gain.value = g; return n; };
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  // Insert commutable : entrée -> (sec | effet) -> sortie
  function insert(build) {
    const inp = gain(1), out = gain(1), dry = gain(1), wet = gain(0);
    const fx = build(inp);
    inp.connect(dry); dry.connect(out); fx.connect(wet); wet.connect(out);
    return { inp, out, set(on) { const t = ctx.currentTime; dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.01); wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.01); } };
  }
  function buildGuitar() {
    gn = {};
    gn.input = gain(1);
    gn.analyser = ctx.createAnalyser(); gn.analyser.fftSize = 2048;
    gn.input.connect(gn.analyser);
    gn.onAn = ctx.createAnalyser(); gn.onAn.fftSize = 256; gn.input.connect(gn.onAn);
    let head = gn.input;
    if (hasWorklet) {
      gn.gate = new AudioWorkletNode(ctx, "nomad-gate", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      gn.input.connect(gn.gate); head = gn.gate;
    }
    const hpIn = bq("highpass", 70, 0.7); head.connect(hpIn);
    // Pédales
    gn.comp = insert(i => { const c = ctx.createDynamicsCompressor(); c.threshold.value = -32; c.ratio.value = 5; c.attack.value = 0.008; c.release.value = 0.15; const mk = gain(2.2); i.connect(c); c.connect(mk); return mk; });
    gn.drive = insert(i => { const h = bq("highpass", 720, 0.5), s = ctx.createWaveShaper(); s.curve = curve(6, 0.05); s.oversample = "2x"; const pre = gain(2), l = bq("lowpass", 3800, 0.6), dryMix = gain(0.35), o = gain(0.8); i.connect(h); h.connect(pre); pre.connect(s); s.connect(l); l.connect(o); i.connect(dryMix); dryMix.connect(o); return o; });
    gn.fuzz = insert(i => { const pre = gain(8), s = ctx.createWaveShaper(); s.curve = fuzzCurve(); s.oversample = "2x"; const l = bq("lowpass", 3200, 0.6), o = gain(0.45); i.connect(pre); pre.connect(s); s.connect(l); l.connect(o); return o; });
    gn.vibe = insert(i => {
      const o = gain(0.7), lfo = ctx.createOscillator(); lfo.frequency.value = 5.2; lfo.start();
      let prev = i; [260, 560, 1150, 2400].forEach(f => { const a = bq("allpass", f, 0.6); const dep = gain(f * 0.55); lfo.connect(dep); dep.connect(a.frequency); prev.connect(a); prev = a; });
      prev.connect(o); i.connect(o); return o;
    });
    // Ampli
    gn.pre = gain(1);
    gn.bass = bq("lowshelf", 120, undefined, 0); gn.mid = bq("peaking", 800, 0.8, 0); gn.treble = bq("highshelf", 2800, undefined, 0);
    gn.shaper = ctx.createWaveShaper(); gn.shaper.oversample = "2x";
    gn.post = gain(1);
    gn.presence = bq("highshelf", 4500, undefined, 0);
    gn.cab1 = bq("highpass", 80, 0.7); gn.cab2 = bq("peaking", 120, 1.0, 3); gn.cab3 = bq("peaking", 2600, 1.0, -4); gn.cab4 = bq("lowpass", 5200, 0.7); gn.cab5 = bq("lowpass", 5200, 0.7);
    gn.ampIn = gain(1); gn.ampOut = gain(1);
    gn.ampIn.connect(gn.pre); gn.pre.connect(gn.bass); gn.bass.connect(gn.mid); gn.mid.connect(gn.treble); gn.treble.connect(gn.shaper); gn.shaper.connect(gn.post);
    gn.post.connect(gn.presence); gn.presence.connect(gn.cab1); gn.cab1.connect(gn.cab2); gn.cab2.connect(gn.cab3); gn.cab3.connect(gn.cab4); gn.cab4.connect(gn.cab5); gn.cab5.connect(gn.ampOut);
    // Voie acoustique
    gn.acIn = gain(0); gn.acOut = gain(1);
    const a1 = bq("highpass", 80, 0.7), a2 = bq("peaking", 200, 1.2, 0), a3 = bq("peaking", 2500, 1.0, -2), a4 = bq("highshelf", 6000, undefined, 0);
    gn.acBass = a2; gn.acMid = a3; gn.acTreb = a4;
    gn.acIn.connect(a1); a1.connect(a2); a2.connect(a3); a3.connect(a4); a4.connect(gn.acOut);
    gn.ampSel = gain(1);
    // Chaîne : entrée -> comp -> drive -> fuzz -> vibe -> (ampli | acoustique) -> chorus -> écho -> réverbe -> master
    hpIn.connect(gn.comp.inp); gn.comp.out.connect(gn.drive.inp); gn.drive.out.connect(gn.fuzz.inp); gn.fuzz.out.connect(gn.vibe.inp);
    gn.vibe.out.connect(gn.ampSel); gn.ampSel.connect(gn.ampIn); gn.vibe.out.connect(gn.acIn);
    gn.sum = gain(1); gn.ampOut.connect(gn.sum); gn.acOut.connect(gn.sum);
    gn.chorus = insert(i => { const d = ctx.createDelay(0.05); d.delayTime.value = 0.014; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.8; const dep = gain(0.0035); lfo.connect(dep); dep.connect(d.delayTime); lfo.start(); const o = gain(1), w = gain(0.55); i.connect(o); i.connect(d); d.connect(w); w.connect(o); return o; });
    gn.sum.connect(gn.chorus.inp);
    gn.dly = ctx.createDelay(1.5); gn.dly.delayTime.value = 0.38; gn.dlyFb = gain(0.35); gn.dlyWet = gain(0); const dlyLp = bq("lowpass", 2600, 0.7);
    gn.chorus.out.connect(gn.dly); gn.dly.connect(dlyLp); dlyLp.connect(gn.dlyFb); gn.dlyFb.connect(gn.dly); dlyLp.connect(gn.dlyWet);
    gn.rev = ctx.createConvolver(); gn.rev.buffer = impulse(2.2, 3, 0.35); gn.revWet = gain(0);
    gn.chorus.out.connect(gn.rev); gn.rev.connect(gn.revWet);
    gn.master = gain(0);
    gn.chorus.out.connect(gn.master); gn.dlyWet.connect(gn.master); gn.revWet.connect(gn.master);
    // Limiteur : empêche un larsen de s'emballer
    gn.lim = ctx.createDynamicsCompressor(); gn.lim.threshold.value = -6; gn.lim.knee.value = 0; gn.lim.ratio.value = 20; gn.lim.attack.value = 0.001; gn.lim.release.value = 0.08;
    // anti-larsen : repère une fréquence qui sonne seule et longtemps, la creuse ; si ça continue, baisse puis coupe la guitare
    gn.notch = [0, 1, 2, 3].map(() => { const b = ctx.createBiquadFilter(); b.type = "peaking"; b.frequency.value = 1000; b.Q.value = 14; b.gain.value = 0; return b; });
    gn.duck = gain(1);
    gn.master.connect(gn.notch[0]); gn.notch[0].connect(gn.notch[1]); gn.notch[1].connect(gn.notch[2]); gn.notch[2].connect(gn.notch[3]); gn.notch[3].connect(gn.duck); gn.duck.connect(gn.lim);
    gn.fbAn = ctx.createAnalyser(); gn.fbAn.fftSize = 4096; gn.fbAn.smoothingTimeConstant = 0.5; gn.duck.connect(gn.fbAn);
    gn.lim.connect(chGtr);
    setGate(store.get("gate", -55)); setTrim(store.get("trim", 1));
    const saved = store.get("gpreset", 0);
    loadPreset(saved >= 0 && saved < PRESETS.length ? saved : 0);
  }
  function applyGuitar() {
    drawGuitar();
    if (!gn) return;
    const t = ctx.currentTime, k = knobVals.guitar, a = AMPS[G.amp];
    const acoustic = G.amp === "bois";
    gn.ampSel.gain.setTargetAtTime(acoustic ? 0 : 1, t, 0.02);
    gn.acIn.gain.setTargetAtTime(acoustic ? 1 : 0, t, 0.02);
    gn.comp.set(G.fx.has("comp")); gn.drive.set(G.fx.has("drive")); gn.fuzz.set(G.fx.has("fuzz")); gn.vibe.set(G.fx.has("vibe")); gn.chorus.set(G.fx.has("chorus"));
    const db = v => (v - 0.5) * 24;
    if (!acoustic) {
      const drv = 1 + Math.pow(k[0], 2) * a.maxDrive;
      gn.pre.gain.setTargetAtTime(drv, t, 0.02);
      gn.shaper.curve = curve(1.2, a.asym);
      gn.post.gain.setTargetAtTime(1 / Math.sqrt(drv) * 1.4, t, 0.02);
      gn.bass.gain.setTargetAtTime(db(k[1]) + a.low, t, 0.02);
      gn.mid.frequency.value = a.midF; gn.mid.Q.value = a.midQ;
      gn.mid.gain.setTargetAtTime(db(k[2]) + a.midBase, t, 0.02);
      gn.treble.gain.setTargetAtTime(db(k[3]), t, 0.02);
      gn.presence.gain.setTargetAtTime(db(k[4]) * 0.7, t, 0.02);
      gn.cab4.frequency.value = a.cab; gn.cab5.frequency.value = a.cab;
    } else {
      gn.acBass.gain.setTargetAtTime(db(k[1]) * 0.6 + 2, t, 0.02);
      gn.acMid.gain.setTargetAtTime(db(k[2]) * 0.6 - 2, t, 0.02);
      gn.acTreb.gain.setTargetAtTime(db(k[3]) * 0.6 + 3, t, 0.02);
    }
    gn.revWet.gain.setTargetAtTime(Math.pow(k[5], 1.5) * 0.9, t, 0.02);
    gn.master.gain.setTargetAtTime(G.on && !tuning ? Math.pow(k[6], 1.5) * 1.6 : 0, t, 0.02);
    const dl = G.fx.has("delay") ? Math.max(k[7], 0.25) : k[7];
    gn.dlyWet.gain.setTargetAtTime(dl * 0.7, t, 0.02);
    gn.dlyFb.gain.setTargetAtTime(0.2 + dl * 0.35, t, 0.02);
  }
  drawGuitar();

  let micStream = null, micSrc = null;
  async function startInput(deviceId) {
    if (!ctx) return;
    try {
      if (micSrc) { micSrc.disconnect(); micSrc = null; }
      if (micStream) micStream.getTracks().forEach(tr => tr.stop());
      try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, latency: 0 } });
      micSrc = ctx.createMediaStreamSource(micStream);
      micSrc.connect(gn.input);
      gn.input.gain.value = +$("trimSl").value;
      G.on = true; applyGuitar();
      lcd("lcdPad", "GUITARE", "entrée active · " + (micStream.getAudioTracks()[0].label || "micro"));
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
      if (devs.length > 1) {
        const sel = $("devSel"); sel.innerHTML = ""; sel.hidden = false;
        devs.forEach(d => { const o = document.createElement("option"); o.value = d.deviceId; o.textContent = d.label || "Entrée " + (sel.length + 1); if (d.deviceId === micStream.getAudioTracks()[0].getSettings().deviceId) o.selected = true; sel.appendChild(o); });
      }
    } catch (e) {
      G.on = false; applyGuitar();
      lcd("lcdPad", "GUITARE", "entrée refusée ou absente (" + e.name + ")");
    }
  }
  function stopInput() {
    if (micSrc) { micSrc.disconnect(); micSrc = null; }
    if (micStream) { micStream.getTracks().forEach(tr => tr.stop()); micStream = null; }
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    G.on = false; applyGuitar();
  }
  $("inBtn").addEventListener("click", () => { if (G.on) stopInput(); else startInput(); });
  const FB = { bin: -1, n: 0, slot: 0, hot: 0, spec: null };
  setInterval(() => {
    if (!gn || !gn.fbAn || !G.on) return;
    if (!FB.spec) FB.spec = new Float32Array(gn.fbAn.frequencyBinCount);
    gn.fbAn.getFloatFrequencyData(FB.spec);
    const sp = FB.spec, binHz = ctx.sampleRate / gn.fbAn.fftSize; let pk = -1, pv = -200;
    for (let b = Math.floor(80 / binHz); b < Math.floor(9000 / binHz); b++) if (sp[b] > pv) { pv = sp[b]; pk = b; }
    let sum = 0, cnt = 0; for (let b = Math.max(1, pk - 60); b < Math.min(sp.length, pk + 60); b++) if (Math.abs(b - pk) > 4) { sum += sp[b]; cnt++; }
    // larsen : une fréquence qui domine, qui ne faiblit pas (une note jouée, elle, retombe) et sans nouvelle attaque depuis 0,8 s
    const ringing = pv > -26 && pv - sum / Math.max(1, cnt) > 24;
    if (ringing && Math.abs(pk - FB.bin) <= 2) FB.n++; else { FB.n = ringing ? 1 : 0; FB.bin = ringing ? pk : -1; FB.lv0 = pv; }
    const t = ctx.currentTime;
    if (FB.n >= 16 && pv >= FB.lv0 - 2 && t - gOnset.last > 0.8) {
      const f = pk * binHz, already = gn.notch.find(n => n.gain.value < -1 && Math.abs(n.frequency.value - f) < f * 0.04);
      if (already) { FB.hot++; gn.duck.gain.setTargetAtTime(Math.max(0.15, 0.5 / FB.hot), t, 0.02); lcd("lcdPad", "ANTI-LARSEN", "volume guitare réduit"); }
      else { const n = gn.notch[FB.slot++ % 4]; n.frequency.setValueAtTime(f, t); n.gain.setTargetAtTime(-26, t, 0.01); lcd("lcdPad", "ANTI-LARSEN", `${Math.round(f)} Hz creusé`); }
      if (FB.hot >= 3) { stopInput(); lcd("lcdPad", "ANTI-LARSEN", "guitare coupée · baissez le drive ou éloignez-vous du haut-parleur"); FB.hot = 0; gn.duck.gain.setTargetAtTime(1, t + 0.5, 0.2); }
      FB.n = 0; FB.lv0 = pv;
    }
    if (!ringing && FB.hot && Math.random() < 0.02) { FB.hot = Math.max(0, FB.hot - 1); if (!FB.hot) gn.duck.gain.setTargetAtTime(1, t, 0.5); }
  }, 50);
  function setGate(db) { $("gateSl").value = db; $("gateVal").textContent = db + " dB"; store.set("gate", db); if (gn && gn.gate) gn.gate.port.postMessage(db); }
  function setTrim(v) { $("trimSl").value = v; $("trimVal").textContent = Math.round(v * 100) + " %"; store.set("trim", v); if (gn) gn.input.gain.setTargetAtTime(v, ctx.currentTime, 0.02); }
  $("gateSl").addEventListener("input", e => setGate(+e.target.value));
  $("trimSl").addEventListener("input", e => setTrim(+e.target.value));

