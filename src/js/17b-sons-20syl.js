  // ---------- SONS : famille 20SYL (synthèse NOMAD dans l'esprit de 20syl : synthés chauds, plucks de verre, talkbox, sub ronds) ----------
  const SYL = [
    ["sylkeys", "KEYS FILTRÉES", "accords chauds qui s'ouvrent"],
    ["sylpluck", "PLUCK VERRE", "pincé cristallin, court"],
    ["sylbell", "CLOCHES", "cloches synthétiques mélodiques"],
    ["sylmallet", "MALLET SYNTH", "marimba électronique"],
    ["sylpad", "NAPPE VERRE", "nappe lente et brillante"],
    ["sylstab", "STAB", "accord cuivré court"],
    ["sylclav", "CLAVI FUNK", "clavinet synthétique nerveux"],
    ["syllead", "LEAD SIFFLÉ", "lead doux avec vibrato"],
    ["syltalk", "TALKBOX", "voix de synthé « wa »"],
    ["sylvox", "CHOP VOCAL", "voyelle courte, façon vocal découpé"],
    ["sylsub", "SUB ROND", "basse sub ronde et douce"],
    ["sylbass", "BASSE FILTRÉE", "basse qui claque, filtre résonant"]
  ];
  SYL.forEach(([id, name, d]) => SYNTHS.push({ id, name, cat: "20SYL", lic: d }));
  CATS.push("20SYL");
  let sylNoise = null;
  const SYL_LVL = { sylkeys: 1.8, sylpluck: 0.6, sylbell: 0.9, sylmallet: 0.5, sylpad: 2.2, sylstab: 1.1, sylclav: 2.2, syllead: 1, syltalk: 0.75, sylvox: 0.75, sylsub: 0.55, sylbass: 0.8 };
  function sylVoice(id, f, t, amp, g) {
    amp *= SYL_LVL[id] || 1;
    const srcs = [];
    const osc = (type, fr, det, dest, lvl = 1) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = det || 0; const og = ctx.createGain(); og.gain.value = lvl; o.connect(og); og.connect(dest); o.start(t); srcs.push(o); return o; };
    const bq = (type, fr, q, dest) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; b.connect(dest); return b; };
    const fm = (ratio, index, decay, dest, lvl = 1, cType = "sine") => {
      const car = osc(cType, f, 0, dest, lvl), mod = ctx.createOscillator(), mg = ctx.createGain();
      mod.frequency.value = f * ratio; mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.02), t + decay);
      mod.connect(mg); mg.connect(car.frequency); mod.start(t); srcs.push(mod); return car;
    };
    const A = g.gain;
    A.setValueAtTime(0, t);
    switch (id) {
      case "sylkeys": {
        const lp = bq("lowpass", f * 2, 2.2, g);
        [-8, 0, 8].forEach(d => osc("sawtooth", f, d, lp, 0.22)); osc("square", f / 2, 0, lp, 0.12);
        lp.frequency.setValueAtTime(f * 2, t); lp.frequency.linearRampToValueAtTime(Math.min(12000, f * 12), t + 0.015); lp.frequency.setTargetAtTime(Math.min(8000, f * 3.2), t + 0.02, 0.25);
        A.linearRampToValueAtTime(amp * 0.9, t + 0.006); A.setTargetAtTime(amp * 0.55, t + 0.01, 0.35);
        return { g, srcs, rel: 0.3 + relTime * 0.5 };
      }
      case "sylpluck": {
        const lp = bq("lowpass", Math.min(14000, f * 14), 0.7, g);
        fm(3.5, 4, 0.35, lp, 0.8); osc("sine", f * 2, 4, lp, 0.18);
        A.linearRampToValueAtTime(amp, t + 0.003); A.setTargetAtTime(0, t + 0.004, 0.32);
        return { g, srcs, rel: 0.15 + relTime * 0.3 };
      }
      case "sylbell": {
        fm(1.4, 3.2, 1.6, g, 0.7); fm(3.01, 1.2, 0.5, g, 0.2);
        A.linearRampToValueAtTime(amp * 0.8, t + 0.004); A.setTargetAtTime(0, t + 0.005, 0.9);
        return { g, srcs, rel: 0.6 + relTime };
      }
      case "sylmallet": {
        fm(4, 2.2, 0.12, g, 0.9); osc("sine", f, 0, g, 0.35);
        A.linearRampToValueAtTime(amp, t + 0.002); A.setTargetAtTime(0, t + 0.003, 0.16);
        return { g, srcs, rel: 0.1 + relTime * 0.2 };
      }
      case "sylpad": {
        const lp = bq("lowpass", 600, 0.9, g), trem = ctx.createGain(); trem.gain.value = 0.85; trem.connect(lp);
        osc("sawtooth", f, -12, trem, 0.2); osc("sawtooth", f, 12, trem, 0.2); osc("sine", f * 2, 0, trem, 0.18); osc("triangle", f / 2, 0, trem, 0.15);
        const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.3; lg.gain.value = 0.12; l.connect(lg); lg.connect(trem.gain); l.start(t); srcs.push(l);
        lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(Math.min(6000, f * 6), t + 2.2);
        A.linearRampToValueAtTime(amp * 0.85, t + 0.8);
        return { g, srcs, rel: 1.4 + relTime };
      }
      case "sylstab": {
        const lp = bq("lowpass", 5000, 1.5, g);
        [-14, -5, 5, 14].forEach(d => osc("sawtooth", f, d, lp, 0.2)); osc("sawtooth", f * 2, 3, lp, 0.08);
        lp.frequency.setValueAtTime(Math.min(9000, f * 16), t); lp.frequency.setTargetAtTime(Math.min(3000, f * 3), t + 0.01, 0.08);
        A.linearRampToValueAtTime(amp, t + 0.008); A.setTargetAtTime(amp * 0.15, t + 0.05, 0.12);
        return { g, srcs, rel: 0.12 + relTime * 0.3 };
      }
      case "sylclav": {
        const hp = bq("highpass", 250, 0.7, g), bp = bq("bandpass", 3000, 4, hp);
        osc("square", f, 0, bp, 0.5); osc("sawtooth", f, 6, bp, 0.3);
        bp.frequency.setValueAtTime(Math.min(8000, f * 10), t); bp.frequency.setTargetAtTime(Math.min(2500, f * 3), t + 0.005, 0.06);
        A.linearRampToValueAtTime(amp * 1.6, t + 0.002); A.setTargetAtTime(amp * 0.5, t + 0.01, 0.12);
        return { g, srcs, rel: 0.06 + relTime * 0.15 };
      }
      case "syllead": {
        const lp = bq("lowpass", Math.min(9000, f * 6), 0.8, g);
        const o1 = osc("triangle", f, 0, lp, 0.6), o2 = osc("sine", f * 2, 0, lp, 0.12);
        const v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 5.6; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(14, t + 0.6);
        v.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune); v.start(t); srcs.push(v);
        if (!sylNoise) { sylNoise = ctx.createBuffer(1, sr, sr); const d = sylNoise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
        const n = ctx.createBufferSource(); n.buffer = sylNoise; n.loop = true; const nb = bq("bandpass", Math.min(9000, f * 2), 3, lp); const ng = ctx.createGain(); ng.gain.value = 0.05; n.connect(ng); ng.connect(nb); n.start(t); srcs.push(n);
        o1.detune.setValueAtTime(-40, t); o1.detune.linearRampToValueAtTime(0, t + 0.06);
        A.linearRampToValueAtTime(amp * 0.85, t + 0.035);
        return { g, srcs, rel: 0.18 + relTime * 0.4 };
      }
      case "syltalk": case "sylvox": {
        const sum = ctx.createGain(); sum.gain.value = id === "syltalk" ? 3.2 : 3.6; sum.connect(g);
        const src = ctx.createGain();
        osc("sawtooth", f, 0, src, 0.5); osc("sawtooth", f, id === "syltalk" ? 7 : 0, src, 0.4);
        const from = id === "syltalk" ? [300, 870, 2240] : [530, 1840, 2480], to = id === "syltalk" ? [730, 1090, 2440] : [600, 1650, 2400];
        [1, 0.55, 0.28].forEach((lv, k) => { const b = ctx.createBiquadFilter(); b.type = "bandpass"; b.Q.value = 9 - k * 2; b.frequency.setValueAtTime(from[k], t); b.frequency.linearRampToValueAtTime(to[k], t + (id === "syltalk" ? 0.16 : 0.08)); const bg = ctx.createGain(); bg.gain.value = lv; src.connect(b); b.connect(bg); bg.connect(sum); });
        if (id === "sylvox") { srcs.forEach(o => { o.detune.setValueAtTime(-100, t); o.detune.linearRampToValueAtTime(0, t + 0.04); }); A.linearRampToValueAtTime(amp, t + 0.01); A.setTargetAtTime(0, t + 0.16, 0.06); return { g, srcs, rel: 0.08 }; }
        A.linearRampToValueAtTime(amp, t + 0.02);
        return { g, srcs, rel: 0.12 + relTime * 0.3 };
      }
      case "sylsub": {
        const lp = bq("lowpass", 700, 0.7, g);
        const o = osc("sine", f, 0, lp, 1); osc("sine", f * 2, 0, lp, 0.12); osc("triangle", f, 0, lp, 0.1);
        o.frequency.setValueAtTime(f * 1.08, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.045);
        A.linearRampToValueAtTime(amp * 1.25, t + 0.006);
        return { g, srcs, rel: 0.12 + relTime * 0.35 };
      }
      case "sylbass": {
        const lp = bq("lowpass", f * 8, 7, g);
        osc("sawtooth", f, 0, lp, 0.45); osc("square", f / 2, 0, lp, 0.25);
        lp.frequency.setValueAtTime(Math.min(8000, f * 18), t); lp.frequency.setTargetAtTime(Math.max(120, f * 2), t + 0.005, 0.09);
        A.linearRampToValueAtTime(amp * 1.1, t + 0.004); A.setTargetAtTime(amp * 0.75, t + 0.01, 0.2);
        return { g, srcs, rel: 0.08 + relTime * 0.25 };
      }
    }
    return null;
  }
