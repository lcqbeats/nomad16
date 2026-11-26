  // ---------- NUMARK DJ2GO2 TOUCH : deck gauche = le son scratché, deck droit = le beat ----------
  // Messages relevés sur l'appareil (et recoupés avec le mapping libre de Mixxx) :
  //   decks : canal 1 (gauche) / 2 (droit) : PLAY note 0, CUE 1, SYNC 2, jog toucher note 6 + rotation CC 6
  //           (01 = +1 cran, 7F = -1), casque note 0x1B, volume CC 0x16, pitch CC 9 ;
  //   pads : canal 5 / 6, notes 1-4 (repères), 9-12 (PAD MODE tenu), 0x11-0x14, 0x21-0x24, 0x31-0x34 (autres modes) ;
  //   milieu : canal 16 : browse CC 0 (+ appui note 6), LOAD A note 2, LOAD B note 3, crossfader CC 8, gain CC 10.
  // Le potard casque est analogique (rien en MIDI). Les LED répondent aux mêmes notes.
  var DJ = { on: false, name: "", out: null, edge: null, edgeT: null, nudgeT: null, filt: 0, vol: 1, tapT: 0, turned: false, gi: -1, led: {}, sel: -1 };
  const DJ_TPR = 236;   // crans du jog par tour (comme dans Mixxx)
  const isDj = name => /dj ?2 ?go ?2|dj2go/i.test(name || "");
  // Bus du beat : boucles du looper et batterie de SONS passent par un filtre (jog droit) et un volume (fader droit)
  var loopIn = null, beatF = null, beatG = null, drumIn = null, drumF = null, drumG = null;
  function buildBeatBus() {
    const chain = (to) => { const i = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "allpass"; i.connect(f); f.connect(g); g.connect(to); return [i, f, g]; };
    [loopIn, beatF, beatG] = chain(loopBus);
    [drumIn, drumF, drumG] = chain(chPads);
  }
  function djFilter(x) {
    DJ.filt = Math.max(-1, Math.min(1, x));
    if (!beatF) return;
    const t = ctx.currentTime, x2 = Math.abs(DJ.filt) < 0.04 ? 0 : DJ.filt;
    [beatF, drumF].forEach(f => {
      if (!x2) { f.type = "allpass"; return; }
      f.type = x2 < 0 ? "lowpass" : "highpass"; f.Q.value = 1.2;
      f.frequency.setTargetAtTime(x2 < 0 ? 20000 * Math.pow(120 / 20000, -x2) : 25 * Math.pow(5000 / 25, x2), t, 0.015);
    });
  }
  function djVol(v) {
    DJ.vol = v;
    if (beatG) { const g = Math.pow(v, 1.6) * 1.1, t = ctx.currentTime; beatG.gain.setTargetAtTime(g, t, 0.02); drumG.gain.setTargetAtTime(g, t, 0.02); }
  }
  const djDelta = v => v > 64 ? v - 128 : v;
  const djGenre = () => DJ.gi >= 0 ? DRUM_GENRES[DJ.gi] : drGenre();
  // ----- deck gauche : la platine -----
  function djJogTouch(down) {
    if (!SCR.node || !SCR.N) { if (down) scrInit(); return; }
    if (down) {
      if (SCR.hand) return;
      const p0 = scrPosNow();
      SCR.hand = { jog: true, p0, pos: p0, t: performance.now(), v: 0, moved: performance.now(), acc: 0, ap: 0, last: 0 };
      SCR.node.port.postMessage({ type: "hand", on: true });
      onFirstNote(ctx.currentTime);
    } else if (SCR.hand && SCR.hand.jog) {
      SCR.node.port.postMessage({ type: "hand", on: false });
      SCR.rep = { pos: SCR.hand.pos, vel: 0, t: performance.now() };
      SCR.hand = null;
    }
  }
  function djJogTurn(d) {
    if (!SCR.node || !SCR.N) return;
    const step = d / DJ_TPR * SCR_REV * SCR.bsr, now = performance.now();
    const h = SCR.hand;
    if (h && h.jog) {   // main posée sur le jog : le disque suit la main
      const dt = Math.max(3, now - h.t);
      h.pos += step; h.v = step; h.t = now; h.moved = now;
      SCR.node.port.postMessage({ type: "tgt", pos: h.pos, dur: Math.round(Math.min(0.025, dt / 1000) * sr) });
      return;
    }
    if (h) return;   // le doigt est sur l'écran
    if (SCR.motor) {   // bord du jog, disque lancé : on le pousse ou on le freine un instant
      SCR.node.port.postMessage({ type: "rate", rate: scrRate() * (1 + Math.sign(d) * Math.min(0.25, 0.04 * Math.abs(d))) });
      clearTimeout(DJ.nudgeT); DJ.nudgeT = setTimeout(scrApply, 90);
      return;
    }
    // bord du jog, disque à l'arrêt : petit déplacement, comme une main qui effleure
    if (!DJ.edge) { DJ.edge = { pos: scrPosNow(), t: now }; SCR.node.port.postMessage({ type: "hand", on: true }); onFirstNote(ctx.currentTime); }
    const dt = Math.max(3, now - DJ.edge.t); DJ.edge.pos += step; DJ.edge.t = now;
    SCR.node.port.postMessage({ type: "tgt", pos: DJ.edge.pos, dur: Math.round(Math.min(0.025, dt / 1000) * sr) });
    clearTimeout(DJ.edgeT);
    DJ.edgeT = setTimeout(() => { if (DJ.edge && !SCR.hand) { SCR.node.port.postMessage({ type: "hand", on: false }); SCR.rep = { pos: DJ.edge.pos, vel: 0, t: performance.now() }; } DJ.edge = null; }, 220);
  }
  function djScratchTab() { if (tab !== "scratch") setTab("scratch"); }
  // ----- deck droit : le beat -----
  const djBeatOn = () => LP.playing || DR.cur >= 0;
  function djBeatPlay() {
    if (LP.t0F !== null && LP.Lf) { if (SONG.playing) { songStop(); stopAll(); } else togglePlay(); return; }
    if (DR.cur >= 0) { drStop(); lcd("lcdPad", "BEAT", "arrêt"); return; }
    drPlay(Math.max(0, DR.last || 0), djGenre());
  }
  function djPattern(i) {
    const g = djGenre(); if (!g.p[i]) { lcd("lcdPad", "BEAT", g.name + " : pas de motif " + (i + 1)); return; }
    drPlay(i, g);
  }
  function djNextGenre(d) {
    const cur = DRUM_GENRES.indexOf(djGenre());
    DJ.gi = (cur + d + DRUM_GENRES.length) % DRUM_GENRES.length;
    const g = DRUM_GENRES[DJ.gi];
    if (LP.t0F === null) drBpmSet(g.bpm);
    if (DR.cur >= 0) drPlay(Math.min(DR.cur, g.p.length - 1), g);
    lcd("lcdPad", "BEAT", `${g.name} · ${Math.round(curBpm())} BPM`);
    drawDj();
  }
  function djTempo(v) {
    if (LP.t0F !== null && LP.Lf) { lcd("lcdPad", "TEMPO", `${Math.round(curBpm())} BPM : fixé par la boucle du looper`); return; }
    // haut du fader = plus lent (comme un pitch de platine) ; milieu = 95 BPM ; 60 à 180
    const x = (64 - v) / 64, bpm = x < 0 ? 95 + x * 35 : 95 + x * 85;
    drBpmSet(bpm); lcd("lcdPad", "TEMPO", Math.round(manualBpm) + " BPM");
    drawDj();
  }
  // ----- entrée MIDI du DJ2GO2 -----
  function djMidi(e) {
    const [st, d1, d2] = e.data, type = st & 0xf0, ch = st & 0x0f, down = type === 0x90 && d2 > 0, isNote = type === 0x90 || type === 0x80;
    if (!ctx) return;
    if (!DJ.on) { DJ.on = true; djLedsAll(); drawDj(); }
    if (ch === 0 || ch === 1) {   // decks
      const L = ch === 0;
      if (type === 0xb0) {
        if (d1 === 6) { if (L) djJogTurn(djDelta(d2)); else { DJ.turned = true; djFilter(DJ.filt + djDelta(d2) / 90); drawDj(); } }
        else if (d1 === 0x16) { if (L) { knobVals.scratch[0] = d2 / 127; scrApply(); if (tab === "scratch" && $("dial0")) $("dial0").style.setProperty("--v", d2 / 127); } else { djVol(d2 / 127); drawDj(); } }
        else if (d1 === 9) { if (L) scrSetPitch((64 - d2) / 64 * 10); else djTempo(d2); }
        return;
      }
      if (!isNote) return;
      if (d1 === 6) {   // toucher du jog
        if (L) { if (down) djScratchTab(); djJogTouch(down); }
        else if (down) { DJ.turned = false; DJ.tapT = performance.now(); }
        else if (!DJ.turned && performance.now() - DJ.tapT < 300) { djFilter(0); lcd("lcdPad", "BEAT", "filtre ouvert"); drawDj(); }
        return;
      }
      if (!down) return;
      if (L) {
        if (d1 === 0) { djScratchTab(); scrInit().then(ok => { if (ok) scrMotor(); }); }
        else if (d1 === 1) { scrToCue(); lcd("lcdPad", "CUE", "le disque revient au repère"); }
        else if (d1 === 2) $("scrSpeed").click();
        else if (d1 === 0x1b) $("scrHam").click();
      } else {
        if (d1 === 0) djBeatPlay();
        else if (d1 === 1) scrInit().then(ok => { if (ok) scrRecTap(); });
        else if (d1 === 2) { undo(); lcd("lcdPad", "LOOPER", "dernière piste retirée"); }
        else if (d1 === 0x1b) $("trMetro").click();
      }
      return;
    }
    if (ch === 4 || ch === 5) {   // pads (quel que soit le mode affiché par l'appareil)
      if (!isNote || d1 === 0) return;
      const hi = d1 & 0xf0, lo = d1 & 0x0f, shift = hi === 0 && lo >= 9 && lo <= 12, i = shift ? lo - 9 : lo - 1;
      if (i < 0 || i > 3) return;
      if (ch === 4) {
        if (shift) { if (down && SCR.cues[i] !== null) scrCueClear(i); return; }
        if (!SCR.node) { if (down) scrInit(); return; }
        scrPad(4 + i, down);
      } else if (down) djPattern(shift ? i + 4 : i);
      return;
    }
    if (ch === 15) {   // milieu
      if (type === 0xb0) {
        if (d1 === 8) { SCR.fader = d2 / 127; scrGate(); }
        else if (d1 === 0) djBrowse(djDelta(d2));
        else if (d1 === 10) { const m = MIX.ch.find(c => c.id === "master"); if (m) { m.vol = d2 / 127; applyMix(); lcd("lcdPad", "MASTER", Math.round(d2 / 127 * 100) + " %"); } }
        return;
      }
      if (!down) return;
      if (d1 === 6) djNextSrc();
      else if (d1 === 2) djLoadA();
      else if (d1 === 3) djNextGenre(1);
    }
  }
  // BROWSE : tourner choisit un son (sans le charger), appuyer change de catégorie, LOAD A le pose sur la platine
  async function djBrowse(d) {
    if (!(await scrInit())) return;
    const sel = $("scrSel"), n = sel.options.length; if (!n) return;
    DJ.sel = ((DJ.sel < 0 ? +sel.value || 0 : DJ.sel) + d + n) % n;
    sel.value = DJ.sel;
    lcd("lcdPad", "BROWSE", sel.options[DJ.sel].textContent + " · LOAD A pour le poser");
  }
  async function djNextSrc() {
    if (!(await scrInit())) return;
    const k = SCR_SRCS.findIndex(x => x[0] === SCR.src), nx = SCR_SRCS[(k + 1) % SCR_SRCS.length];
    const b = [...$("scrSrc").children].find(x => x.dataset.s === nx[0]);
    if (b) b.click();
    DJ.sel = -1; lcd("lcdPad", "BROWSE", "catégorie : " + nx[1]);
  }
  async function djLoadA() {
    djScratchTab();
    if (!(await scrInit())) return;
    const v = DJ.sel >= 0 ? DJ.sel : +$("scrSel").value || 0;
    DJ.sel = -1; await scrPick(0, v);
  }
  // ----- LED -----
  function djSend(st, n, on) { if (DJ.out) try { DJ.out.send([st, n, on ? 0x7f : 0]); } catch (e) {} }
  function djLedsAll() { DJ.led = {}; djLeds(true); }
  function djLeds(force) {
    if (!DJ.out || !ctx) return;
    const blink = (performance.now() % 500) < 250;
    const want = {
      "144,0": SCR.motor, "144,1": SCR.cues && SCR.cues.some(c => c !== null), "144,2": SCR.speed === 45, "144,27": SCR.ham,
      "145,0": djBeatOn(), "145,1": SCR.rec ? blink : LP.pending ? blink : false, "145,2": LP.layers.length > 0, "145,27": SQ.metro
    };
    for (let i = 0; i < 4; i++) { want["148," + (i + 1)] = !!(SCR.cues && SCR.cues[i] !== null) && (SCR.cueIdx !== i || blink || !SCR.motor); want["149," + (i + 1)] = DR.cur === i || (DR.next === i && blink); }
    Object.entries(want).forEach(([k, v]) => { v = !!v; if (force || DJ.led[k] !== v) { DJ.led[k] = v; const [s, n] = k.split(",").map(Number); djSend(s, n, v); } });
  }
  setInterval(() => { if (DJ.on) djLeds(false); }, 120);
  // ----- panneau à l'écran (onglet SCRATCH) -----
  function drawDj() {
    const p = $("djPanel"); if (!p) return;
    p.hidden = !DJ.on;
    if (!DJ.on) return;
    const g = djGenre(), f = Math.abs(DJ.filt) < 0.04 ? "ouvert" : DJ.filt < 0 ? "graves " + Math.round(-DJ.filt * 100) + " %" : "aigus " + Math.round(DJ.filt * 100) + " %";
    $("djBeat").textContent = `BEAT ${djBeatOn() ? "▶" : "■"} · ${LP.t0F !== null && LP.Lf ? "boucle du looper" : g.name} · ${Math.round(curBpm())} BPM · filtre ${f} · volume ${Math.round(DJ.vol * 100)} %`;
  }
  setInterval(() => { if (DJ.on && tab === "scratch") drawDj(); }, 400);
  function djConnected(name, out) {
    DJ.name = name; DJ.out = out || null;
    if (!DJ.on) { DJ.on = true; if (ctx) djLedsAll(); }
    drawDj();
  }
