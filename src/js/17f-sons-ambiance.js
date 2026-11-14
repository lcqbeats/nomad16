  // ---------- SONS : ambiance de collection (mesurée sur le morceau) ----------
  // Placée entre les sons et le reste de SONS (filtre, effets, réverbe du potard) : timbre (grave, aigus),
  // largeur stéréo (effet Haas sur les sons mono) et une réverbe propre. LIBRE la retire.
  //   SOBER  : son assez étroit (corrélation G/D 0,94), aigus doux, grave chaud ; petite pièce chaude, réverbe courte.
  //   ALL THINGS : médiums larges (cordes), aigus très tombés au-dessus de 4 kHz, réverbe ~2,5 fois plus longue.
  const AMB_PRESETS = {
    SOBER: { name: "PIÈCE CHAUDE", lp: 9000, shelf: 2, shelfF: 160, width: 0.22, rev: 1.4, revDecay: 3, revDamp: 0.22, send: 0.22, pre: 0.015 },
    "ALL THINGS": { name: "GRANDE SALLE SOMBRE", lp: 5200, shelf: 2.5, shelfF: 120, width: 0.6, rev: 3.4, revDecay: 2.4, revDamp: 0.12, send: 0.34, pre: 0.035 }
  };
  const AMB = { on: store.get("sonsAmb", true), cur: null, n: null };
  const ambOf = id => { const s = allInsts().find(i => i.id === id); return s && AMB_PRESETS[s.cat] ? s.cat : null; };
  function ambBuild() {
    if (AMB.n || !instBus) return;
    const n = AMB.n = {};
    n.shelf = ctx.createBiquadFilter(); n.shelf.type = "lowshelf"; n.shelf.gain.value = 0;
    n.lp = ctx.createBiquadFilter(); n.lp.type = "lowpass"; n.lp.frequency.value = 20000; n.lp.Q.value = 0.5;
    // largeur : gauche = le son, droite = mélange du son et d'une copie retardée de 13 ms
    n.split = ctx.createGain(); n.mer = ctx.createChannelMerger(2);
    n.dry = ctx.createGain(); n.hz = ctx.createDelay(0.05); n.hz.delayTime.value = 0.013; n.wet = ctx.createGain(); n.wet.gain.value = 0;
    n.rDry = ctx.createGain(); n.rDry.gain.value = 1;
    n.split.connect(n.dry); n.dry.connect(n.mer, 0, 0);
    n.split.connect(n.rDry); n.rDry.connect(n.mer, 0, 1);
    n.split.connect(n.hz); n.hz.connect(n.wet); n.wet.connect(n.mer, 0, 1);
    n.out = ctx.createGain();
    n.send = ctx.createGain(); n.send.gain.value = 0; n.pre = ctx.createDelay(0.2); n.cv = ctx.createConvolver();
    instBus.disconnect(); instBus.connect(n.shelf); n.shelf.connect(n.lp); n.lp.connect(n.split); n.mer.connect(n.out); n.out.connect(instFilt);
    n.lp.connect(n.send); n.send.connect(n.pre); n.pre.connect(n.cv); n.cv.connect(chSons);
  }
  function ambApply() {
    if (!ctx || !instBus) return;
    ambBuild();
    const col = AMB.on ? ambOf(instCur) : null, p = col && AMB_PRESETS[col], n = AMB.n, t = ctx.currentTime;
    if (p && AMB.cur !== col) { n.cv.buffer = impulse(p.rev, p.revDecay, p.revDamp); n.pre.delayTime.value = p.pre; }
    AMB.cur = p ? col : null;
    n.shelf.frequency.value = p ? p.shelfF : 150; n.shelf.gain.setTargetAtTime(p ? p.shelf : 0, t, 0.05);
    n.lp.frequency.setTargetAtTime(p ? p.lp : 20000, t, 0.05);
    n.wet.gain.setTargetAtTime(p ? p.width : 0, t, 0.05); n.rDry.gain.setTargetAtTime(p ? 1 - p.width * 0.5 : 1, t, 0.05);
    n.send.gain.setTargetAtTime(p ? p.send : 0, t, 0.05);
    drawAmb();
  }
  function drawAmb() {
    const b = $("ambBtn"), col = ambOf(instCur); if (!b) return;
    b.hidden = !col || isDrum(instCur);
    if (col) b.textContent = AMB.on ? `AMBIANCE : ${col} · ${AMB_PRESETS[col].name}` : "AMBIANCE : LIBRE";
    b.classList.toggle("on", AMB.on && !!col);
  }
  $("ambBtn").addEventListener("click", () => { AMB.on = !AMB.on; store.set("sonsAmb", AMB.on); ambApply();
    lcd("lcdPad", "AMBIANCE", AMB.on ? "celle du morceau (timbre, largeur, réverbe)" : "libre : tes réglages seulement"); });
