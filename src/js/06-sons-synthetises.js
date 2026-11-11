  // ---------- Sons synthétisés (kit de départ) ----------
  function render(sr) {
    const mk = sec => new Float32Array(Math.floor(sr * sec));
    const noise = () => Math.random() * 2 - 1;
    const env = (t, d) => Math.exp(-t / d);
    const lp = (x, a) => { let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; };
    const hp = (x, a) => { let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = x[i] - y; } return x; };
    const sine = (f0, f1, sweep, dur, dec, amp = 1) => { const x = mk(dur); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / sr; const f = f1 + (f0 - f1) * Math.exp(-t / sweep); ph += 2 * Math.PI * f / sr; x[i] = Math.sin(ph) * env(t, dec) * amp; } return x; };
    const noiseHit = (dur, dec, hpA, att = 0) => { const x = mk(dur); for (let i = 0; i < x.length; i++) { const t = i / sr; const a = att ? Math.min(1, t / att) : 1; x[i] = noise() * env(t, dec) * a; } return hp(x, hpA); };
    const mix = (...xs) => { const n = Math.max(...xs.map(x => x.length)); const y = new Float32Array(n); xs.forEach(x => x.forEach((v, i) => y[i] += v)); return y; };
    const sat = (x, g) => x.map(v => Math.tanh(v * g) / Math.tanh(g));
    const kick = sat(mix(sine(160, 48, 0.035, 0.6, 0.22), noiseHit(0.01, 0.002, 0.2)), 1.6);
    const snare = mix(sine(220, 180, 0.02, 0.25, 0.06, 0.7), lp(noiseHit(0.3, 0.07, 0.15), 0.6));
    const hat = noiseHit(0.12, 0.022, 0.75).map(v => v * 0.6);
    const ohat = noiseHit(0.6, 0.16, 0.75).map(v => v * 0.5);
    const clap = (() => { const x = mk(0.35); for (let i = 0; i < x.length; i++) { const t = i / sr; let a = 0; [0, 0.011, 0.022].forEach(o => { if (t >= o && t < o + 0.009) a = 1; }); if (t >= 0.033) a = env(t - 0.033, 0.07); x[i] = noise() * a; } return lp(hp(x, 0.2), 0.5); })();
    const rim = mix(sine(1700, 1600, 0.01, 0.06, 0.012, 0.6), noiseHit(0.03, 0.006, 0.4)).map(v => v * 0.9);
    const shaker = noiseHit(0.18, 0.04, 0.7, 0.03).map(v => v * 0.5);
    const snap = lp(noiseHit(0.08, 0.012, 0.5), 0.7);
    const tomL = sine(140, 95, 0.05, 0.5, 0.16, 0.9);
    const tomH = sine(210, 150, 0.04, 0.4, 0.12, 0.85);
    const conga = sine(330, 280, 0.02, 0.3, 0.08, 0.85);
    const bell = (() => { const x = mk(0.5); for (let i = 0; i < x.length; i++) { const t = i / sr; x[i] = (Math.sign(Math.sin(2 * Math.PI * 545 * t)) + Math.sign(Math.sin(2 * Math.PI * 815 * t))) * 0.22 * env(t, 0.09); } return lp(x, 0.35); })();
    const ride = (() => { const x = mk(1.4); const fs = [313, 457, 594, 761, 893, 1201]; for (let i = 0; i < x.length; i++) { const t = i / sr; let s = 0; fs.forEach(f => s += Math.sign(Math.sin(2 * Math.PI * f * 2.3 * t))); x[i] = (s / 6 * 0.5 + noise() * 0.3) * env(t, 0.45); } return hp(x, 0.6).map(v => v * 0.5); })();
    const bass = sat(sine(70, 49, 0.03, 1.3, 0.5), 2.2).map(v => v * 0.85);
    const stab = (() => { const x = mk(0.8); const fs = [220, 261.63, 329.63, 392]; for (let i = 0; i < x.length; i++) { const t = i / sr; let s = 0; fs.forEach(f => { for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * f * h * t) / h; }); x[i] = s * 0.09 * env(t, 0.22); } return lp(x, 0.25); })();
    const blip = sine(990, 880, 0.01, 0.25, 0.05, 0.5);
    return [kick, snare, hat, ohat, clap, rim, shaker, snap, tomL, tomH, conga, bell, ride, bass, stab, blip];
  }

