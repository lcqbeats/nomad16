  // ---------- SONS : instruments et accords ----------
  let instData = null, instCur = store.get("inst", "pad"), instCat = "CLAVIERS";
  const instCache = new Map();
  let instBus = null, instFilt = null, instRev = null, instRevSend = null;
  const activeKeys = new Map();   // touche -> voix
  const SYNTHS = [
    { id: "synpad", name: "PAD CHAUD", cat: "SYNTHÉ", lic: "synthèse NOMAD" },
    { id: "synorg", name: "ORGUE", cat: "SYNTHÉ", lic: "synthèse NOMAD" },
    { id: "synsub", name: "SUB 808", cat: "SYNTHÉ", lic: "synthèse NOMAD" },
    { id: "synlead", name: "LEAD", cat: "SYNTHÉ", lic: "synthèse NOMAD" },
    { id: "synbrass", name: "CUIVRES", cat: "SYNTHÉ", lic: "synthèse NOMAD" },
    { id: "pad", name: "PAD CHOISI", cat: "SYNTHÉ", lic: "joue le pad sélectionné" }
  ];
  const CATS = ["CLAVIERS", "BASSES", "MAILLETS", "SOUFFLES", "CORDES", "SYNTHÉ"];
  let chordMode = store.get("chordMode", false), addBass = store.get("addBass", false);
  let tonic = store.get("tonic", 0), styleIdx = store.get("style", 0), octShift = 0, relTime = 0.6;
  const NN = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const Q = {
    maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
    "9": [0, 4, 7, 10, 14], "13": [0, 4, 10, 14, 21], m11: [0, 3, 7, 10, 14, 17], "6/9": [0, 4, 7, 9, 14], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10],
    add9: [0, 4, 7, 14], "7sus": [0, 5, 7, 10], "7#9": [0, 4, 7, 10, 15], "7b9": [0, 4, 7, 10, 13], m6: [0, 3, 7, 9]
  };
  const SYM = { maj: "", min: "m", maj7: "maj7", m7: "m7", "7": "7", maj9: "maj9", m9: "m9", "9": "9", "13": "13", m11: "m11", "6/9": "6/9", dim7: "°7", m7b5: "ø7", add9: "add9", "7sus": "7sus4", "7#9": "7#9", "7b9": "7b9", m6: "m6" };
  const STYLES = [
    { name: "NÉO SOUL", minor: false, p: [[2, "m9", "ii9"], [7, "13", "V13"], [0, "maj9", "Imaj9"], [9, "m9", "vi9"], [5, "maj9", "IVmaj9"], [4, "m7", "iii7"], [10, "9", "♭VII9"]] },
    { name: "JAZZ", minor: false, p: [[2, "m7", "ii7"], [7, "7b9", "V7♭9"], [0, "maj7", "Imaj7"], [9, "7", "VI7"], [4, "m7b5", "iiiø"], [5, "maj7", "IVmaj7"], [6, "dim7", "♯iv°7"]] },
    { name: "BOOM BAP", minor: true, p: [[0, "m9", "i9"], [5, "m9", "iv9"], [8, "maj7", "♭VImaj7"], [7, "7#9", "V7♯9"], [3, "maj7", "♭IIImaj7"], [10, "7", "♭VII7"], [2, "m7b5", "iiø"]] },
    { name: "LO-FI", minor: false, p: [[5, "maj7", "IVmaj7"], [4, "m7", "iii7"], [2, "m9", "ii9"], [7, "9", "V9"], [0, "maj9", "Imaj9"], [9, "m7", "vi7"], [8, "maj7", "♭VImaj7"]] },
    { name: "GOSPEL", minor: false, p: [[0, "add9", "I"], [4, "7", "III7"], [9, "m7", "vi7"], [5, "maj7", "IVmaj7"], [6, "dim7", "♯iv°7"], [7, "7sus", "V7sus"], [7, "13", "V13"]] },
    { name: "BLUES", minor: false, p: [[0, "9", "I9"], [5, "9", "IV9"], [7, "9", "V9"], [0, "7#9", "I7♯9"], [6, "dim7", "♯iv°7"], [2, "m7", "ii7"], [8, "7", "♭VI7"]] },
    { name: "REGGAE DUB", minor: true, p: [[0, "min", "i"], [5, "min", "iv"], [10, "maj", "♭VII"], [3, "maj", "♭III"], [8, "maj", "♭VI"], [7, "min", "v"], [2, "min", "ii"]] },
    { name: "SOUL 60s", minor: false, p: [[0, "maj", "I"], [9, "min", "vi"], [5, "maj", "IV"], [7, "maj", "V"], [2, "m7", "ii7"], [4, "m7", "iii7"], [7, "7", "V7"]] },
    { name: "CINÉ SOMBRE", minor: true, p: [[0, "m9", "i9"], [8, "maj7", "♭VImaj7"], [3, "maj7", "♭IIImaj7"], [10, "add9", "♭VII"], [5, "m6", "iv6"], [7, "7b9", "V7♭9"], [1, "maj7", "♭IImaj7"]] }
  ];
  const WHITE = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  let lastVoicing = [60, 64, 67], knobChord = -1, knobChordT = null;

  async function loadInstIndex() {
    if (instData) return;
    try { instData = await (await fetch("sons/instruments.json")).json(); } catch (e) { instData = { instruments: [] }; }
  }
  async function enterSons() {
    await loadInstIndex();
    if (!instBus && ctx) {
      instBus = ctx.createGain(); instBus.gain.value = knobVals.sons[0];
      instFilt = ctx.createBiquadFilter(); instFilt.type = "lowpass"; instFilt.frequency.value = 20000;
      instRev = ctx.createConvolver(); instRev.buffer = impulse(2.4, 2.5, 0.3); instRevSend = ctx.createGain(); instRevSend.gain.value = knobVals.sons[3] * 0.6;
      instBus.connect(instFilt); instFilt.connect(chSons); instFilt.connect(instRevSend); instRevSend.connect(instRev); instRev.connect(chSons);
    }
    const cur = allInsts().find(i => i.id === instCur);
    if (cur) instCat = cur.cat;
    if (cur && cur.regions && !instCache.has(cur.id) && ctx) selectInst(cur.id);
    drawSons();
  }
  const allInsts = () => (instData ? instData.instruments : []).concat(SYNTHS);
  function drawSons() {
    $("cats").innerHTML = "";
    CATS.forEach(c => { const b = document.createElement("button"); b.type = "button"; b.className = "cat" + (c === instCat ? " on" : ""); b.textContent = c; b.addEventListener("click", () => { instCat = c; drawSons(); }); $("cats").appendChild(b); });
    $("insts").innerHTML = "";
    allInsts().filter(i => i.cat === instCat).forEach(i => {
      const b = document.createElement("button"); b.type = "button"; b.className = "inst" + (i.id === instCur ? " on" : "");
      b.innerHTML = `<b>${i.name}</b><span>${i.lic}</span>`;
      b.addEventListener("click", () => selectInst(i.id)); $("insts").appendChild(b);
    });
    $("mNotes").classList.toggle("on", !chordMode); $("mChords").classList.toggle("on", chordMode); $("mBass").classList.toggle("on", addBass);
    $("chordPanel").hidden = !chordMode;
    const st = STYLES[styleIdx];
    $("keyVal").textContent = NN[tonic] + (st.minor ? "m" : ""); $("keyMode").textContent = st.minor ? "mineur" : "majeur";
    $("styles").innerHTML = "";
    STYLES.forEach((s2, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "stylebtn" + (i === styleIdx ? " on" : ""); b.textContent = s2.name; b.addEventListener("click", () => { styleIdx = i; store.set("style", i); drawSons(); }); $("styles").appendChild(b); });
    $("chords").innerHTML = "";
    st.p.forEach((c, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "chord"; b.id = "ch" + i;
      b.innerHTML = `<b>${NN[(tonic + c[0]) % 12]}${SYM[c[1]]}</b><span>${c[2]} · pad ${i + 1} · ${["DO", "RÉ", "MI", "FA", "SOL", "LA", "SI"][i]}</span>`;
      b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); chordOn("screen" + i, i, 0.8, 0); });
      ["pointerup", "pointercancel"].forEach(ev => b.addEventListener(ev, () => releaseKey("screen" + i)));
      $("chords").appendChild(b);
    });
    const ci = allInsts().find(i => i.id === instCur);
    $("instCredit").textContent = ci && ci.src ? `${ci.name} · ${ci.lic} · source : ${ci.src} (hébergé par danigb.github.io/samples)` : (ci ? ci.name + " · " + ci.lic : "");
  }
  $("mNotes").addEventListener("click", () => { chordMode = false; store.set("chordMode", false); drawSons(); });
  $("mChords").addEventListener("click", () => { chordMode = true; store.set("chordMode", true); drawSons(); });
  $("mBass").addEventListener("click", () => { addBass = !addBass; store.set("addBass", addBass); drawSons(); });
  function setOct(o) { octShift = Math.max(-2, Math.min(2, o)); knobVals.sons[4] = (octShift + 2) / 4; $("octVal").textContent = (octShift > 0 ? "+" : "") + octShift; if (tab === "sons") drawKnobs(); }
  $("octDown").addEventListener("click", () => setOct(octShift - 1));
  $("octUp").addEventListener("click", () => setOct(octShift + 1));
  $("keyDown").addEventListener("click", () => { tonic = (tonic + 11) % 12; store.set("tonic", tonic); drawSons(); });
  $("keyUp").addEventListener("click", () => { tonic = (tonic + 1) % 12; store.set("tonic", tonic); drawSons(); });

  async function selectInst(id) {
    instCur = id; store.set("inst", id); drawSons();
    const inst = allInsts().find(i => i.id === id);
    if (!inst || !inst.regions) { lcd("lcdPad", "SON", inst ? inst.name : id); return; }
    lcd("lcdPad", "SON", inst.name + " · chargement…");
    try { await loadInstSamples(inst); if (instCur === id) lcd("lcdPad", "SON", inst.name + " · prêt"); }
    catch (e) { lcd("lcdPad", "SON", inst.name + " · chargement impossible"); }
  }
  async function loadInstSamples(inst) {
    if (instCache.has(inst.id)) return instCache.get(inst.id);
    const bufs = await Promise.all(inst.regions.map(async r => {
      const url = inst.base + r[0].split("/").map(encodeURIComponent).join("/") + ".m4a";
      const ab = await (await fetch(url)).arrayBuffer();
      return await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
    }));
    instCache.set(inst.id, bufs);
    return bufs;
  }
  // Une voix : échantillon transposé, ou synthèse maison
  function noteOn(note, vel) {
    const v = noteOnRaw(note, vel);
    if (v && ctx) v.log = logNote("key", note, vel, ctx.currentTime);
    return v;
  }
  function noteOnRaw(note, vel) {
    if (!ctx || !instBus) return null;
    const t = ctx.currentTime, inst = allInsts().find(i => i.id === instCur);
    const amp = (0.2 + 0.8 * Math.pow(vel, 1.4)) * 0.5;
    const g = ctx.createGain(); g.connect(instBus);
    if (inst && inst.regions) {
      const bufs = instCache.get(inst.id); if (!bufs) return null;
      let ri = inst.regions.findIndex(r => note >= r[1] && note <= r[2]);
      if (ri < 0) { let bd = 1e9; inst.regions.forEach((r, i) => { const d = Math.min(Math.abs(note - r[1]), Math.abs(note - r[2])); if (d < bd) { bd = d; ri = i; } }); }
      const r = inst.regions[ri], src = ctx.createBufferSource();
      src.buffer = bufs[ri]; src.playbackRate.value = Math.pow(2, (note - r[3] + r[4] / 100) / 12);
      g.gain.value = amp * Math.pow(10, Math.min(12, r[5]) / 40);
      src.connect(g); src.start();
      return { g, srcs: [src], rel: Math.max(0.08, relTime * (inst.rel || 1)) };
    }
    const f = 440 * Math.pow(2, (note - 69) / 12), srcs = [];
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.connect(g);
    const osc = (type, fr, det, lvl) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = det || 0; const og = ctx.createGain(); og.gain.value = lvl; o.connect(og); og.connect(filt); o.start(t); srcs.push(o); return o; };
    g.gain.setValueAtTime(0, t);
    if (instCur === "synpad") { osc("sawtooth", f, -9, 0.3); osc("sawtooth", f, 9, 0.3); osc("triangle", f / 2, 0, 0.3); filt.frequency.setValueAtTime(400, t); filt.frequency.linearRampToValueAtTime(1800, t + 0.8); g.gain.linearRampToValueAtTime(amp * 0.8, t + 0.45); return { g, srcs, rel: 1.2 + relTime }; }
    if (instCur === "synorg") { [1, 2, 3, 4, 6, 8].forEach((h, i) => osc("sine", f * h, 0, [0.5, 0.4, 0.25, 0.2, 0.12, 0.1][i])); filt.frequency.value = 6000; g.gain.linearRampToValueAtTime(amp * 0.7, t + 0.01); return { g, srcs, rel: 0.06 + relTime * 0.2 }; }
    if (instCur === "synsub") { osc("sine", f, 0, 0.9); osc("triangle", f, 0, 0.15); filt.frequency.value = 900; g.gain.linearRampToValueAtTime(amp * 1.2, t + 0.008); return { g, srcs, rel: 0.15 + relTime * 0.5 }; }
    if (instCur === "synlead") { osc("square", f, 0, 0.3); osc("sawtooth", f, 7, 0.3); filt.frequency.value = 3200; filt.Q.value = 3; g.gain.linearRampToValueAtTime(amp * 0.7, t + 0.01); return { g, srcs, rel: 0.12 + relTime * 0.4 }; }
    if (instCur === "synbrass") { osc("sawtooth", f, -6, 0.35); osc("sawtooth", f, 6, 0.35); filt.frequency.setValueAtTime(300, t); filt.frequency.linearRampToValueAtTime(2600, t + 0.12); filt.frequency.linearRampToValueAtTime(1600, t + 0.5); g.gain.linearRampToValueAtTime(amp * 0.8, t + 0.05); return { g, srcs, rel: 0.2 + relTime * 0.4 }; }
    return null;
  }
  function voiceOff(v) {
    if (!v) return;
    if (v.log && v.log.off === null) v.log.off = ctx.currentTime;
    const t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.setTargetAtTime(0, t, v.rel / 4);
    v.srcs.forEach(s => { try { s.stop(t + v.rel * 1.5); } catch (e) {} });
  }
  function releaseKey(key) { const vs = activeKeys.get(key); if (!vs) return; vs.forEach(voiceOff); activeKeys.delete(key); [...document.querySelectorAll(".chord.hit")].forEach(b => { if (b.dataset.k === key) b.classList.remove("hit"); }); }
  // Accord : voicing le plus proche du précédent (conduite des voix)
  function voiceChord(root, q, invUp) {
    const iv = Q[q];
    let best = null, bestCost = 1e9;
    for (let base = 46; base <= 58; base++) {
      if ((base - root) % 12 !== 0 && false) continue;
      const notes = [];
      iv.forEach(x => { let n = root + x; while (n < base) n += 12; while (n >= base + 12 + (x >= 12 ? 12 : 0)) n -= 12; notes.push(n); });
      notes.sort((a, b) => a - b);
      const cost = notes.reduce((s, n, i) => s + Math.abs(n - (lastVoicing[Math.min(i, lastVoicing.length - 1)] || n)), 0) + (notes[0] < 48 ? 6 : 0);
      if (cost < bestCost) { bestCost = cost; best = notes; }
    }
    if (invUp) best = best.map(n => n + 12);
    lastVoicing = best.slice();
    return best;
  }
  function chordOn(key, idx, vel, invUp, octUp) {
    const st = STYLES[styleIdx], c = st.p[idx % st.p.length];
    const root = 48 + ((tonic + c[0]) % 12), sh = (octShift + (octUp || 0)) * 12;
    const notes = voiceChord(root, c[1], invUp).map(n => n + sh);
    if (addBass) notes.unshift(root - 12 + sh);
    releaseKey(key);
    const vs = notes.map(n => noteOn(n, vel)).filter(Boolean);
    activeKeys.set(key, vs);
    onFirstNote(ctx.currentTime);
    const b = $("ch" + (idx % st.p.length)); if (b) { b.classList.add("hit"); b.dataset.k = key; }
    lcd("lcdPad", "ACCORD", `${NN[root % 12]}${SYM[c[1]]} · ${notes.map(n => NN[n % 12]).join(" ")}`);
  }
  function scaleSnap(note) {
    const st = STYLES[styleIdx], sc = st.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const pc = ((note - tonic) % 12 + 12) % 12; if (sc.includes(pc)) return note;
    return note - 1;
  }
  function keyOn(note, vel) {
    if (!ctx) return;
    if (!instBus) enterSons();
    if (chordMode && note < 60) {
      const pc = note % 12; const isWhite = pc in WHITE;
      chordOn("k" + note, isWhite ? WHITE[pc] : WHITE[pc - 1], vel, !isWhite);
      return;
    }
    const n = (chordMode ? scaleSnap(note) : note) + octShift * 12;
    releaseKey("k" + note);
    const v = noteOn(n, vel); if (v) activeKeys.set("k" + note, [v]);
    onFirstNote(ctx.currentTime);
    const inst = allInsts().find(i => i.id === instCur);
    lcd("lcdPad", "SON", `${inst ? inst.name : ""} · ${NN[n % 12]}${Math.floor(n / 12) - 1}`);
  }
  function keyOff(note) { if (instCur !== "pad") releaseKey("k" + note); }
  function sonsKnob(k, val) {
    knobVals.sons[k] = val;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (k === 0 && instBus) instBus.gain.setTargetAtTime(val, t, 0.02);
    if (k === 1) relTime = 0.05 + val * 2.5;
    if (k === 2 && instFilt) instFilt.frequency.setTargetAtTime(150 * Math.pow(20000 / 150, val), t, 0.02);
    if (k === 3 && instRevSend) instRevSend.gain.setTargetAtTime(val * 0.8, t, 0.02);
    if (k === 4) { octShift = Math.round((val - 0.5) * 4); $("octVal").textContent = (octShift > 0 ? "+" : "") + octShift; lcd("lcdPad", "SON", "octave " + (octShift > 0 ? "+" : "") + octShift); }
    if (k === 5) { const nt = Math.min(11, Math.floor(val * 12)); if (nt !== tonic) { tonic = nt; store.set("tonic", tonic); drawSons(); } }
    if (k === 6) { const ns = Math.min(STYLES.length - 1, Math.floor(val * STYLES.length)); if (ns !== styleIdx) { styleIdx = ns; store.set("style", ns); drawSons(); } }
    if (k === 7) { const st = STYLES[styleIdx]; const i = Math.min(st.p.length - 1, Math.floor(val * st.p.length)); if (i !== knobChord) { knobChord = i; chordOn("knob", i, 0.7, 0); clearTimeout(knobChordT); knobChordT = setTimeout(() => releaseKey("knob"), 1200); } }
  }

