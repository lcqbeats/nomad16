  // ---------- Moteur audio ----------
  function makeDriveCurve(amount) { const n = 1024, c = new Float32Array(n), k = 1 + amount * 30; for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; }
  // Potards de PADS : tous propres au pad choisi (ou aux 16 pads si TOUS LES PADS est allumé)
  let allPads = false, knobHist = null;
  const curveCache = new Map();
  function driveCurve(a) { const q = Math.round(a * 20) / 20; if (!curveCache.has(q)) curveCache.set(q, makeDriveCurve(q)); return curveCache.get(q); }
  function syncPlayKnobs() {
    const p = padParams[selected];
    knobVals.play = [p.tone, p.echo, p.dirt, p.att, (p.tune + 24) / 48, p.decay, (p.pan + 1) / 2, p.level / 1.25];
    if (tab === "play") drawKnobs();
  }
  function applyPlayKnob(k) {
    const v = knobVals.play[k];
    if (!knobHist) knobHist = kitSnap();
    clearTimeout(applyPlayKnob.t);
    applyPlayKnob.t = setTimeout(() => { const b = knobHist, a = kitSnap(); knobHist = null; pushHist(allPads ? "réglage de tous les pads" : "réglage du pad", () => kitRestore(b), () => kitRestore(a)); }, 700);
    let txt = "";
    (allPads ? padParams : [padParams[selected]]).forEach(p => {
      if (k === 0) { p.tone = Math.abs(v - 0.5) < 0.03 ? 0.5 : v; txt = p.tone === 0.5 ? "filtre ouvert" : p.tone < 0.5 ? `filtre sourd ${Math.round((0.5 - v) * 200)} %` : `filtre fin ${Math.round((v - 0.5) * 200)} %`; }
      if (k === 1) { p.echo = v; txt = `écho ${Math.round(v * 100)} %`; }
      if (k === 2) { p.dirt = v; txt = `saleté ${Math.round(v * 100)} %`; }
      if (k === 3) { p.att = v; txt = `attaque ${Math.round(v * v * 1500)} ms`; }
      if (k === 4) { p.tune = Math.round(v * 48 - 24); txt = `tune ${p.tune > 0 ? "+" : ""}${p.tune}`; }
      if (k === 5) { p.decay = v; txt = `decay ${Math.round(v * 100)} %`; }
      if (k === 6) { p.pan = Math.round((v * 2 - 1) * 20) / 20; txt = `pan ${p.pan === 0 ? "centre" : (p.pan < 0 ? "G " : "D ") + Math.round(Math.abs(p.pan) * 100)}`; }
      if (k === 7) { p.level = v * 1.25; txt = `niveau ${Math.round(p.level * 100)} %`; }
    });
    const nm = allPads ? "TOUS LES PADS" : String(selected + 1).padStart(2, "0") + " " + (names[selected] || "").toUpperCase();
    lcd("lcdPad", "PAD", `${nm} · ${txt}`);
    if (!$("editor").hidden) drawEditor();
  }
  async function powerOn() {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    await ctx.resume();
    sr = ctx.sampleRate;
    liveIn = ctx.createGain();
    filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.Q.value = 2;
    drive = ctx.createWaveShaper(); drive.oversample = "2x";
    delay = ctx.createDelay(1); delay.delayTime.value = 60 / 92 * 0.75;
    delayFb = ctx.createGain(); delayWet = ctx.createGain();
    padOut = ctx.createGain();
    liveBus = ctx.createGain();
    loopBus = ctx.createGain();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    liveIn.connect(padOut);
    echoIn = ctx.createGain(); echoIn.connect(delay);
    delayFb.gain.value = 0.42; delayWet.gain.value = 0.7;
    delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayWet); delayWet.connect(padOut);
    padOut.gain.value = 0.85;
    // voies de la table de mixage : PADS, SONS, GUITARE (avant le looper), LOOPER, MASTER (après la chaîne SP)
    chPads = ctx.createGain(); chSons = ctx.createGain(); chGtr = ctx.createGain(); chMaster = ctx.createGain();
    padOut.connect(chPads); chPads.connect(liveBus); chSons.connect(liveBus); chGtr.connect(liveBus);
    liveBus.connect(master); loopBus.connect(master);
    fxOut = comp;
    spIn = ctx.createGain(); comp.connect(spIn);
    buildSp(spIn, chMaster);
    mixOut = chMaster; chMaster.connect(ctx.destination);
    applyMix();
    synthBuffers = render(sr).map(data => { const b = ctx.createBuffer(1, data.length, sr); b.copyToChannel(data, 0); return b; });
    buffers = synthBuffers.slice();
    loopBus.gain.value = knobVals.loops[6];
    await setupCapture();
    buildFx();
    buildGuitar();
    $("power").hidden = true;
    setInterval(looperTick, 15);
    requestAnimationFrame(draw);
    updateLatInfo();
    await loadKitIndex();
    const saved = store.get("kit", "boombap");
    loadKit(kitIndex.some(k => k.id === saved) ? saved : "synth");
    enterSons();
    setTimeout(() => { if (Date.now() - store.get("offKits", 0) > 7 * 864e5) warmOffline(false); }, 5000);
  }
  $("powerBtn").addEventListener("click", () => powerOn().catch(e => { $("power").querySelector("p").textContent = "Le son n'a pas pu démarrer : " + e.message; }));

  const revCache = new WeakMap();
  function reversed(b) {
    if (revCache.has(b)) return revCache.get(b);
    const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) { const s = b.getChannelData(c), d = r.getChannelData(c), n = s.length; for (let k = 0; k < n; k++) d[k] = s[n - 1 - k]; }
    revCache.set(b, r); return r;
  }
  // Journal des notes jouées (pads et clavier) : chaque piste du looper garde les siennes, pour l'export .mid vers la MPC
  const NOTELOG = [];
  function logNote(kind, n, v, t) { const e = { t, kind, n, v, off: null }; NOTELOG.push(e); if (NOTELOG.length > 4000) NOTELOG.splice(0, 1000); return e; }
  function notesIn(startF, lenF) {
    const a = startF / sr, b = (startF + lenF) / sr;
    return NOTELOG.filter(e => e.t >= a && e.t < b).map(e => ({ at: Math.round(e.t * sr - startF), dur: Math.max(64, Math.round(((e.off ?? e.t + 0.1) - e.t) * sr)), kind: e.kind, n: e.n, v: Math.max(1, Math.min(127, Math.round(e.v * 127))) }));
  }
  // notes d'une piste placées dans un cycle de L échantillons, comme le son de la piste (mêmes répétitions, même décalage)
  function spreadNotes(l, L) {
    const LkL = l.k * LP.Lf, off = l.m * LP.Lf, out = [];
    (l.notes || []).forEach(nt => { const p0 = (((nt.at + off) % LkL) + LkL) % LkL; for (let p = p0; p < L; p += LkL) out.push({ ...nt, at: p }); });
    return out;
  }
  function voice(i, vel, rate, when) {
    const now = ctx.currentTime, t = Math.max(now, when || now);
    notesAny.push(t); if (notesAny.length > 32) notesAny.shift();
    if (calib) { calib.taps.push(t); return t; }
    if (rate === 1) logNote("pad", i, vel, t);
    if (!buffers[i]) return t;
    const pp = padParams[i];
    // Chaque pad coupe sa propre voix ; groupes de mute ; dans un kit de chops, tous les pads se coupent entre eux.
    const choke = j => { const v = lastVoice[j]; if (!v) return; v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.setTargetAtTime(0, t, 0.004); try { v.src.stop(t + 0.04); } catch (e) {} lastVoice[j] = null; };
    if (kitChoke) lastVoice.forEach((_, j) => choke(j));
    else { choke(i); if (pp.choke) padParams.forEach((q, j) => { if (j !== i && q.choke === pp.choke) choke(j); }); }
    const base = buffers[i], ts = pp.fitBeats && pp.fitMode ? stretched(i) : null;
    let buf = pp.rev ? reversed(base) : base, dur = buf.duration;
    let s0 = pp.start * dur, s1 = Math.max(s0 + 0.005, pp.end * dur);
    if (pp.rev) { const a = dur - s1, b = dur - s0; s0 = a; s1 = b; }
    if (ts) { buf = ts; s0 = 0; s1 = ts.duration; }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate * Math.pow(2, pp.tune / 12) * (ts ? 1 : (pp.fit || 1));
    const g = ctx.createGain(), lvl = (pp.vc > 1 ? 0.06 + 0.94 * Math.pow(vel, pp.vc) : 0.15 + 0.85 * vel) * (gains[i] ?? 1) * pp.level;
    let head = g;
    src.connect(g);
    if (Math.abs(pp.tone - 0.5) > 0.03) { const f = ctx.createBiquadFilter(); if (pp.tone < 0.5) { f.type = "lowpass"; f.frequency.value = 150 * Math.pow(18000 / 150, pp.tone / 0.5); } else { f.type = "highpass"; f.frequency.value = 20 * Math.pow(5000 / 20, (pp.tone - 0.5) / 0.5); } g.connect(f); head = f; }
    head = eqChain(ctx, pp, head);
    if (pp.dirt > 0.02) { const ws = ctx.createWaveShaper(); ws.curve = driveCurve(pp.dirt); const mk = ctx.createGain(); mk.gain.value = 1 - pp.dirt * 0.35; head.connect(ws); ws.connect(mk); head = mk; }
    if (pp.pan && ctx.createStereoPanner) { const pn = ctx.createStereoPanner(); pn.pan.value = pp.pan; head.connect(pn); head = pn; }
    head.connect(liveIn);
    if (pp.echo > 0.01) { const se = ctx.createGain(); se.gain.value = pp.echo; head.connect(se); se.connect(echoIn); }
    const att = pp.att * pp.att * 1.5;
    if (att > 0.002) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + att); } else g.gain.setValueAtTime(lvl, t);
    const len = (s1 - s0) / src.playbackRate.value;
    if (!pp.loop && pp.decay < 0.99) { const end = 0.03 + Math.pow(pp.decay, 2) * len; g.gain.setValueAtTime(lvl, t + Math.max(att, end * 0.6)); g.gain.linearRampToValueAtTime(0, t + end); }
    if (i === 2 && openHatSrc) { try { openHatSrc.stop(t); } catch (e) {} openHatSrc = null; }
    if (i === 3) openHatSrc = src;
    if (pp.loop) { src.loop = true; src.loopStart = s0; src.loopEnd = s1; src.start(t, s0); }
    else src.start(t, s0, s1 - s0);
    lastVoice[i] = { src, g, held: !pp.oneshot || pp.loop, rel: 0.01 + pp.rel * pp.rel * 3 };
    src.onended = () => { if (lastVoice[i] && lastVoice[i].src === src) lastVoice[i] = null; };
    lastHit = { i, t };
    if (t <= now + 0.005) onFirstNote(t);
    return t;
  }
  // Relâchement d'un pad : arrête les sons en mode maintenu ou en boucle
  function padRelease(i) {
    const v = lastVoice[i]; if (!v || !v.held || !ctx) return;
    const t = ctx.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.setTargetAtTime(0, t, v.rel / 4);
    try { v.src.stop(t + v.rel * 1.5); } catch (e) {}
    lastVoice[i] = null;
  }
  let lastHit = null;
  let fullLevel = store.get("full", false) === true;
  function playPad(i, vel) {
    if (fullLevel) vel = 1;
    flash(i);
    if (tab !== "guitar") lcd("lcdPad", "PAD", String(i + 1).padStart(2, "0") + " " + (names[i] || "").toUpperCase());
    if (!ctx) return;
    if (tab === "play" && i !== selected) select(i);
    const t = voice(i, vel, 1);
    hits.push(t); if (hits.length > 32) hits.shift();
    padDown(i, vel, t);
  }
  function playKey(note, vel) {
    if (instCur !== "pad") { keyOn(note, vel); return; }
    lcd("lcdPad", "PAD", String(selected + 1).padStart(2, "0") + " " + (names[selected] || "").toUpperCase() + " ♪" + note);
    flash(selected);
    if (!ctx) return;
    logNote("key", note, vel, ctx.currentTime);
    voice(selected, vel, Math.pow(2, (note - 60) / 12));
  }

