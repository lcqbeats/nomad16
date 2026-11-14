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
    add9: [0, 4, 7, 14], sus2: [0, 2, 7, 14], "7sus": [0, 5, 7, 10], "7#9": [0, 4, 7, 10, 15], "7b9": [0, 4, 7, 10, 13], m6: [0, 3, 7, 9]
  };
  const SYM = { maj: "", min: "m", maj7: "maj7", m7: "m7", "7": "7", maj9: "maj9", m9: "m9", "9": "9", "13": "13", m11: "m11", "6/9": "6/9", dim7: "°7", m7b5: "ø7", add9: "add9", sus2: "sus2", "7sus": "7sus4", "7#9": "7#9", "7b9": "7b9", m6: "m6" };
  const STYLES = [
    { name: "NÉO SOUL", minor: false, p: [[2, "m9", "ii9"], [7, "13", "V13"], [0, "maj9", "Imaj9"], [9, "m9", "vi9"], [5, "maj9", "IVmaj9"], [4, "m7", "iii7"], [10, "9", "♭VII9"]] },
    { name: "JAZZ", minor: false, p: [[2, "m7", "ii7"], [7, "7b9", "V7♭9"], [0, "maj7", "Imaj7"], [9, "7", "VI7"], [4, "m7b5", "iiiø"], [5, "maj7", "IVmaj7"], [6, "dim7", "♯iv°7"]] },
    { name: "BOOM BAP", minor: true, p: [[0, "m9", "i9"], [5, "m9", "iv9"], [8, "maj7", "♭VImaj7"], [7, "7#9", "V7♯9"], [3, "maj7", "♭IIImaj7"], [10, "7", "♭VII7"], [2, "m7b5", "iiø"]] },
    { name: "LO-FI", minor: false, p: [[5, "maj7", "IVmaj7"], [4, "m7", "iii7"], [2, "m9", "ii9"], [7, "9", "V9"], [0, "maj9", "Imaj9"], [9, "m7", "vi7"], [8, "maj7", "♭VImaj7"]] },
    { name: "GOSPEL", minor: false, p: [[0, "add9", "I"], [4, "7", "III7"], [9, "m7", "vi7"], [5, "maj7", "IVmaj7"], [6, "dim7", "♯iv°7"], [7, "7sus", "V7sus"], [7, "13", "V13"]] },
    { name: "BLUES", minor: false, p: [[0, "9", "I9"], [5, "9", "IV9"], [7, "9", "V9"], [0, "7#9", "I7♯9"], [6, "dim7", "♯iv°7"], [2, "m7", "ii7"], [8, "7", "♭VI7"]] },
    { name: "REGGAE DUB", minor: true, p: [[0, "min", "i"], [5, "min", "iv"], [10, "maj", "♭VII"], [3, "maj", "♭III"], [8, "maj", "♭VI"], [7, "min", "v"], [2, "min", "ii"]] },
    { name: "SOUL 60s", minor: false, p: [[0, "maj", "I"], [9, "min", "vi"], [5, "maj", "IV"], [7, "maj", "V"], [2, "m7", "ii7"], [4, "m7", "iii7"], [7, "7", "V7"]] },
    // couleurs tirées des morceaux analysés (types d'accords, pas leur grille) : transposables, à jouer dans l'ordre qu'on veut
    { name: "COULEUR SOBER", minor: true, p: [[0, "m9", "i9"], [10, "maj9", "♭VIImaj9"], [7, "m11", "v11"], [8, "maj9", "♭VImaj9"], [5, "m9", "iv9"], [3, "maj7", "♭IIImaj7"], [0, "m11", "i11"]] },
    { name: "COULEUR ALL THINGS", minor: true, p: [[0, "sus2", "isus2"], [5, "m9", "iv9"], [3, "maj7", "♭IIImaj7"], [10, "sus2", "♭VIIsus2"], [0, "m11", "i11"], [8, "maj7", "♭VImaj7"], [7, "7sus", "V7sus"]] },
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
      applySonsFx(SFX.id);
      duckInit();
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
    $("mNotes").classList.toggle("on", !chordMode); $("mChords").classList.toggle("on", chordMode); $("mBass").classList.toggle("on", addBass); $("mFull").classList.toggle("on", sonsFull);
    $("chordPanel").hidden = !chordMode || isDrum(instCur);
    drawSonsFx();
    try { drawDrums(); } catch (e) {}
    const st = STYLES[styleIdx];
    drawKeyFromLoop();
    $("keyVal").textContent = NN[tonic] + (st.minor ? "m" : ""); $("keyMode").textContent = st.minor ? "mineur" : "majeur";
    $("styles").innerHTML = "";
    STYLES.forEach((s2, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "stylebtn" + (i === styleIdx ? " on" : ""); b.textContent = s2.name; b.addEventListener("click", () => { styleIdx = i; store.set("style", i); drawSons(); }); $("styles").appendChild(b); });
    $("chords").innerHTML = "";
    // rangés comme les pads de l'Akai : 5-6-7-8 en haut, 1-2-3-4 en bas (le pad 8 rejoue l'accord 1 à l'octave)
    [4, 5, 6, 7, 0, 1, 2, 3].forEach(pad => {
      const i = pad < 7 && pad < st.p.length ? pad : 0, oct = pad === 7 || pad >= st.p.length, c = st.p[i];
      const b = document.createElement("button"); b.type = "button"; b.className = "chord"; if (!oct) b.id = "ch" + i;
      b.innerHTML = `<b>${NN[(tonic + c[0]) % 12]}${SYM[c[1]]}${oct ? " ↑" : ""}</b><span>${oct ? "octave" : c[2]} · pad ${pad + 1}${oct ? "" : " · " + ["DO", "RÉ", "MI", "FA", "SOL", "LA", "SI"][i]}</span>`;
      b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); chordOn("screen" + pad, i, 0.8, 0, oct ? 1 : 0); });
      ["pointerup", "pointercancel"].forEach(ev => b.addEventListener(ev, () => releaseKey("screen" + pad)));
      $("chords").appendChild(b);
    });
    const ci = allInsts().find(i => i.id === instCur);
    $("instCredit").textContent = ci && ci.src ? `${ci.name} · ${ci.lic} · source : ${ci.src} (hébergé par danigb.github.io/samples)` : (ci ? ci.name + " · " + ci.lic : "");
  }
  $("mNotes").addEventListener("click", () => { chordMode = false; store.set("chordMode", false); drawSons(); });
  $("mChords").addEventListener("click", () => { chordMode = true; store.set("chordMode", true); drawSons(); });
  $("mBass").addEventListener("click", () => { addBass = !addBass; store.set("addBass", addBass); drawSons(); });
  $("mFull").addEventListener("click", () => { sonsFull = !sonsFull; store.set("sonsFull", sonsFull); drawSons(); lcd("lcdPad", "SONS", sonsFull ? "FULL : toutes les notes à pleine force" : "FULL coupé : la force de frappe compte"); });
  function setOct(o) { octShift = Math.max(-2, Math.min(2, o)); knobVals.sons[4] = (octShift + 2) / 4; $("octVal").textContent = (octShift > 0 ? "+" : "") + octShift; if (tab === "sons") drawKnobs(); }
  $("octDown").addEventListener("click", () => setOct(octShift - 1));
  $("octUp").addEventListener("click", () => setOct(octShift + 1));
  // CALER SUR LA BOUCLE : la tonalité des accords suit celle estimée sur les boucles du looper.
  // Si le style est majeur et la boucle mineure (ou l'inverse), on prend la relative : mêmes notes, le style ne change pas.
  function drawKeyFromLoop() {
    const b = $("keyFromLoop"); if (!b) return;
    const k = TONAL.loop; b.disabled = !k;
    b.textContent = k ? `CALER SUR LA BOUCLE : ${k.name}` : "CALER SUR LA BOUCLE : — (enregistrez une boucle)";
  }
  $("keyFromLoop").addEventListener("click", () => {
    const k = TONAL.loop; if (!k) return;
    const st = STYLES[styleIdx], t = st.minor === k.minor ? k.tonic : st.minor ? (k.tonic + 9) % 12 : (k.tonic + 3) % 12;
    tonic = t; store.set("tonic", tonic); drawSons();
    lcd("lcdPad", "TONALITÉ", st.minor === k.minor ? `calée sur la boucle : ${k.name}` : `boucle en ${k.name} · accords en ${NN[t]}${st.minor ? "m" : ""} (relative, mêmes notes)`);
  });
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
  let sonsFull = store.get("sonsFull", false);
  function noteOn(note, vel, when) {
    if (sonsFull) vel = 1;
    const v = noteOnRaw(note, vel, when);
    if (v && ctx) v.log = logNote("key", note, vel, Math.max(ctx.currentTime, when || 0));
    return v;
  }
  function noteOnRaw(note, vel, when) {
    if (!ctx || !instBus) return null;
    const t = Math.max(ctx.currentTime, when || 0), inst = allInsts().find(i => i.id === instCur);
    const amp = (0.2 + 0.8 * Math.pow(vel, 1.4)) * 0.5;
    const g = ctx.createGain(), atk = attackTime();
    if (atk) { const ag = ctx.createGain(); ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(1, t + atk); g.connect(ag); ag.connect(instBus); } else g.connect(instBus);
    if (inst && inst.regions) {
      const bufs = instCache.get(inst.id); if (!bufs) return null;
      let ri = inst.regions.findIndex(r => note >= r[1] && note <= r[2]);
      if (ri < 0) { let bd = 1e9; inst.regions.forEach((r, i) => { const d = Math.min(Math.abs(note - r[1]), Math.abs(note - r[2])); if (d < bd) { bd = d; ri = i; } }); }
      const r = inst.regions[ri], src = ctx.createBufferSource();
      src.buffer = bufs[ri]; src.playbackRate.value = Math.pow(2, (note - r[3] + r[4] / 100) / 12);
      g.gain.value = amp * Math.pow(10, Math.min(12, r[5]) / 40);
      src.connect(g); src.start(t);
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
    if (instCur.startsWith("syl")) { filt.disconnect(); return sylVoice(instCur, f, t, amp, g); }
    if (NCOL_ID[instCur]) { filt.disconnect(); return nomVoice(instCur, f, t, amp, g); }
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
    // STRUM (potard 8) : les notes partent l'une après l'autre, de la plus grave à la plus aiguë, de plus en plus douces
    const gap = strumGap(), t0 = ctx.currentTime;
    const vs = notes.map((n, k) => noteOn(n, gap ? Math.max(0.05, vel * (1 - 0.05 * k)) : vel, t0 + k * gap)).filter(Boolean);
    activeKeys.set(key, vs);
    onFirstNote(ctx.currentTime);
    const b = $("ch" + (idx % st.p.length)); if (b) { b.classList.add("hit"); b.dataset.k = key; }
    lcd("lcdPad", "ACCORD", `${NN[root % 12]}${SYM[c[1]]} · ${notes.map(n => NN[n % 12]).join(" ")}`);
  }
  // potard Attaque : montée progressive de chaque note (0 = immédiate, à fond = 2 s)
  const attackTime = () => { const v = knobVals.sons[6]; return v < 0.02 ? 0 : v * v * 2; };
  const strumGap = () => { const v = knobVals.sons[7]; return v < 0.02 ? 0 : v * v * 0.15; };
  function scaleSnap(note) {
    const st = STYLES[styleIdx], sc = st.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const pc = ((note - tonic) % 12 + 12) % 12; if (sc.includes(pc)) return note;
    return note - 1;
  }
  function keyOn(note, vel) {
    if (!ctx) return;
    if (isDrum(instCur)) { drKey(note); return; }
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
  // SIDECHAIN façon « mother ducker » : SONS se creuse à chaque kick de la boucle ou des pads, puis remonte en rythme
  const DUCK_LV = [["off", "SIDECHAIN", 0], ["leger", "SIDECHAIN · LÉGER", 0.5], ["fort", "SIDECHAIN · FORT", 0.85]];
  let duckMode = store.get("sonsDuck", "off"), duckNode = null;
  function duckInit() {
    if (duckNode || !hasWorklet || !ctx) return;
    try {
      duckNode = new AudioWorkletNode(ctx, "nomad-duck", { numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2] });
      const key = ctx.createBiquadFilter(); key.type = "lowpass"; key.frequency.value = 140; key.Q.value = 0.7;
      loopBus.connect(key); chPads.connect(key); key.connect(duckNode, 0, 1);
      chSons.disconnect(liveBus); chSons.connect(duckNode, 0, 0); duckNode.connect(liveBus);
      duckSend();
      setInterval(() => { if (duckMode !== "off") duckSend(); }, 2000);
    } catch (e) { duckNode = null; }
  }
  // remontée sur un peu plus d'une croche : ça « pompe » au tempo de la boucle
  function duckSend() { if (duckNode) duckNode.port.postMessage({ depth: DUCK_LV.find(x => x[0] === duckMode)[2], rel: Math.min(0.6, Math.max(0.12, 0.6 * 60 / curBpm())) }); }
  function setDuck(m) {
    duckMode = m; store.set("sonsDuck", m); duckSend(); drawDuck();
    lcd("lcdPad", "SIDECHAIN", m === "off" ? "coupé" : (m === "fort" ? "fort" : "léger") + " · SONS s'efface sous le kick");
  }
  function drawDuck() { const b = $("mDuck"); if (!b) return; const l = DUCK_LV.find(x => x[0] === duckMode); b.textContent = l[1]; b.classList.toggle("on", duckMode !== "off"); }
  $("mDuck").addEventListener("click", () => { const i = DUCK_LV.findIndex(x => x[0] === duckMode); setDuck(DUCK_LV[(i + 1) % 3][0]); });
  drawDuck();
  function sonsKnob(k, val) {
    knobVals.sons[k] = val;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (k === 0 && instBus) instBus.gain.setTargetAtTime(val, t, 0.02);
    if (k === 1) relTime = 0.05 + val * 2.5;
    if (k === 2 && instFilt) instFilt.frequency.setTargetAtTime(150 * Math.pow(20000 / 150, val), t, 0.02);
    if (k === 3 && instRevSend) instRevSend.gain.setTargetAtTime(val * 0.8, t, 0.02);
    if (k === 4) { octShift = Math.round((val - 0.5) * 4); $("octVal").textContent = (octShift > 0 ? "+" : "") + octShift; lcd("lcdPad", "SON", "octave " + (octShift > 0 ? "+" : "") + octShift); }
    if (k === 5) { sonsFxDose(); const p = SONS_FX.find(x => x[0] === SFX.id); lcd("lcdPad", "EFFET", (p ? p[1] : "") + " · dosé à " + Math.round(val * 100) + " %"); }
    if (k === 6) { const a = attackTime(); lcd("lcdPad", "ATTAQUE", a ? (a < 1 ? Math.round(a * 1000) + " ms" : a.toFixed(1) + " s") + " de montée" : "immédiate"); }
    if (k === 7) { const g = strumGap(); lcd("lcdPad", "STRUM", g ? `${Math.round(g * 1000)} ms entre les notes` : "accords plaqués"); }
  }

