  // ---------- MASTERING AUTOMATIQUE (sans IA) : mesure du volume perçu, égalisation, compression, saturation, limiteur ----------
  const MASTER_CHARS = [
    ["none", "AUCUN", "export brut, sans traitement"],
    ["naturel", "NATUREL", "propre et équilibré, juste plus fort"],
    ["chaud", "CHAUD", "graves ronds, aigus adoucis, un peu de saturation"],
    ["clair", "CLAIR", "aigus ouverts, médiums dégagés"],
    ["punch", "PUNCH", "batterie qui claque, compression plus marquée"],
    ["lofi", "LO-FI", "bande passante réduite, grain, compression forte"]
  ];
  const MASTER_TARGETS = [[-14, "STREAMING", "-14 LUFS, comme Spotify et YouTube"], [-9, "FORT", "-9 LUFS, club et démo qui pousse"], [-18, "DOUX", "-18 LUFS, nuances préservées"]];
  const MASTER = { char: store.get("masterChar", "naturel"), target: store.get("masterTarget", -14), playing: null };
  const MCFG = {
    naturel: { eq: [], comp: [-20, 1.8, 0.03, 0.25], sat: 1.0 },
    chaud: { eq: [["lowshelf", 120, 0.7, 2.5], ["peaking", 300, 0.8, 1], ["highshelf", 9000, 0.7, -2]], comp: [-20, 2.2, 0.03, 0.3], sat: 1.6 },
    clair: { eq: [["highpass", 40, 0.7, 0], ["peaking", 250, 1, -1.5], ["peaking", 3000, 1, 1], ["highshelf", 8000, 0.7, 3]], comp: [-22, 2, 0.02, 0.2], sat: 1.1 },
    punch: { eq: [["lowshelf", 80, 0.7, 2], ["peaking", 400, 1, -2], ["peaking", 3500, 1, 1.5]], comp: [-24, 3.5, 0.008, 0.12], sat: 1.4 },
    lofi: { eq: [["highpass", 70, 0.7, 0], ["lowpass", 8500, 0.7, 0], ["peaking", 1200, 0.7, 2]], comp: [-26, 4, 0.01, 0.2], sat: 2.4 }
  };
  async function lufsOf(chs) {
    const n = chs[0].length; if (n < sr * 0.5) return -70;
    const oc = new OfflineAudioContext(2, n, sr), b = oc.createBuffer(2, n, sr);
    b.copyToChannel(chs[0], 0); b.copyToChannel(chs[1] || chs[0], 1);
    const s = oc.createBufferSource(); s.buffer = b;
    const hs = oc.createBiquadFilter(); hs.type = "highshelf"; hs.frequency.value = 1681; hs.gain.value = 4;
    const hp = oc.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 38; hp.Q.value = 0.5;
    s.connect(hs); hs.connect(hp); hp.connect(oc.destination); s.start();
    const r = await oc.startRendering(), L = r.getChannelData(0), R = r.getChannelData(1);
    const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), zs = [];
    for (let a = 0; a + blk <= n; a += hop) { let z = 0; for (let i = a; i < a + blk; i++) z += L[i] * L[i] + R[i] * R[i]; zs.push(z / blk); }
    const ld = z => -0.691 + 10 * Math.log10(z + 1e-12);
    const g1 = zs.filter(z => ld(z) > -70); if (!g1.length) return -70;
    const rel = ld(g1.reduce((a, z) => a + z, 0) / g1.length) - 10;
    const g2 = g1.filter(z => ld(z) > rel);
    return ld(g2.reduce((a, z) => a + z, 0) / g2.length);
  }
  async function renderMaster(chs, char, gainDb) {
    const n = chs[0].length, c = MCFG[char], oc = new OfflineAudioContext(2, n, sr), b = oc.createBuffer(2, n, sr);
    b.copyToChannel(chs[0], 0); b.copyToChannel(chs[1] || chs[0], 1);
    const s = oc.createBufferSource(); s.buffer = b;
    let prev = s;
    const link = node => { prev.connect(node); prev = node; };
    const hp = oc.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 25; hp.Q.value = 0.7; link(hp);
    c.eq.forEach(([type, f, q, g]) => { const e = oc.createBiquadFilter(); e.type = type; e.frequency.value = f; e.Q.value = q; e.gain.value = g; link(e); });
    const cp = oc.createDynamicsCompressor(); [cp.threshold.value, cp.ratio.value, cp.attack.value, cp.release.value] = c.comp; cp.knee.value = 8; link(cp);
    const mk = oc.createGain(); mk.gain.value = Math.pow(10, -c.comp[0] * (1 - 1 / c.comp[1]) / 40); link(mk);
    if (c.sat > 1) { const w = oc.createWaveShaper(), cv = new Float32Array(4096); for (let i = 0; i < cv.length; i++) { const x = i / 2047.5 - 1; cv[i] = Math.tanh(c.sat * x) / Math.tanh(c.sat); } w.curve = cv; w.oversample = "4x"; link(w); }
    const g = oc.createGain(); g.gain.value = Math.pow(10, gainDb / 20); link(g);
    const lim = oc.createDynamicsCompressor(); lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08; link(lim);
    prev.connect(oc.destination); s.start();
    const r = await oc.startRendering(), out = [r.getChannelData(0).slice(), r.getChannelData(1).slice()];
    // plafond à -1 dBFS : arrondi doux au-delà de 75 % du plafond
    const C = 0.891, K = 0.75 * C;
    out.forEach(ch => { for (let i = 0; i < ch.length; i++) { const x = ch[i], a = Math.abs(x); if (a > K) ch[i] = Math.sign(x) * (K + (C - K) * Math.tanh((a - K) / (C - K))); } });
    return out;
  }
  // Applique le mastering choisi (deux ou trois passes pour tomber sur le volume cible)
  async function masterMix(chs, label) {
    if (!chs || MASTER.char === "none") return chs;
    lcd("lcdPad", "MASTER", "calcul en cours…");
    let g = 0, out = await renderMaster(chs, MASTER.char, 0), L = await lufsOf(out);
    for (let k = 0; k < 2 && Math.abs(MASTER.target - L) > 0.6 && L > -60; k++) { g += MASTER.target - L; g = Math.max(-12, Math.min(24, g)); out = await renderMaster(chs, MASTER.char, g); L = await lufsOf(out); }
    const ch = MASTER_CHARS.find(x => x[0] === MASTER.char)[1];
    lcd("lcdPad", "MASTER", `${ch} · ${L.toFixed(1)} LUFS${label ? " · " + label : ""}`);
    return out;
  }
  function drawMaster() {
    if (!$("mChar")) return;
    const c = MASTER_CHARS.find(x => x[0] === MASTER.char), t = MASTER_TARGETS.find(x => x[0] === MASTER.target) || MASTER_TARGETS[0];
    $("mChar").textContent = "MASTER : " + c[1]; $("mChar").classList.toggle("on", MASTER.char !== "none");
    $("mTarget").textContent = "VOLUME : " + t[1]; $("mTarget").disabled = MASTER.char === "none";
    $("mInfo").textContent = MASTER.char === "none" ? c[2] : `${c[2]} · ${t[2]}`;
  }
  $("mChar").addEventListener("click", () => { const i = MASTER_CHARS.findIndex(x => x[0] === MASTER.char); MASTER.char = MASTER_CHARS[(i + 1) % MASTER_CHARS.length][0]; store.set("masterChar", MASTER.char); drawMaster(); });
  $("mTarget").addEventListener("click", () => { const i = MASTER_TARGETS.findIndex(x => x[0] === MASTER.target); MASTER.target = MASTER_TARGETS[(i + 1) % MASTER_TARGETS.length][0]; store.set("masterTarget", MASTER.target); drawMaster(); });
  // Écouter : le morceau (ou la séquence) masterisé, 30 secondes au plus
  $("mListen").addEventListener("click", async () => {
    if (!ctx) return;
    if (MASTER.playing) { try { MASTER.playing.stop(); } catch (e) {} MASTER.playing = null; $("mListen").textContent = "▶ ÉCOUTER"; return; }
    let m = songMix(); if (!m && allLayers().length) m = loopStems(allLayers()).mix;
    if (!m) { lcd("lcdPad", "MASTER", "rien à écouter : enregistrez une boucle"); return; }
    const n = Math.min(m[0].length, sr * 30), cut = [m[0].slice(0, n), (m[1] || m[0]).slice(0, n)];
    $("mListen").textContent = "…";
    const out = await masterMix(cut, "écoute");
    const b = ctx.createBuffer(2, n, sr); b.copyToChannel(out[0], 0); b.copyToChannel(out[1], 1);
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start();
    if (LP.playing) stopAll();
    MASTER.playing = s; $("mListen").textContent = "■ STOP";
    s.onended = () => { if (MASTER.playing === s) { MASTER.playing = null; $("mListen").textContent = "▶ ÉCOUTER"; } };
  });
  drawMaster();
