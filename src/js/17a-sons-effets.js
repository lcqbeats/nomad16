  // ---------- SONS : préréglages d'effets (plusieurs traitements enchaînés, un nom qui dit à quoi ça sert) ----------
  const SFX = { id: store.get("sonsFx", "none"), nodes: [], lfos: [], inN: null, outN: null };
  const SONS_FX = [
    ["none", "AUCUN", "le son tel quel"],
    ["dreamy", "DREAMY", "chorus, longue réverbe, aigus adoucis"],
    ["cassette", "CASSETTE", "bande qui pleure, saturation douce, bande passante réduite"],
    ["vintage", "SOUL 70s", "chaud, légèrement compressé, petite plaque"],
    ["radio", "RADIO", "médiums serrés, grain de vieux poste"],
    ["phone", "TÉLÉPHONE", "très étroit et sec"],
    ["underwater", "SOUS L'EAU", "filtre fermé qui ondule lentement"],
    ["dub", "DUB", "écho qui revient longtemps, filtré, réverbe"],
    ["pingpong", "PING-PONG", "écho rebondissant de gauche à droite"],
    ["shimmer", "SHIMMER", "réverbe immense et brillante"],
    ["crunch", "CRUNCH", "saturation et 8 bits"],
    ["wobble", "WOBBLE", "filtre qui respire au tempo"],
    ["tremolo", "TRÉMOLO", "volume qui palpite au tempo"],
    ["close", "TRÈS PROCHE", "sec, compressé, présent"],
    ["far", "LOINTAIN", "voilé, petit, perdu dans la pièce"]
  ];
  const sxBeat = () => 60 / curBpm();
  function sxFxEq(type, f, q = 0.7, gain = 0) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return { i: b, o: b }; }
  function sxFxDrive(k, makeup = 0.8) {
    const w = ctx.createWaveShaper(), c = new Float32Array(2048);
    for (let i = 0; i < c.length; i++) { const x = i / 1023.5 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    w.curve = c; w.oversample = "2x"; const g = ctx.createGain(); g.gain.value = makeup; w.connect(g); return { i: w, o: g };
  }
  function sxFxCrush(bits) {
    const w = ctx.createWaveShaper(), c = new Float32Array(4096), q = Math.pow(2, bits - 1);
    for (let i = 0; i < c.length; i++) { const x = i / 2047.5 - 1; c[i] = Math.round(x * q) / q; }
    w.curve = c; return { i: w, o: w };
  }
  function sxLfo(rate, depth, target, type = "sine") {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); o.start(); SFX.lfos.push(o); return o;
  }
  function sxWetDry(build, wet, dry = 1) {
    const i = ctx.createGain(), o = ctx.createGain(), d = ctx.createGain(), w = ctx.createGain();
    d.gain.value = dry; w.gain.value = wet; i.connect(d); d.connect(o);
    const fx = build(); i.connect(fx.i); fx.o.connect(w); w.connect(o); return { i, o };
  }
  function sxFxChorus(rate, depth, mix) {
    return sxWetDry(() => {
      const i = ctx.createGain(), o = ctx.createGain();
      [-0.7, 0.7].forEach((pan, k) => {
        const d = ctx.createDelay(0.05); d.delayTime.value = 0.012 + k * 0.007;
        sxLfo(rate * (1 + k * 0.13), depth, d.delayTime);
        const p = ctx.createStereoPanner(); p.pan.value = pan; i.connect(d); d.connect(p); p.connect(o);
      });
      return { i, o };
    }, mix, 1);
  }
  function sxFxWow(rate, depth) { const d = ctx.createDelay(0.05); d.delayTime.value = 0.008; sxLfo(rate, depth, d.delayTime); sxLfo(rate * 7.3, depth * 0.15, d.delayTime); return { i: d, o: d }; }
  function sxFxDelay(beats, fb, mix, cut = 2800, ping = false) {
    return sxWetDry(() => {
      const i = ctx.createGain(), o = ctx.createGain(), t = Math.min(1.9, beats * sxBeat());
      if (!ping) {
        const d = ctx.createDelay(2), f = ctx.createBiquadFilter(), g = ctx.createGain();
        d.delayTime.value = t; f.type = "lowpass"; f.frequency.value = cut; g.gain.value = fb;
        i.connect(d); d.connect(f); f.connect(g); g.connect(d); f.connect(o);
      } else {
        const dl = ctx.createDelay(2), dr = ctx.createDelay(2), gl = ctx.createGain(), gr = ctx.createGain(), f = ctx.createBiquadFilter(), m = ctx.createChannelMerger(2);
        dl.delayTime.value = t; dr.delayTime.value = t; gl.gain.value = fb; gr.gain.value = fb; f.type = "lowpass"; f.frequency.value = cut;
        i.connect(f); f.connect(dl); dl.connect(gl); gl.connect(dr); dr.connect(gr); gr.connect(dl);
        dl.connect(m, 0, 0); dr.connect(m, 0, 1); m.connect(o);
      }
      return { i, o };
    }, mix, 1);
  }
  function sxFxVerb(dur, decay, mix, hp = 0, lp = 12000, dry = 1) {
    return sxWetDry(() => {
      const c = ctx.createConvolver(); c.buffer = impulse(dur, decay, 0.25);
      let i = c, o = c;
      if (hp) { const h = ctx.createBiquadFilter(); h.type = "highpass"; h.frequency.value = hp; h.connect(c); i = h; }
      const l = ctx.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = lp; c.connect(l); o = l;
      return { i, o };
    }, mix, dry);
  }
  function sxFxComp(th, ratio, makeup = 1.4) { const c = ctx.createDynamicsCompressor(); c.threshold.value = th; c.ratio.value = ratio; c.attack.value = 0.006; c.release.value = 0.15; const g = ctx.createGain(); g.gain.value = makeup; c.connect(g); return { i: c, o: g }; }
  function sxFxGain(v) { const g = ctx.createGain(); g.gain.value = v; return { i: g, o: g }; }
  function sxFxWah(rate, base, depth, q, type = "lowpass") { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = base; f.Q.value = q; sxLfo(rate, depth, f.frequency); return { i: f, o: f }; }
  function sxFxTrem(rate, depth) { const g = ctx.createGain(); g.gain.value = 1 - depth / 2; sxLfo(rate, depth / 2, g.gain, "triangle"); return { i: g, o: g }; }
  function buildSonsFx(id) {
    const b = 1 / sxBeat();
    switch (id) {
      case "dreamy": return [sxFxChorus(0.35, 0.004, 0.7), sxFxEq("lowpass", 5200), sxFxVerb(4.5, 2.2, 0.65, 200)];
      case "cassette": return [sxFxWow(0.55, 0.0018), sxFxDrive(1.8, 0.8), sxFxEq("highpass", 90), sxFxEq("lowpass", 6500), sxFxEq("peaking", 2500, 1, -3)];
      case "vintage": return [sxFxDrive(1.3, 0.85), sxFxEq("lowshelf", 180, 0.7, 3), sxFxEq("lowpass", 9000), sxFxComp(-22, 3, 1.5), sxFxVerb(1.3, 3.5, 0.22, 300, 7000)];
      case "radio": return [sxFxEq("highpass", 400, 0.9), sxFxEq("lowpass", 3500, 0.9), sxFxEq("peaking", 1500, 1.2, 6), sxFxDrive(3, 0.6), sxFxCrush(10)];
      case "phone": return [sxFxEq("highpass", 700, 1.2), sxFxEq("lowpass", 2600, 1.5), sxFxDrive(4, 0.55)];
      case "underwater": return [sxFxWah(0.25, 650, 350, 4), sxFxChorus(0.6, 0.006, 0.6), sxFxVerb(2.5, 2, 0.4, 0, 2500)];
      case "dub": return [sxFxEq("highpass", 120), sxFxDelay(0.75, 0.66, 0.6, 2200), sxFxVerb(2.2, 2.5, 0.25, 300, 5000)];
      case "pingpong": return [sxFxDelay(0.5, 0.55, 0.55, 4500, true)];
      case "shimmer": return [sxFxVerb(7, 1.6, 0.85, 900, 16000), sxFxChorus(0.2, 0.003, 0.4), sxFxEq("highshelf", 6000, 0.7, 4)];
      case "crunch": return [sxFxDrive(6, 0.5), sxFxCrush(8), sxFxEq("lowpass", 7000)];
      case "wobble": return [sxFxWah(b / 2, 900, 750, 6)];
      case "tremolo": return [sxFxTrem(b * 2, 0.85)];
      case "close": return [sxFxEq("highpass", 70), sxFxComp(-26, 5, 1.8), sxFxEq("peaking", 3000, 1, 2.5)];
      case "far": return [sxFxEq("highpass", 350), sxFxEq("lowpass", 2800), sxFxGain(0.6), sxFxVerb(3, 2.2, 0.8, 0, 4000, 0.4)];
      default: return [];
    }
  }
  // Insère la chaîne entre le filtre de SONS et la console (réverbe du potard comprise)
  function applySonsFx(id) {
    if (!ctx || !instFilt) { SFX.id = id; return; }
    SFX.id = id; store.set("sonsFx", id);
    if (!SFX.inN) { SFX.inN = ctx.createGain(); SFX.outN = ctx.createGain(); instFilt.disconnect(); instFilt.connect(SFX.inN); SFX.outN.connect(chSons); SFX.outN.connect(instRevSend); }
    SFX.inN.disconnect(); SFX.lfos.forEach(o => { try { o.stop(); } catch (e) {} }); SFX.lfos = [];
    SFX.nodes.forEach(n => { try { n.o.disconnect(); } catch (e) {} });
    const chain = buildSonsFx(id); SFX.nodes = chain;
    let prev = SFX.inN; chain.forEach(n => { prev.connect(n.i); prev = n.o; }); prev.connect(SFX.outN);
    drawSonsFx();
    const p = SONS_FX.find(x => x[0] === id); if (p) lcd("lcdPad", "EFFET", `${p[1]} · ${p[2]}`);
  }
  function drawSonsFx() {
    const el = $("sonsFx"); if (!el) return;
    el.innerHTML = "";
    SONS_FX.forEach(([id, nm, desc]) => { const b = document.createElement("button"); b.type = "button"; b.className = "stylebtn fxpre" + (id === SFX.id ? " on" : ""); b.textContent = nm; b.title = desc; b.addEventListener("click", () => applySonsFx(id)); el.appendChild(b); });
    const p = SONS_FX.find(x => x[0] === SFX.id); $("sonsFxInfo").textContent = p ? p[2] : "";
  }
