  // ---------- SONS : collections FKJ, DUB, LO-FI (synthèse NOMAD, dans l'esprit de chaque univers) ----------
  const NCOL = {
    FKJ: [["fkjrhodes", "RHODES CHORUS", "piano électrique rond, chorus"], ["fkjwurli", "WURLI", "piano électrique qui grogne"], ["fkjkeys", "SYNTH KEYS", "accords doux et filtrés"], ["fkjbass", "BASSE RONDE", "basse chaude, un peu saturée"],
      ["fkjgtr", "GUITARE NYLON", "corde pincée claire"], ["fkjfunk", "GUITARE FUNK", "corde étouffée, nerveuse"], ["fkjpad", "NAPPE CHAUDE", "nappe lente et large"], ["fkjsax", "LEAD SAX", "lead soufflé avec vibrato"],
      ["fkjbell", "CLOCHE DOUCE", "cloche électrique"], ["fkjmarimba", "MARIMBA", "bois frappé, court"]],
    DUB: [["dubmelodica", "MÉLODICA", "anche soufflée, vibrato"], ["dubbass", "BASSE DUB", "basse profonde et ronde"], ["dubskank", "SKANK ORGUE", "orgue court sur le contretemps"], ["dubbubble", "ORGUE BUBBLE", "orgue qui bulle"],
      ["dubhorn", "CUIVRES", "section cuivre qui s'ouvre"], ["dubsiren", "SIRÈNE", "sirène dub, la note donne la hauteur"], ["dubsyndrum", "SYNDRUM", "tom électronique qui plonge"], ["dubpiano", "PIANO DUB", "piano sourd et court"],
      ["dubstab", "STAB", "accord sec, à passer dans l'écho"], ["dubflute", "FLÛTE", "flûte soufflée"]],
    "LO-FI": [["lofipiano", "PIANO CASSETTE", "piano qui pleure un peu"], ["lofiep", "RHODES USÉ", "piano électrique fatigué"], ["lofipad", "NAPPE VHS", "nappe qui ondule"], ["lofibass", "BASSE FEUTRÉE", "basse douce, sans attaque"],
      ["lofiguitar", "GUITARE JAZZ", "corde pincée sombre"], ["lofivibes", "VIBRAPHONE", "lames avec trémolo"], ["lofiflute", "FLÛTE LO-FI", "flûte et souffle"], ["lofikalimba", "KALIMBA", "lames pincées"],
      ["lofichip", "CHIP 8-BIT", "petite console"], ["lofisynth", "SYNTH DOUX", "lead rond qui dérive"]]
  };
  const NCOL_ID = {};
  Object.entries(NCOL).forEach(([cat, list]) => { list.forEach(([id, name, d]) => { SYNTHS.push({ id, name, cat, lic: d }); NCOL_ID[id] = 1; }); if (!CATS.includes(cat)) CATS.push(cat); });
  // ordre des collections : 20SYL, FKJ, DUB, LO-FI, puis les autres
  { const front = ["20SYL", "FKJ", "DUB", "LO-FI"].filter(c => CATS.includes(c)), rest = CATS.filter(c => !front.includes(c)); CATS.length = 0; front.concat(rest).forEach(c => CATS.push(c)); }
  const NV_LVL = {"fkjrhodes": 0.4, "fkjwurli": 0.32, "fkjkeys": 1.39, "fkjbass": 0.46, "fkjgtr": 2.58, "fkjfunk": 2.05, "fkjpad": 2.58, "fkjsax": 2.08, "fkjbell": 0.68, "fkjmarimba": 0.54, "dubmelodica": 1.0, "dubbass": 0.49, "dubskank": 1.1, "dubbubble": 0.74, "dubhorn": 1.51, "dubsiren": 2.16, "dubsyndrum": 0.45, "dubpiano": 0.92, "dubstab": 1.11, "dubflute": 0.7, "lofipiano": 0.85, "lofiep": 0.75, "lofipad": 1.63, "lofibass": 0.44, "lofiguitar": 1.78, "lofivibes": 0.58, "lofiflute": 0.69, "lofikalimba": 0.47, "lofichip": 1.72, "lofisynth": 0.7};   // niveaux mesurés pour s'aligner sur 20SYL
  let nvNoise = null;
  const ksCache = new Map();
  // corde pincée (Karplus-Strong) calculée une fois par note et par caractère
  function ksBuf(f, damp, bright, dur) {
    const key = f.toFixed(2) + "|" + damp + "|" + bright; if (ksCache.has(key)) return ksCache.get(key);
    const n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), P = Math.max(2, Math.round(sr / f)), ring = new Float32Array(P);
    for (let i = 0; i < P; i++) ring[i] = (Math.random() * 2 - 1) * (1 - bright * 0.5) + (i < P / 2 ? bright * 0.5 : -bright * 0.5);
    let p = 0, last = 0;
    for (let i = 0; i < n; i++) { const a = ring[p], nx = ring[(p + 1) % P], y = damp * (bright * a + (1 - bright) * 0.5 * (a + nx)); d[i] = a; ring[p] = y * 0.5 + last * 0.5 * (1 - bright); last = y; p = (p + 1) % P; }
    if (ksCache.size > 80) ksCache.delete(ksCache.keys().next().value);
    ksCache.set(key, b); return b;
  }
  function nomVoice(id, f, t, amp, g) {
    amp *= NV_LVL[id] || 1;
    const srcs = [], A = g.gain;
    const osc = (type, fr, det, dest, lvl = 1) => { const o = ctx.createOscillator(); if (type === "pulse") o.setPeriodicWave(pulseWave(0.3)); else o.type = type; o.frequency.value = fr; o.detune.value = det || 0; const og = ctx.createGain(); og.gain.value = lvl; o.connect(og); og.connect(dest); o.start(t); srcs.push(o); return o; };
    const bq = (type, fr, q, dest) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; b.connect(dest); return b; };
    const fm = (ratio, index, decay, dest, lvl = 1, det = 0) => { const car = osc("sine", f, det, dest, lvl), mod = ctx.createOscillator(), mg = ctx.createGain(); mod.frequency.value = f * ratio; mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.03), t + decay); mod.connect(mg); mg.connect(car.frequency); mod.start(t); srcs.push(mod); return car; };
    const lfo = (rate, depth, targets, delay = 0) => { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = rate; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(depth, t + 0.01 + delay); l.connect(lg); targets.forEach(x => lg.connect(x)); l.start(t); srcs.push(l); return l; };
    const noise = (dest, lvl, bp, q = 1) => { if (!nvNoise) { nvNoise = ctx.createBuffer(1, sr * 2, sr); const d = nvNoise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const n = ctx.createBufferSource(); n.buffer = nvNoise; n.loop = true; const b = bq("bandpass", bp, q, dest), ng = ctx.createGain(); ng.gain.value = lvl; n.connect(ng); ng.connect(b); n.start(t); srcs.push(n); return ng; };
    const pluck = (damp, bright, dur, dest, lvl = 1) => { const s = ctx.createBufferSource(); s.buffer = ksBuf(f, damp, bright, dur); const sg = ctx.createGain(); sg.gain.value = lvl; s.connect(sg); sg.connect(dest); s.start(t); srcs.push(s); return s; };
    const sat = (k, dest) => { const w = ctx.createWaveShaper(); w.curve = driveCurve(k); w.connect(dest); return w; };
    const wow = (os, depth = 9) => lfo(0.45 + Math.random() * 0.2, depth, os.map(o => o.detune));
    A.setValueAtTime(0, t);
    const env = (att, peak, sus, tau) => { A.linearRampToValueAtTime(amp * peak, t + att); if (sus !== null) A.setTargetAtTime(amp * sus, t + att, tau); };
    switch (id) {
      // ----- FKJ -----
      case "fkjrhodes": { const lp = bq("lowpass", Math.min(9000, f * 8), 0.7, g); const a = fm(1, 1.8, 1.1, lp, 0.6, -5), b = fm(1, 1.6, 1.0, lp, 0.6, 5); fm(14, 0.4, 0.05, lp, 0.1); lfo(4.5, 0.12, [g.gain]); env(0.004, 1, 0.45, 1.4); return { g, srcs, rel: 0.25 + relTime * 0.5 }; }
      case "fkjwurli": { const lp = bq("lowpass", Math.min(7000, f * 6), 0.8, g), s = sat(0.35, lp); fm(1, 3, 0.45, s, 0.6); osc("triangle", f, 0, s, 0.25); env(0.003, 1, 0.4, 1.0); return { g, srcs, rel: 0.2 + relTime * 0.4 }; }
      case "fkjkeys": { const lp = bq("lowpass", Math.min(6000, f * 4), 1, g); const o = [osc("sawtooth", f, -6, lp, 0.25), osc("sawtooth", f, 6, lp, 0.25), osc("sine", f / 2, 0, lp, 0.2)]; lfo(0.3, 6, o.map(x => x.detune)); env(0.012, 0.9, 0.7, 0.6); return { g, srcs, rel: 0.3 + relTime * 0.6 }; }
      case "fkjbass": { const lp = bq("lowpass", 900, 0.8, g), s = sat(0.25, lp); osc("sine", f, 0, s, 0.9); osc("triangle", f, 0, s, 0.3); env(0.005, 1, 0.8, 0.8); return { g, srcs, rel: 0.12 + relTime * 0.3 }; }
      case "fkjgtr": { const lp = bq("lowpass", Math.min(9000, f * 10), 0.6, g); pluck(0.996, 0.25, 3, lp, 1); env(0.002, 1, null); return { g, srcs, rel: 0.25 + relTime * 0.5 }; }
      case "fkjfunk": { const hp = bq("highpass", 220, 0.7, g), lp = bq("lowpass", Math.min(7000, f * 8), 1.5, hp); pluck(0.975, 0.55, 0.8, lp, 1.2); env(0.002, 1, null); return { g, srcs, rel: 0.06 + relTime * 0.15 }; }
      case "fkjpad": { const lp = bq("lowpass", 700, 0.7, g); const o = [osc("sawtooth", f, -10, lp, 0.2), osc("sawtooth", f, 0, lp, 0.2), osc("sawtooth", f, 10, lp, 0.2), osc("triangle", f / 2, 0, lp, 0.2)]; lfo(0.25, 5, o.map(x => x.detune)); lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(Math.min(3200, f * 5), t + 1.5); env(0.7, 0.85, null); return { g, srcs, rel: 1.3 + relTime }; }
      case "fkjsax": { const sum = ctx.createGain(); sum.gain.value = 2.8; sum.connect(g); const src = ctx.createGain(); const o = [osc("sawtooth", f, 0, src, 0.6), osc("pulse", f, 4, src, 0.3)]; [[520, 6, 1], [1450, 7, 0.5], [2600, 8, 0.25]].forEach(([fr, q, lv]) => { const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = fr; b.Q.value = q; const bg = ctx.createGain(); bg.gain.value = lv; src.connect(b); b.connect(bg); bg.connect(sum); }); noise(sum, 0.06, 2000, 1); lfo(5.2, 18, o.map(x => x.detune), 0.35); o.forEach(x => { x.detune.setValueAtTime(-60, t); x.detune.linearRampToValueAtTime(0, t + 0.07); }); env(0.045, 0.9, 0.8, 0.5); return { g, srcs, rel: 0.15 + relTime * 0.3 }; }
      case "fkjbell": { fm(3.5, 2, 1.4, g, 0.6); osc("sine", f, 0, g, 0.25); env(0.003, 0.9, 0, 1.0); return { g, srcs, rel: 0.6 + relTime }; }
      case "fkjmarimba": { fm(4, 1.5, 0.12, g, 0.7); osc("sine", f, 0, g, 0.4); env(0.002, 1, 0, 0.18); return { g, srcs, rel: 0.12 + relTime * 0.2 }; }
      // ----- DUB -----
      case "dubmelodica": {
        const lp = bq("lowpass", Math.min(5000, f * 7), 1.2, g), pk = bq("peaking", 1250, 1.5, lp); pk.gain.value = 6;
        const o = [osc("pulse", f, 0, pk, 0.45), osc("sawtooth", f, 5, pk, 0.22), osc("square", f * 2, -3, pk, 0.05)];
        noise(lp, 0.05, Math.min(6000, f * 3), 0.8);
        lfo(5.5, 12, o.map(x => x.detune), 0.3);
        o.forEach(x => { x.detune.setValueAtTime(-35, t); x.detune.linearRampToValueAtTime(0, t + 0.08); });
        lp.frequency.setValueAtTime(Math.min(1800, f * 3), t); lp.frequency.linearRampToValueAtTime(Math.min(5000, f * 7), t + 0.08);
        env(0.04, 0.9, 0.8, 0.6); return { g, srcs, rel: 0.12 + relTime * 0.3 };
      }
      case "dubbass": { const lp = bq("lowpass", 420, 0.9, g); const o = osc("sine", f, 0, lp, 1); osc("sine", f * 2, 0, lp, 0.12); osc("triangle", f, 0, lp, 0.1); o.frequency.setValueAtTime(f * 1.06, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); env(0.008, 1.2, 1, 1); return { g, srcs, rel: 0.15 + relTime * 0.4 }; }
      case "dubskank": { const hp = bq("highpass", 350, 0.7, g); [1, 2, 3, 4].forEach((h, i) => osc("sine", f * h, 0, hp, [0.5, 0.35, 0.25, 0.12][i])); env(0.004, 1, 0, 0.07); return { g, srcs, rel: 0.05 }; }
      case "dubbubble": { const bp = bq("lowpass", 3000, 6, g); [1, 2, 3].forEach((h, i) => osc("sine", f * h, 0, bp, [0.5, 0.3, 0.2][i])); osc("square", f, 0, bp, 0.08); bp.frequency.setValueAtTime(Math.min(4000, f * 6), t); bp.frequency.exponentialRampToValueAtTime(Math.max(150, f * 1.2), t + 0.18); env(0.004, 1, 0.1, 0.15); return { g, srcs, rel: 0.08 }; }
      case "dubhorn": { const lp = bq("lowpass", f * 2, 2, g); const o = [osc("sawtooth", f, -7, lp, 0.3), osc("sawtooth", f, 7, lp, 0.3)]; lp.frequency.setValueAtTime(Math.min(4000, f * 1.5), t); lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 7), t + 0.07); lp.frequency.setTargetAtTime(Math.min(6000, f * 4), t + 0.08, 0.2); lfo(5, 8, o.map(x => x.detune), 0.4); env(0.03, 0.9, 0.75, 0.4); return { g, srcs, rel: 0.12 + relTime * 0.3 }; }
      case "dubsiren": { const bp = bq("bandpass", 1500, 0.8, g); const o = osc("square", f, 0, bp, 0.4); const l = ctx.createOscillator(), lg = ctx.createGain(); l.type = "triangle"; l.frequency.setValueAtTime(2, t); l.frequency.linearRampToValueAtTime(6, t + 2.5); lg.gain.value = 500; l.connect(lg); lg.connect(o.detune); l.start(t); srcs.push(l); env(0.02, 0.8, null); return { g, srcs, rel: 0.2 + relTime * 0.4 }; }
      case "dubsyndrum": { const o = osc("sine", f * 2, 0, g, 1); osc("triangle", f * 2, 0, g, 0.2); o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f * 0.5), t + 0.45); env(0.002, 1.2, 0, 0.18); return { g, srcs, rel: 0.2 }; }
      case "dubpiano": { const lp = bq("lowpass", Math.min(3500, f * 5), 0.7, g); fm(1, 2.2, 0.6, lp, 0.6); fm(2, 0.8, 0.3, lp, 0.25); env(0.003, 1, 0, 0.5); return { g, srcs, rel: 0.15 + relTime * 0.3 }; }
      case "dubstab": { const lp = bq("lowpass", Math.min(4000, f * 6), 1.5, g); osc("square", f, 0, lp, 0.3); osc("sawtooth", f, 8, lp, 0.3); osc("sawtooth", f * 1.5, 0, lp, 0.15); env(0.004, 1, 0, 0.1); return { g, srcs, rel: 0.08 }; }
      case "dubflute": { const lp = bq("lowpass", Math.min(8000, f * 6), 0.7, g); const o = [osc("sine", f, 0, lp, 0.8), osc("sine", f * 2, 0, lp, 0.08)]; noise(lp, 0.08, Math.min(8000, f * 2), 1.2); lfo(5, 10, o.map(x => x.detune), 0.3); env(0.06, 0.85, 0.75, 0.5); return { g, srcs, rel: 0.12 + relTime * 0.3 }; }
      // ----- LO-FI -----
      case "lofipiano": { const lp = bq("lowpass", 3200, 0.7, g); const a = fm(1, 2.4, 0.9, lp, 0.6), b = fm(2, 0.6, 0.4, lp, 0.2); wow([a, b]); env(0.003, 1, 0.2, 0.8); return { g, srcs, rel: 0.2 + relTime * 0.4 }; }
      case "lofiep": { const lp = bq("lowpass", 2400, 0.7, g); const a = fm(1, 1.4, 1.0, lp, 0.7); wow([a], 12); noise(lp, 0.012, 5000, 0.5); env(0.004, 1, 0.4, 1.2); return { g, srcs, rel: 0.25 + relTime * 0.5 }; }
      case "lofipad": { const lp = bq("lowpass", 1400, 0.7, g); const o = [osc("sawtooth", f, -8, lp, 0.2), osc("sawtooth", f, 8, lp, 0.2), osc("sine", f / 2, 0, lp, 0.25)]; wow(o, 14); env(0.6, 0.85, null); return { g, srcs, rel: 1.2 + relTime }; }
      case "lofibass": { const lp = bq("lowpass", 520, 0.7, g); osc("triangle", f, 0, lp, 0.9); osc("sine", f, 0, lp, 0.5); env(0.02, 1.1, 0.85, 0.8); return { g, srcs, rel: 0.15 + relTime * 0.3 }; }
      case "lofiguitar": { const lp = bq("lowpass", Math.min(2200, f * 4), 0.7, g); const s = pluck(0.994, 0.12, 2.5, lp, 1.2); lfo(0.5, 8, [s.detune]); env(0.003, 1, null); return { g, srcs, rel: 0.2 + relTime * 0.4 }; }
      case "lofivibes": { const tr = ctx.createGain(); tr.gain.value = 0.8; tr.connect(g); fm(4, 0.8, 0.3, tr, 0.4); osc("sine", f, 0, tr, 0.5); lfo(5.5, 0.2, [tr.gain]); env(0.002, 1, 0, 1.2); return { g, srcs, rel: 0.4 + relTime * 0.5 }; }
      case "lofiflute": { const lp = bq("lowpass", Math.min(6000, f * 5), 0.7, g); const o = [osc("sine", f, 0, lp, 0.8), osc("triangle", f * 2, 0, lp, 0.05)]; noise(lp, 0.1, Math.min(7000, f * 2.5), 1); wow(o, 10); env(0.07, 0.85, 0.75, 0.5); return { g, srcs, rel: 0.12 + relTime * 0.3 }; }
      case "lofikalimba": { const lp = bq("lowpass", Math.min(7000, f * 8), 0.7, g); fm(5.4, 1.1, 0.08, lp, 0.6); osc("sine", f, 0, lp, 0.5); env(0.002, 1, 0, 0.35); return { g, srcs, rel: 0.2 + relTime * 0.3 }; }
      case "lofichip": { const lp = bq("lowpass", 6000, 0.7, g); const o = osc("pulse", f, 0, lp, 0.4); osc("square", f / 2, 0, lp, 0.1); lfo(6, 15, [o.detune], 0.25); env(0.002, 0.8, 0.55, 0.25); return { g, srcs, rel: 0.05 + relTime * 0.15 }; }
      case "lofisynth": { const lp = bq("lowpass", Math.min(4000, f * 5), 0.9, g); const o = [osc("triangle", f, -4, lp, 0.5), osc("sine", f, 4, lp, 0.4)]; wow(o, 12); env(0.02, 0.9, 0.75, 0.6); return { g, srcs, rel: 0.2 + relTime * 0.4 }; }
    }
    return null;
  }
  const pulseWaves = new Map();
  function pulseWave(duty) {
    if (pulseWaves.has(duty)) return pulseWaves.get(duty);
    const H = 48, re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) { re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty * 2) * 0.5; im[n] = 2 / (n * Math.PI) * (1 - Math.cos(n * Math.PI * duty * 2)) * 0.5; }
    const w = ctx.createPeriodicWave(re, im); pulseWaves.set(duty, w); return w;
  }
