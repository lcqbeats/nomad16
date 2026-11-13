  // ---------- SCRATCH : platine tactile, fader de coupure, phrases, sillon fermé ----------
  const SCR = { node: null, src: "bank", idx: 0, name: "—", N: 0, bsr: 48000, cue: 0, motor: false, speed: 33, pitch: 0, semi: null, hand: null, rep: { pos: 0, vel: 0, t: 0 }, fader: 0.2, ham: false, padOpen: false, padCut: false, btnOpen: false, btnCut: false, gate: null, bank: null, voix: null, mine: [], ph: -1, raf: 0, loading: 0 };
  const SCR_REV = 1.8; // secondes de son par tour de disque (33 tours)
  const SCR_SRCS = [["bank", "BANQUE"], ["voix", "VOIX"], ["pad", "PAD"], ["chop", "CHOP"], ["piste", "PISTE"], ["mine", "MES SONS"]];
  // Phrases : [pas de 1/16, vitesse crête (× normale, signe = sens), fader (1, 0 ou motif ouvert/fermé)]
  const SCR_PH = [
    ["BABY", 1, [[1, 2.2, 1], [1, -2.2, 1]]],
    ["CHIRP", 1, [[1, 2.4, "10"], [1, -2.4, "01"]]],
    ["TRANSFORM", 1, [[2, 1.1, "10101010"], [2, -1.1, "10101010"]]],
    ["FLARE", 1, [[2, 1.4, "11011"], [2, -1.4, "11011"]]],
    ["TEAR", 1, [[1, 2, 1], [1, -1, 1], [1, -1, 1], [1, 0, 0]]],
    ["STAB", 1, [[1, 3, "1100"], [1, -3, 0]]]
  ];
  // Banque de sons à scratcher : synthèse maison (voyelles, tons de battle, frappes) + voix libres de droits
  function scrSynth(rate) {
    const mk = sec => new Float32Array(Math.floor(rate * sec));
    const reson = (x, F, bw) => { const r = Math.exp(-Math.PI * bw / rate), a1 = 2 * r * Math.cos(2 * Math.PI * F / rate), a2 = -r * r, y = new Float32Array(x.length); let y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = (1 - r) * x[i] + a1 * y1 + a2 * y2; y2 = y1; y1 = v; y[i] = v; } return y; };
    const voice = (dur, f0a, f0b, forms, noiseHead) => {
      const x = mk(dur); let ph = 0;
      for (let i = 0; i < x.length; i++) { const t = i / rate, f0 = (f0a + (f0b - f0a) * t / dur) * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t)); ph += f0 / rate; if (ph >= 1) ph -= 1; x[i] = (ph < 0.08 ? 1 : 0) - 0.08 + (Math.random() * 2 - 1) * 0.02; }
      const fF = typeof forms === "function";
      const out = mk(dur);
      const segN = fF ? 24 : 1;
      for (let k = 0; k < segN; k++) {
        const a = Math.floor(k * x.length / segN), b = Math.floor((k + 1) * x.length / segN), fs = fF ? forms(k / (segN - 1)) : forms;
        const seg = x.subarray(Math.max(0, a - 400), b);
        const ys = fs.map(([F, bw, g]) => reson(seg, F, bw).map(v => v * g));
        for (let i = a; i < b; i++) { let v = 0; ys.forEach(y => v += y[i - Math.max(0, a - 400)]); out[i] = v; }
      }
      let pk = 0; out.forEach(v => pk = Math.max(pk, Math.abs(v)));
      for (let i = 0; i < out.length; i++) { const t = i / rate; const env = Math.min(1, t / 0.025) * Math.min(1, (dur - t) / 0.12); out[i] = out[i] / pk * 0.8 * env; if (noiseHead && t < noiseHead) out[i] += (Math.random() * 2 - 1) * 0.25 * (1 - t / noiseHead); }
      return out;
    };
    const mix = (n, f) => { const x = mk(n); for (let i = 0; i < x.length; i++) x[i] = f(i / rate, i); return x; };
    const lerp = (A, B, u) => A.map((a, j) => [a[0] + (B[j][0] - a[0]) * u, a[1], a[2]]);
    const AH = [[730, 90, 1], [1090, 110, 0.5], [2440, 160, 0.25]], OO = [[300, 70, 1], [870, 90, 0.3], [2240, 160, 0.1]], EE = [[270, 70, 1], [2290, 120, 0.4], [3010, 180, 0.2]], EH = [[530, 80, 1], [1840, 120, 0.45], [2480, 160, 0.2]];
    const snare = mix(0.7, (t) => (Math.sin(2 * Math.PI * 190 * t) * 0.6 * Math.exp(-t / 0.05) + (Math.random() * 2 - 1) * 0.7 * Math.exp(-t / 0.14)) * 0.9);
    const kick = mix(0.6, (t) => Math.tanh(Math.sin(2 * Math.PI * (48 * t + 110 * 0.04 * (1 - Math.exp(-t / 0.04)))) * Math.exp(-t / 0.25) * 2.2) * 0.9);
    const bb = mk(1.2); bb.set(kick.subarray(0, Math.min(kick.length, Math.floor(rate * 0.6)))); bb.set(snare.subarray(0, Math.floor(rate * 0.6)), Math.floor(rate * 0.6));
    return [
      ["AHH", voice(0.9, 150, 118, AH)],
      ["OUH", voice(0.8, 160, 130, OO)],
      ["YEAH", voice(0.7, 175, 125, u => lerp(EE, EH, Math.min(1, u * 1.6)))],
      ["HEY", voice(0.45, 190, 170, EH, 0.05)],
      ["WAAH", voice(0.9, 120, 150, u => lerp(OO, AH, Math.min(1, u * 2)))],
      ["TON 1 KHZ", mix(1.8, t => Math.sin(2 * Math.PI * 1000 * t) * 0.5 * Math.min(1, t / 0.005))],
      ["TON GRAVE", mix(1.8, t => Math.sin(2 * Math.PI * 300 * t) * 0.6 * Math.min(1, t / 0.005))],
      ["BUZZ", mix(1.5, t => { const p = (110 * t) % 1; return (p * 2 - 1) * 0.35 * Math.min(1, t / 0.005); })],
      ["CAISSE", snare],
      ["BOUM-TCHAK", bb],
      ["CUIVRES", mix(0.7, t => { let v = 0; [233.08, 293.66, 349.23, 440].forEach(f => { for (let h = 1; h < 8; h++) v += Math.sin(2 * Math.PI * f * h * t) / h; }); return v * 0.07 * Math.min(1, t / 0.02) * Math.exp(-t / 0.3); })],
      ["BASSE 808", mix(1.6, t => Math.tanh(Math.sin(2 * Math.PI * (50 * t + 2 * (1 - Math.exp(-t / 0.05)))) * 1.8) * 0.8 * Math.exp(-t / 0.9))],
      ["PSSHH", mix(0.8, t => (Math.random() * 2 - 1) * 0.5 * Math.exp(-t / 0.25))],
      ["LASER", mix(0.6, t => Math.sin(2 * Math.PI * (2200 * t - 1600 * t * t / 1.2)) * 0.5 * Math.exp(-t / 0.4))]
    ].map(([n, d]) => ({ name: n, data: d }));
  }
  const SCR_LOC = [["loc-tony-schwartz", "Old auto horns", 0, "KLAXONS"], ["loc-tony-schwartz", "Announcer - Process", 0, "SPEAKER"], ["loc-tony-schwartz", "Words & tone", 0, "MOTS"], ["loc-tony-schwartz", "How do you read?", 0, "HOW DO YOU READ"], ["loc-tony-schwartz", "It's a boy", 0, "IT'S A BOY"], ["loc-tony-schwartz", "Mothers calling children", 0, "APPELS"], ["loc-tony-schwartz", "Instant information", 0, "INFO"], ["loc-jukebox-popular", "Army bugle calls", 0, "CLAIRON"], ["loc-tony-schwartz", "Taxi to Harlem", 0, "TAXI"], ["loc-tony-schwartz", "Playground", 0, "RÉCRÉ"]];
  async function scrCrate() {
    if (crate) return crate;
    if (!SCR.crate) { try { SCR.crate = await (await fetch("crate/crate.json")).json(); } catch (e) { SCR.crate = null; } }
    return SCR.crate;
  }
  async function scrFetch(url) {
    let buf = clipCache.get(url);
    if (!buf) { const ab = await (await fetch(url)).arrayBuffer(); buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)); clipCache.set(url, buf); if (clipCache.size > 6) clipCache.delete(clipCache.keys().next().value); }
    return buf;
  }
  const scrBufOf = (data, rate) => { const b = ctx.createBuffer(1, data.length, rate); b.copyToChannel(data, 0); return b; };
  async function scrList() {
    const s = SCR.src;
    if (s === "bank") {
      if (!SCR.bank) SCR.bank = scrSynth(sr).map(x => ({ name: x.name, get: async () => scrBufOf(x.data, sr) }));
      const cr = await scrCrate(), loc = [];
      if (cr) SCR_LOC.forEach(([cid, title, ci, nm]) => { const c = cr.collections.find(x => x.id === cid), it = c && c.items.find(x => x.t === title); if (it && it.c[ci]) loc.push({ name: nm + " (voix LoC)", get: () => scrFetch(cr.base + cid + "/" + it.c[ci][0] + ".wav") }); });
      return SCR.bank.concat(loc);
    }
    if (s === "voix") {
      const cr = await scrCrate(); if (!cr) return [];
      const c = cr.collections.find(x => x.id === "loc-tony-schwartz"), out = [];
      c.items.forEach(it => it.c.forEach((cc, j) => out.push({ name: `${it.t} · ${cc[1]}`, get: () => scrFetch(cr.base + c.id + "/" + cc[0] + ".wav") })));
      return out;
    }
    if (s === "pad") return buffers.map((b, i) => b ? { name: `PAD ${i + 1} · ${(names[i] || "").toUpperCase()}`, get: async () => b } : null).filter(Boolean);
    if (s === "chop") { if (!clip) return []; return chops.map((_, i) => ({ name: `CHOP ${i + 1} · ${clip.title}`, get: async () => { const [a, b] = chopRange(i), n = Math.max(1, b - a), o = ctx.createBuffer(clip.buf.numberOfChannels, n, clip.buf.sampleRate); for (let c = 0; c < o.numberOfChannels; c++) o.copyToChannel(clip.buf.getChannelData(c).subarray(a, b), c); return o; } })); }
    if (s === "piste") return LP.layers.filter(l => l.buf).map((l, i) => ({ name: `PISTE ${i + 1} · bank ${SEQ_N[SQ.cur]}`, get: async () => l.buf }));
    if (s === "mine") { try { SCR.mine = (await DB.all("scratch")).sort((a, b) => a.created - b.created); } catch (e) { SCR.mine = []; } return SCR.mine.map(m => ({ name: m.name, get: async () => unpackBuf(m.buf) })); }
    return [];
  }
  async function scrPick(delta, abs) {
    if (!ctx) return;
    const tok = ++SCR.loading;
    const list = await scrList();
    if (tok !== SCR.loading) return;
    if (!list.length) { $("scrName").textContent = { chop: "aucun chop : passez par DIGGING", piste: "aucune piste dans cette bank", mine: "aucun son : IMPORTER", voix: "bac hors ligne" }[SCR.src] || "vide"; return; }
    SCR.idx = abs !== undefined ? ((abs % list.length) + list.length) % list.length : ((SCR.idx + delta) % list.length + list.length) % list.length;
    const e = list[SCR.idx];
    $("scrName").textContent = "on pose le disque…";
    try { const b = await e.get(); if (tok !== SCR.loading) return; scrLoad(b, e.name); }
    catch (err) { $("scrName").textContent = "chargement impossible"; }
    store.set("scr", { src: SCR.src, idx: SCR.idx });
  }
  function scrLoad(buf, name) {
    if (!buf || !SCR.node) return;
    const bsr = buf.sampleRate, n0 = Math.min(buf.length, Math.floor(bsr * 12)), N = Math.max(n0, Math.ceil(bsr * SCR_REV));
    const L = new Float32Array(N), R = new Float32Array(N);
    L.set(buf.getChannelData(0).subarray(0, n0)); R.set((buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).subarray(0, n0));
    let pk = 0; for (let i = 0; i < n0; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    let on = 0; for (; on < n0; on++) if (Math.max(Math.abs(L[on]), Math.abs(R[on])) > pk * 0.15) break;
    SCR.cue0 = SCR.cue = Math.max(0, on - Math.floor(bsr * 0.004)); SCR.N = N; SCR.bsr = bsr; SCR.name = name;
    const mem = scrCueMem.get(name); SCR.cues = mem ? mem.cues.slice() : [null, null, null, null]; SCR.cueIdx = mem ? mem.idx : -1;
    if (SCR.cueIdx >= 0 && SCR.cues[SCR.cueIdx] !== null) SCR.cue = SCR.cues[SCR.cueIdx];
    drawScrCues();
    SCR.node.port.postMessage({ type: "buf", l: L, r: R, cue: SCR.cue }, [L.buffer, R.buffer]);
    SCR.rep = { pos: SCR.cue, vel: 0, t: performance.now() };
    scrApply();
    $("scrName").textContent = name;
    lcd("lcdPad", "DISQUE", name);
  }
  async function scrInit() {
    if (SCR.node) return true;
    if (!ctx) return false;
    if (!hasWorklet) { lcd("lcdPad", "SCRATCH", "ce navigateur est trop ancien"); return false; }
    SCR.node = new AudioWorkletNode(ctx, "nomad-scratch", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    SCR.filt = ctx.createBiquadFilter(); SCR.filt.type = "lowpass"; SCR.filt.frequency.value = 20000;
    SCR.out = ctx.createGain();
    SCR.node.connect(SCR.filt); SCR.filt.connect(SCR.out); SCR.out.connect(liveBus);
    SCR.node.port.onmessage = e => { const m = e.data; if (!SCR.hand) SCR.rep = { pos: m.pos, vel: m.vel, t: performance.now() }; if (m.phEnd) scrPhDone(); };
    scrApply(); scrGate(true);
    const st = store.get("scr", { src: "bank", idx: 0 });
    SCR.src = SCR_SRCS.some(x => x[0] === st.src) ? st.src : "bank"; drawScrSrc();
    await scrPick(0, st.idx || 0);
    return true;
  }
  const scrRate = () => (SCR.speed === 45 ? 1.35 : 1) * (1 + SCR.pitch / 100) * Math.pow(2, (SCR.semi || 0) / 12) * SCR.bsr / sr;
  function scrApply() {
    if (!SCR.node) return;
    const v = knobVals.scratch, r = scrRate(), ts = 0.03 + v[3] * v[3] * 1.5, tb = 0.05 + v[4] * v[4] * 3, t = ctx.currentTime;
    SCR.node.port.postMessage({ type: "rate", rate: r });
    SCR.node.port.postMessage({ type: "times", up: r / (ts * sr), dn: r / (tb * sr) });
    SCR.out.gain.setTargetAtTime(v[0] * 1.2, t, 0.02);
    const f = v[2];
    if (Math.abs(f - 0.5) < 0.03) { SCR.filt.type = "lowpass"; SCR.filt.frequency.setTargetAtTime(20000, t, 0.02); SCR.filt.Q.value = 0.7; }
    else if (f < 0.5) { SCR.filt.type = "lowpass"; SCR.filt.frequency.setTargetAtTime(150 * Math.pow(120, f / 0.5), t, 0.02); SCR.filt.Q.value = 2; }
    else { SCR.filt.type = "highpass"; SCR.filt.frequency.setTargetAtTime(30 * Math.pow(130, (f - 0.5) / 0.5), t, 0.02); SCR.filt.Q.value = 2; }
  }
  const scrZoneW = () => 0.05 + knobVals.scratch[5] * 0.3;
  const scrFaderOpen = () => SCR.ham ? SCR.fader > scrZoneW() : SCR.fader < 1 - scrZoneW();
  function scrGate(force) {
    const g = (SCR.padCut || SCR.btnCut) ? false : (SCR.padOpen || SCR.btnOpen) ? true : scrFaderOpen();
    drawScrFader();
    if (g === SCR.gate && !force) return;
    SCR.gate = g;
    if (SCR.node) SCR.node.port.postMessage({ type: "gate", open: g });
    if (g && ctx) onFirstNote(ctx.currentTime);
  }
  function drawScrFader() {
    const el = $("scrFader"); if (!el) return;
    const z = scrZoneW() * 100;
    $("scrZone").style.cssText = SCR.ham ? `left:0;width:${z}%` : `right:0;width:${z}%`;
    $("scrCap").style.left = `calc(16px + ${SCR.fader} * (100% - 32px))`;
    el.classList.toggle("open", SCR.gate !== false);
    el.setAttribute("aria-valuenow", Math.round(SCR.fader * 100));
  }
  function scrPosNow() {
    const r = SCR.rep;
    if (SCR.hand) return SCR.hand.pos;
    return r.pos + r.vel * Math.min(0.05, (performance.now() - r.t) / 1000) * sr;
  }
  function scrMotor(on) {
    if (!SCR.node) return;
    SCR.motor = on === undefined ? !SCR.motor : on;
    SCR.node.port.postMessage({ type: "motor", on: SCR.motor });
    $("scrStart").textContent = SCR.motor ? "■ STOP" : "▶ START";
    $("scrStart").classList.toggle("on", SCR.motor);
    if (SCR.motor) onFirstNote(ctx.currentTime);
  }
  function scrSetPitch(p) { SCR.pitch = Math.max(-10, Math.min(10, Math.round(p * 10) / 10)); $("scrPitch").value = SCR.pitch; $("scrPitchV").textContent = (SCR.pitch > 0 ? "+" : "") + SCR.pitch.toFixed(1) + " %"; $("scrQuartz").classList.toggle("on", SCR.pitch === 0); knobVals.scratch[1] = (SCR.pitch + 10) / 20; scrApply(); }
  function scrKey(note) {
    SCR.semi = note === null ? null : note - 60;
    $("scrKey").textContent = SCR.semi === null ? "NOTE : —" : "NOTE : " + NN[((note % 12) + 12) % 12] + (SCR.semi > 0 ? " +" : " ") + (SCR.semi || "");
    scrApply();
    if (SCR.semi !== null) lcd("lcdPad", "DISQUE", `transposé de ${SCR.semi > 0 ? "+" : ""}${SCR.semi} demi-tons`);
  }
  function scrPhrase(i) {
    if (!SCR.node || !SCR.N) return;
    const [nm, rep, segs] = SCR_PH[i], step = 60 / curBpm() / 4 * sr, srr = SCR.bsr / sr;
    const nowF = Math.round(ctx.currentTime * sr) + 256;
    let at = nowF;
    if (LP.t0F !== null && LP.layers.length) at = LP.t0F + Math.ceil((nowF - LP.t0F) / step) * step;
    const p = scrPosNow(), base = SCR.phMode === "here" ? p : SCR.cue + Math.round((p - SCR.cue) / SCR.N) * SCR.N;
    const all = []; for (let k = 0; k < rep; k++) segs.forEach(([n, a, g]) => all.push({ d: Math.max(64, Math.round(n * step)), a: a * srr, g }));
    SCR.node.port.postMessage({ type: "phrase", at: Math.round(at), base, segs: all, loop: true });
    SCR.ph = i; drawScrPh();
    onFirstNote(at / sr);
    lcd("lcdPad", "PHRASE", `${nm} · ${Math.round(curBpm())} BPM`);
  }
  function scrPhraseStop(i) { if (SCR.ph !== i || !SCR.node) return; SCR.node.port.postMessage({ type: "stopph" }); SCR.ph = -1; drawScrPh(); }
  function scrPhDone() { SCR.ph = -1; drawScrPh(); }
  // Pads AVANT / ARRIÈRE : une main virtuelle pousse le disque tant que le pad est tenu (vitesse selon la frappe)
  const SCRP = { f: 0, b: 0, last: 0, rel: null };
  function scrPush(dir, down, vel) {
    if (!SCR.node || !SCR.N) return;
    const k = dir > 0 ? "f" : "b";
    SCRP[k] = down ? 0.5 + 2.2 * (vel || 0.7) : 0;
    if (down) SCRP.last = dir;
    clearTimeout(SCRP.rel);
    const srr = SCR.bsr / sr, other = SCRP.last > 0 ? SCRP.f : SCRP.b;
    let v = 0;
    if (other) v = SCRP.last * other; else if (SCRP.f) v = SCRP.f; else if (SCRP.b) v = -SCRP.b;
    SCR.node.port.postMessage({ type: "push", v: v * srr });
    if (down) onFirstNote(ctx.currentTime);
    // pad relâché : si le moteur tourne, le disque repart tout de suite ; sinon la main reste posée un instant
    if (!SCRP.f && !SCRP.b) {
      if (SCR.motor) SCR.node.port.postMessage({ type: "push", v: null });
      else SCRP.rel = setTimeout(() => { if (!SCRP.f && !SCRP.b) SCR.node.port.postMessage({ type: "push", v: null }); }, 400);
    }
  }
  // Potard MAIN : tourner le potard déplace le disque comme une main (course d'un demi-tour)
  const SCRK = { on: false, anchor: 0, t: 0, end: null };
  function scrHandKnob(v) {
    if (!SCR.node || !SCR.N || SCR.hand) return;
    const now = performance.now(), range = SCR_REV / 2 * SCR.bsr;
    if (!SCRK.on) { SCRK.on = true; SCRK.anchor = scrPosNow() - v * range; SCRK.t = now; SCR.node.port.postMessage({ type: "hand", on: true }); onFirstNote(ctx.currentTime); }
    const dt = Math.max(4, now - SCRK.t); SCRK.t = now;
    SCR.node.port.postMessage({ type: "tgt", pos: SCRK.anchor + v * range, dur: Math.round(Math.min(0.04, dt / 1000) * sr) });
    clearTimeout(SCRK.end);
    SCRK.end = setTimeout(() => { SCRK.on = false; if (!SCR.hand) SCR.node.port.postMessage({ type: "hand", on: false }); }, 450);
  }
  function drawScrPh() { [...$("scrPh").children].forEach((b, j) => b.classList.toggle("on", j === SCR.ph)); }
  function drawScrSrc() { [...$("scrSrc").children].forEach(b => b.classList.toggle("on", b.dataset.s === SCR.src)); }
  // Points de repère (4 par son, gardés pour chaque son pendant la session) et mode des phrases
  const SCR_CUEC = ["#d92b2f", "#22a35a", "#ece3d3", "#e0a63a"];
  const scrCueMem = new Map();
  SCR.cues = [null, null, null, null]; SCR.cueIdx = -1; SCR.phMode = store.get("scrPhMode", "cue");
  const scrWrap = p => ((Math.round(p) % SCR.N) + SCR.N) % SCR.N;
  function scrCueTap(i) {
    if (!SCR.N) return;
    if (SCR.cues[i] === null) { SCR.cues[i] = scrWrap(scrPosNow()); lcd("lcdPad", "REPÈRE", `${i + 1} posé ici`); }
    else { SCR.cue = SCR.cues[i]; scrToCue(); lcd("lcdPad", "REPÈRE", `${i + 1} : le disque y retourne`); }
    SCR.cue = SCR.cues[i]; SCR.cueIdx = i;
    scrCueMem.set(SCR.name, { cues: SCR.cues.slice(), idx: i });
    drawScrCues();
  }
  function scrCueClear(i) {
    SCR.cues[i] = null;
    if (SCR.cueIdx === i) { SCR.cueIdx = -1; SCR.cue = SCR.cue0; }
    scrCueMem.set(SCR.name, { cues: SCR.cues.slice(), idx: SCR.cueIdx });
    lcd("lcdPad", "REPÈRE", `${i + 1} effacé`); drawScrCues();
  }
  function drawScrCues() {
    const el = $("scrCues"); if (!el) return;
    [...el.querySelectorAll(".cue")].forEach((b, i) => { b.classList.toggle("set", SCR.cues[i] !== null); b.classList.toggle("on", SCR.cueIdx === i); });
    $("scrPhMode").textContent = SCR.phMode === "cue" ? "PHRASES : REPÈRE" : "PHRASES : ICI";
  }
  function scrToCue() { if (!SCR.node || !SCR.N) return; const p = scrPosNow(), base = SCR.cue + Math.round((p - SCR.cue) / SCR.N) * SCR.N; SCR.node.port.postMessage({ type: "seek", pos: base }); SCR.rep = { pos: base, vel: SCR.rep.vel, t: performance.now() }; }
  // Pads de l'Akai dans SCRATCH (tous tenus) : 1 arrière, 5 avant, 2 ouvre, 3 coupe, 4-6-7-8 et 9-10 phrases
  // Pads de l'Akai dans SCRATCH (tenus) — banque A : 1 arrière, 5 avant, 2 ouvre, 3 coupe, 4 start/stop, 6-7-8 CUE 1 à 3 ;
  // banque B : 9-10-11 et 13-14-15 phrases, 12 repère précédent, 16 repère suivant
  const SCR_PADPH = { 8: 0, 9: 1, 10: 2, 12: 3, 13: 4, 14: 5 }, SCR_PADCUE = { 5: 0, 6: 1, 7: 2 };
  const scrPadT = {};
  function scrCueStep(d) {
    const set = SCR.cues.map((c, i) => c === null ? -1 : i).filter(i => i >= 0);
    if (!set.length) { lcd("lcdPad", "REPÈRE", "aucun repère posé"); return; }
    const k = set.indexOf(SCR.cueIdx), next = set[k < 0 ? (d > 0 ? 0 : set.length - 1) : (k + d + set.length) % set.length];
    scrCueTap(next);
  }
  function scrPad(i, down, vel) {
    if (!SCR.node) { if (down) scrInit(); return; }
    if (SCR_PADCUE[i] !== undefined) {
      // CUE : frappe = poser / rappeler, tenu plus d'une demi-seconde = effacer
      const c = SCR_PADCUE[i];
      if (down) { scrPadT[c] = { long: false, t: setTimeout(() => { scrPadT[c].long = true; if (SCR.cues[c] !== null) scrCueClear(c); }, 650) }; }
      else if (scrPadT[c]) { clearTimeout(scrPadT[c].t); if (!scrPadT[c].long) scrCueTap(c); delete scrPadT[c]; }
      return;
    }
    if (i === 0 || i === 4) { scrPush(i === 4 ? 1 : -1, down, vel); return; }
    if (i === 1) { SCR.padOpen = down; scrGate(); return; }
    if (i === 2) { SCR.padCut = down; scrGate(); return; }
    if (i in SCR_PADPH) { if (down) scrPhrase(SCR_PADPH[i]); else scrPhraseStop(SCR_PADPH[i]); return; }
    if (!down) return;
    if (i === 3) scrMotor();
    else if (i === 11) scrCueStep(-1);
    else if (i === 15) scrCueStep(1);
  }
  function scrKnob(k) {
    const v = knobVals.scratch[k];
    if (k === 1) { scrSetPitch((v - 0.5) * 20); return; }
    if (k === 7) { SCR.fader = v; scrGate(); return; }
    if (k === 6) { scrHandKnob(v); return; }
    const inp = $("scrS" + k); if (inp) inp.value = v;
    scrApply(); if (k === 5) scrGate();
    lcd("lcdPad", "SCRATCH", `${KNOB_LABELS.scratch[k].toLowerCase()} ${Math.round(v * 100)} %`);
  }
  // Interface
  SCR_PH.forEach(([nm], i) => { const b = document.createElement("button"); b.className = "btn hold"; b.type = "button"; b.textContent = nm; b.addEventListener("pointerdown", async e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b._held = true; if (await scrInit() && b._held) scrPhrase(i); }); ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => b.addEventListener(ev, () => { b._held = false; scrPhraseStop(i); })); $("scrPh").appendChild(b); });
  SCR_SRCS.forEach(([id, nm]) => { const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = nm; b.dataset.s = id; b.addEventListener("click", async () => { SCR.src = id; drawScrSrc(); if (await scrInit()) scrPick(0, 0); }); $("scrSrc").appendChild(b); });
  [[0, "VOLUME"], [2, "FILTRE"], [3, "DÉMARRAGE"], [4, "FREINAGE"], [5, "COUPURE"]].forEach(([k, nm]) => {
    const l = document.createElement("label"); l.htmlFor = "scrS" + k; l.textContent = nm;
    const r = document.createElement("input"); r.type = "range"; r.id = "scrS" + k; r.min = 0; r.max = 1; r.step = 0.01; r.value = knobVals.scratch[k];
    r.addEventListener("input", () => { knobVals.scratch[k] = +r.value; scrKnob(k); });
    $("scrSet").append(l, r);
  });
  $("scrStart").addEventListener("click", async () => { if (await scrInit()) scrMotor(); });
  $("scrSpeed").addEventListener("click", () => { SCR.speed = SCR.speed === 33 ? 45 : 33; $("scrSpeed").textContent = SCR.speed; scrApply(); });
  $("scrQuartz").addEventListener("click", () => scrSetPitch(0));
  $("scrPitch").addEventListener("input", e => scrSetPitch(+e.target.value));
  $("scrHam").addEventListener("click", () => { SCR.ham = !SCR.ham; SCR.fader = 1 - SCR.fader; $("scrHam").textContent = "HAMSTER : " + (SCR.ham ? "OUI" : "NON"); $("scrHam").classList.toggle("on", SCR.ham); scrGate(); });
  [["scrOpen", "btnOpen"], ["scrCut", "btnCut"]].forEach(([id, key]) => {
    const b = $(id);
    b.addEventListener("pointerdown", async e => { e.preventDefault(); b.setPointerCapture(e.pointerId); await scrInit(); SCR[key] = true; b.classList.add("holding"); scrGate(); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => b.addEventListener(ev, () => { if (!SCR[key]) return; SCR[key] = false; b.classList.remove("holding"); scrGate(); }));
  });
  $("scrPrev").addEventListener("click", () => scrPick(-1));
  $("scrNext").addEventListener("click", () => scrPick(1));
  $("scrRand").addEventListener("click", async () => { if (!(await scrInit())) return; const n = (await scrList()).length; if (n) scrPick(0, Math.floor(Math.random() * n)); });
  (() => {
    const el = $("scrCues");
    for (let i = 0; i < 4; i++) {
      const b = document.createElement("button"); b.className = "btn cue"; b.type = "button"; b.textContent = "CUE " + (i + 1); b.style.setProperty("--cc", SCR_CUEC[i]);
      let t = null, long = false;
      b.addEventListener("pointerdown", async e => { e.preventDefault(); long = false; if (!(await scrInit())) return; clearTimeout(t); t = setTimeout(() => { long = true; if (SCR.cues[i] !== null) scrCueClear(i); }, 650); });
      b.addEventListener("pointerup", () => { clearTimeout(t); if (!long) scrCueTap(i); });
      b.addEventListener("pointercancel", () => clearTimeout(t));
      el.appendChild(b);
    }
    const m = document.createElement("button"); m.className = "btn"; m.type = "button"; m.id = "scrPhMode";
    m.addEventListener("pointerdown", e => { e.preventDefault(); SCR.phMode = SCR.phMode === "cue" ? "here" : "cue"; store.set("scrPhMode", SCR.phMode); drawScrCues(); lcd("lcdPad", "PHRASES", SCR.phMode === "cue" ? "partent du repère actif" : "partent de là où est le disque"); });
    el.appendChild(m);
    drawScrCues();
  })();
  $("scrKey").addEventListener("click", () => scrKey(null));
  $("scrImp").addEventListener("click", () => $("scrFile").click());
  $("scrFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f || !(await scrInit())) return;
    try {
      const ab = await f.arrayBuffer(), buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
      const n = Math.min(buf.length, Math.floor(buf.sampleRate * 12)), cut = ctx.createBuffer(buf.numberOfChannels, n, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) cut.copyToChannel(buf.getChannelData(c).subarray(0, n), c);
      const name = f.name.replace(/\.[^.]+$/, "").toUpperCase().slice(0, 28);
      await DB.put("scratch", { id: "s" + Date.now().toString(36), name, buf: packBuf(cut), created: Date.now() });
      SCR.src = "mine"; drawScrSrc();
      const list = await scrList(); scrPick(0, list.length - 1);
    } catch (err) { lcd("lcdPad", "IMPORT", "fichier illisible"); }
  });
  // Fader : glisser du doigt, la zone rouge coupe
  (() => {
    const el = $("scrFader");
    const set = e => { const r = el.getBoundingClientRect(); SCR.fader = Math.max(0, Math.min(1, (e.clientX - r.left - 16) / (r.width - 32))); knobVals.scratch[7] = SCR.fader; scrGate(); };
    el.addEventListener("pointerdown", async e => { e.preventDefault(); el.setPointerCapture(e.pointerId); SCR.faderDrag = true; await scrInit(); set(e); });
    el.addEventListener("pointermove", e => { if (el.hasPointerCapture(e.pointerId)) set(e); });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => el.addEventListener(ev, () => { SCR.faderDrag = false; }));
  })();
  // Le disque : la main posée arrête le disque et le fait tourner
  const scv = $("scrCanvas"), scg = scv.getContext("2d"), slc = $("scrLcd"), slg = slc.getContext("2d");
  const scrAng = (e, r) => Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
  scv.addEventListener("pointerdown", async e => {
    e.preventDefault();
    if (SCR.hand || !(await scrInit()) || !SCR.N) return;
    const r = scv.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    if (Math.hypot(dx, dy) > r.width * 0.49) return;
    scv.setPointerCapture(e.pointerId);
    const p0 = scrPosNow(), a = scrAng(e, r);
    SCR.hand = { id: e.pointerId, last: a, acc: 0, ap: 0, p0, pos: p0, t: performance.now(), v: 0, moved: performance.now() };
    SCR.node.port.postMessage({ type: "hand", on: true });
    onFirstNote(ctx.currentTime);
  });
  scv.addEventListener("pointermove", e => {
    const h = SCR.hand; if (!h || e.pointerId !== h.id) return;
    const r = scv.getBoundingClientRect(), evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(ev => { const a = scrAng(ev, r); let d = a - h.last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; h.last = a; h.acc += d; });
    // zone morte : le tremblement du doigt immobile ne fait pas grésiller le son
    const DB = 0.004; if (h.acc - h.ap > DB) h.ap = h.acc - DB; else if (h.ap - h.acc > DB) h.ap = h.acc + DB; else return;
    const now = performance.now(), pos = h.p0 + h.ap / (2 * Math.PI) * SCR_REV * SCR.bsr, dt = Math.max(4, now - h.t);
    h.v = pos - h.pos; h.pos = pos; h.t = now; h.moved = now;
    SCR.node.port.postMessage({ type: "tgt", pos, dur: Math.round(Math.min(0.025, dt / 1000) * sr) });
  });
  const scrRelease = e => {
    const h = SCR.hand; if (!h || e.pointerId !== h.id) return;
    SCR.node.port.postMessage({ type: "hand", on: false });
    SCR.rep = { pos: h.pos, vel: 0, t: performance.now() };
    SCR.hand = null;
  };
  ["pointerup", "pointercancel"].forEach(ev => scv.addEventListener(ev, scrRelease));
  // Pendant le jeu, la page ne bouge pas : ni défilement, ni zoom, ni sélection, même avec deux doigts
  const scrBusy = () => !!(SCR.hand || SCR.btnOpen || SCR.btnCut || SCR.faderDrag);
  document.addEventListener("touchmove", e => { if (tab === "scratch" && (scrBusy() || (e.target.closest && e.target.closest(".scrplay")))) e.preventDefault(); }, { passive: false });
  document.querySelectorAll("#view-scratch .scrplay").forEach(el => el.addEventListener("touchstart", e => { if (e.target.closest("#scrHam, #scrStart, #scrSpeed, #scrQuartz, #scrPitch")) return; e.preventDefault(); }, { passive: false }));
  // L'écran vert enregistre le scratch : un cycle de la boucle, sur une nouvelle piste du looper
  function scrRecTap() {
    if (!ctx || !SCR.node) return;
    if (LP.t0F === null || !LP.Lf) { recPress(); lcd("lcdPad", "SCRATCH", "REC du looper : la première boucle part au premier son"); return; }
    if (SCR.rec) { SCR.rec = null; lcd("lcdPad", "SCRATCH", "enregistrement annulé"); return; }
    if (LP.layers.length >= MAX_LAYERS) { lcd("lcdPad", "SCRATCH", "6 pistes : libérez-en une dans le LOOPER"); return; }
    if (!SCR.cap) {
      SCR.cap = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
      SCR.cap.port.onmessage = e => scrCapIn(e.data);
      const z = ctx.createGain(); z.gain.value = 0; SCR.out.connect(SCR.cap); SCR.cap.connect(z); z.connect(ctx.destination);
    }
    const nowF = Math.round(ctx.currentTime * sr), n = Math.ceil((nowF + 512 - LP.t0F) / LP.Lf);
    SCR.rec = { sF: LP.t0F + n * LP.Lf + compF(), len: LP.Lf, chunks: [] };
    lcd("lcdPad", "SCRATCH", "REC armé · départ au début de la boucle");
  }
  function scrCapIn(d) {
    const r = SCR.rec; if (!r) return;
    const n = d.l.length;
    if (d.f + n <= r.sF) return;
    r.chunks.push(d);
    if (d.f + n < r.sF + r.len) return;
    const b = ctx.createBuffer(2, r.len, sr), L = b.getChannelData(0), R = b.getChannelData(1);
    r.chunks.forEach(c => { for (let i = 0; i < c.l.length; i++) { const j = c.f + i - r.sF; if (j >= 0 && j < r.len) { L[j] = c.l[i]; R[j] = c.r[i]; } } });
    SCR.rec = null;
    addLayer(b, 1, 0);
    lcd("lcdPad", "SCRATCH", `scratch posé sur la piste ${LP.layers.length}`);
  }
  slc.addEventListener("pointerdown", async e => { e.preventDefault(); if (await scrInit()) scrRecTap(); });
  // Dessin : plateau alu à points stroboscopiques, vinyle, rond central, bras ; écran vert
  let scrStatic = null;
  function scrBuildStatic(W) {
    const c = document.createElement("canvas"); c.width = c.height = W; const g = c.getContext("2d");
    const lg = g.createLinearGradient(0, 0, W, W); lg.addColorStop(0, "#cfd2d6"); lg.addColorStop(1, "#a7aaaf"); g.fillStyle = lg; g.fillRect(0, 0, W, W);
    g.globalAlpha = 0.18; for (let y = 0; y < W; y += 3) { g.fillStyle = y % 6 ? "#ffffff" : "#7d8086"; g.fillRect(0, y, W, 1); } g.globalAlpha = 1;
    const cx = W / 2, R = W * 0.485;
    g.beginPath(); g.arc(cx, cx, R, 0, 7); g.fillStyle = "#8c8f94"; g.fill();
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx, cx, R - W * (0.006 + k * 0.006), 0, 7); g.strokeStyle = k % 2 ? "#c9ccd1" : "#6f7277"; g.lineWidth = W * 0.002; g.stroke(); }
    g.beginPath(); g.arc(cx, cx, R * 0.9, 0, 7); g.fillStyle = "#0b0b0d"; g.fill();
    for (let r = R * 0.9; r > R * 0.37; r -= W * 0.0045) { g.beginPath(); g.arc(cx, cx, r, 0, 7); g.strokeStyle = (Math.round(r) % 3) ? "#141417" : "#1c1c20"; g.lineWidth = W * 0.0018; g.stroke(); }
    g.beginPath(); g.arc(cx, cx, R * 0.36, 0, 7); g.fillStyle = "#101012"; g.fill();
    const top = document.createElement("canvas"); top.width = top.height = W; const t = top.getContext("2d");
    t.save(); t.beginPath(); t.arc(cx, cx, R * 0.9, 0, 7); t.clip();
    [[-0.95, -0.55], [2.2, 2.6]].forEach(([a0, a1]) => { t.beginPath(); t.moveTo(cx, cx); t.arc(cx, cx, R * 0.9, a0, a1); t.closePath(); t.fillStyle = "rgba(255,255,255,0.07)"; t.fill(); });
    t.restore();
    // bras : socle en haut à droite, tête de lecture posée sur le bord du disque
    t.lineCap = "round";
    t.beginPath(); t.arc(W * 0.9, W * 0.1, W * 0.065, 0, 7); t.fillStyle = "#2a2b2e"; t.fill(); t.beginPath(); t.arc(W * 0.9, W * 0.1, W * 0.035, 0, 7); t.fillStyle = "#b8bbc0"; t.fill();
    t.beginPath(); t.moveTo(W * 0.9, W * 0.1); t.bezierCurveTo(W * 0.93, W * 0.4, W * 0.9, W * 0.55, W * 0.8, W * 0.7); t.strokeStyle = "#d9dce0"; t.lineWidth = W * 0.016; t.stroke();
    t.strokeStyle = "#7d8086"; t.lineWidth = W * 0.004; t.stroke();
    t.save(); t.translate(W * 0.8, W * 0.7); t.rotate(0.9); t.fillStyle = "#c9ccd1"; t.fillRect(-W * 0.02, -W * 0.012, W * 0.07, W * 0.03); t.fillStyle = "#d92b2f"; t.fillRect(W * 0.03, -W * 0.008, W * 0.018, W * 0.022); t.restore();
    t.beginPath(); t.arc(W * 0.955, W * 0.04, W * 0.022, 0, 7); t.fillStyle = "#1d1e20"; t.fill();
    // lampe stroboscopique rouge à gauche
    t.beginPath(); t.arc(W * 0.012, W * 0.62, W * 0.02, 0, 7); t.fillStyle = "rgba(255,40,40,.75)"; t.fill();
    return { base: c, top };
  }
  function drawScratch() {
    if (tab !== "scratch") { SCR.raf = 0; return; }
    SCR.raf = requestAnimationFrame(drawScratch);
    fitCanvas(scv); const W = scv.width; if (!W) return;
    if (!scrStatic || scrStatic.W !== W) { scrStatic = scrBuildStatic(W); scrStatic.W = W; }
    const h = SCR.hand;
    const pos = scrPosNow(), ang = pos / (SCR_REV * SCR.bsr) * 2 * Math.PI, cx = W / 2, R = W * 0.485;
    SCR.ang = ang;
    scg.drawImage(scrStatic.base, 0, 0);
    scg.save(); scg.translate(cx, cx); scg.rotate(ang);
    scg.fillStyle = "#e4e6e9"; const nd = 96; for (let k = 0; k < nd; k++) { const a = k / nd * 2 * Math.PI; scg.beginPath(); scg.arc(Math.cos(a) * R * 0.955, Math.sin(a) * R * 0.955, W * 0.0035, 0, 7); scg.fill(); }
    const NEEDLE = Math.atan2(0.2, 0.3), cueA = c => NEEDLE - c / (SCR_REV * SCR.bsr) * 2 * Math.PI;
    scg.save(); scg.rotate(cueA(SCR.cue)); scg.fillStyle = "rgba(255,255,255,.85)"; scg.fillRect(R * 0.36, -W * 0.004, R * 0.53, W * 0.008); scg.fillStyle = "#f1ece0"; scg.fillRect(R * 0.2, -W * 0.018, R * 0.14, W * 0.036); scg.restore();
    SCR.cues.forEach((c, i) => { if (c === null) return; const a = cueA(c); scg.beginPath(); scg.arc(Math.cos(a) * R * 0.87, Math.sin(a) * R * 0.87, W * 0.012, 0, 7); scg.fillStyle = SCR_CUEC[i]; scg.fill(); });
    scg.beginPath(); scg.arc(0, 0, R * 0.34, 0, 7); scg.fillStyle = "#d92b2f"; scg.fill();
    scg.fillStyle = "#fff"; scg.textAlign = "center"; scg.textBaseline = "middle";
    scg.font = `900 ${Math.round(W * 0.05)}px Archivo, "Arial Black", sans-serif`; scg.fillText("NOMAD", 0, -W * 0.035);
    scg.font = `700 ${Math.round(W * 0.026)}px Arimo, Arial, sans-serif`; scg.fillText((SCR.name || "").slice(0, 18), 0, W * 0.025);
    scg.fillText(SCR.speed === 45 ? "45 RPM" : "33⅓ RPM", 0, W * 0.06);
    scg.restore();
    scg.beginPath(); scg.arc(cx, cx, W * 0.012, 0, 7); scg.fillStyle = "#c9ccd1"; scg.fill();
    scg.drawImage(scrStatic.top, 0, 0);
    if (h) { scg.beginPath(); scg.arc(cx, cx, R * 0.9, 0, 7); scg.strokeStyle = "rgba(168,221,58,.6)"; scg.lineWidth = W * 0.008; scg.stroke(); }
    if (!SCR.gate) { scg.fillStyle = "rgba(217,43,47,.9)"; scg.font = `700 ${Math.round(W * 0.03)}px Arimo, Arial, sans-serif`; scg.textAlign = "left"; scg.fillText("COUPÉ", W * 0.03, W * 0.04); }
    drawScrLcd(ang);
  }
  function drawScrLcd(ang) {
    fitCanvas(slc); const w = slc.width, hh = slc.height; if (!w) return;
    const g = slg; g.fillStyle = "#a8dd3a"; g.fillRect(0, 0, w, hh);
    const ink = "#1f2a10", s = hh / 58; g.fillStyle = ink; g.strokeStyle = ink; g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.font = `700 ${Math.round(10 * s)}px Arimo, Arial, sans-serif`;
    g.fillText(SCR.motor ? "▶" : "❚❚", 6 * s, 15 * s); g.fillText("PITCH", 34 * s, 14 * s); if (SCR.pitch === 0) g.fillText("Q", 6 * s, 50 * s);
    g.font = `700 ${Math.round(12 * s)}px Arimo, Arial, sans-serif`; g.fillText(String(SCR.speed), 6 * s, 34 * s);
    g.font = `${Math.round(30 * s)}px VT323, monospace`; g.textAlign = "right";
    const pv = Math.abs(SCR.pitch).toFixed(1).padStart(4, "0");
    g.fillText((SCR.pitch < 0 ? "-" : SCR.pitch > 0 ? "+" : "") + pv, 122 * s, 48 * s);
    g.font = `700 ${Math.round(10 * s)}px Arimo, Arial, sans-serif`; g.fillText("%", 134 * s, 48 * s);
    const rec = SCR.rec, pend = LP.pending, nowF = ctx ? ctx.currentTime * sr : 0;
    let ringU = ((ang / (2 * Math.PI)) % 1 + 1) % 1, recTxt = "";
    if (rec) { if (nowF < rec.sF) { recTxt = "ARM"; } else { recTxt = "REC"; ringU = Math.min(0.999, (nowF - rec.sF) / rec.len); } }
    else if (pend && (pend.phase === "armed" || pend.phase === "rec" || pend.type === "layer")) recTxt = pend.phase === "armed" ? "ARM" : "REC";
    g.textAlign = "left"; g.font = `700 ${Math.round(9 * s)}px Arimo, Arial, sans-serif`;
    if (recTxt) { if (recTxt === "REC" || Math.floor(performance.now() / 300) % 2) { g.fillText("● " + recTxt, 78 * s, 14 * s); } }
    else { g.globalAlpha = 0.45; g.fillText("○ REC", 80 * s, 14 * s); g.globalAlpha = 1; }
    g.textAlign = "right";
    const rx = 132 * s, ry = 15 * s, rr = 9 * s, seg = Math.floor(ringU * 12);
    for (let k = 0; k < 12; k++) { const a = k / 12 * 2 * Math.PI - Math.PI / 2; g.globalAlpha = rec && nowF >= rec.sF ? (k <= seg ? 1 : 0.15) : (k - seg + 12) % 12 < 3 ? 1 : 0.15; g.lineWidth = 3 * s; g.beginPath(); g.arc(rx, ry, rr, a + 0.08, a + 2 * Math.PI / 12 - 0.08); g.stroke(); }
    g.globalAlpha = 1;
    if (SCR.semi !== null) { g.textAlign = "left"; g.font = `700 ${Math.round(9 * s)}px Arimo, Arial, sans-serif`; g.fillText("♪" + (SCR.semi > 0 ? "+" : "") + SCR.semi, 40 * s, 30 * s); }
  }
  function enterScratch() {
    drawScrSrc(); drawScrFader();
    if (!SCR.raf) SCR.raf = requestAnimationFrame(drawScratch);
    if (ctx) scrInit();
  }

