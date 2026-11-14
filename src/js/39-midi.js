  // ---------- MIDI ----------
  const learned = store.get("cc", []);
  function knobIndex(cc) {
    if (cc >= 70 && cc <= 77) return cc - 70;
    if (cc >= 20 && cc <= 35) return -1;
    let k = learned.indexOf(cc);
    if (k < 0 && learned.length < 8) { learned.push(cc); k = learned.length - 1; store.set("cc", learned); }
    return k;
  }
  let sustainDown = false, undoArmed = true;
  // Pads en mode CC (preset 3) : commandes. Bank 1 = looper, Bank 2 = navigation.
  function padCommand(n) {
    const map = {
      20: togglePlay, 21: undo, 22: () => toggleMute(0), 23: () => toggleMute(1), 24: () => toggleMute(2), 25: () => toggleMute(3), 26: () => toggleMute(4), 27: () => toggleMute(5),
      28: () => stepKit(-1), 29: () => stepKit(1), 30: () => SONG.playing ? (songStop(), stopAll()) : songPlay(), 31: () => selectSeq((SQ.cur + NB - 1) % NB),
      32: () => setNR(!NR.on), 33: () => selectSeq((SQ.cur + 1) % NB),
      34: () => setTab(TABS[(TABS.indexOf(tab) + 1) % TABS.length]), 35: () => { if (G.on) stopInput(); else { startInput(); setTab("guitar"); } }
    };
    if (map[n]) map[n]();
  }
  function onCC(cc, v) {
    if (cc === 64) { const down = v >= 64; if (down && !sustainDown) { if (tab === "sp") spPrintToggle(); else if (tab === "fx") fxPrintToggle(); else if (tab === "play" && !$("micPad").hidden) micToggle(); else recPress(); } sustainDown = down; return; }
    if (cc >= 20 && cc <= 35) { if (v > 0) padCommand(cc); return; }
    const k = knobIndex(cc);
    if (k < 0) return;
    if (tab === "fx" && FX_SPRING.includes(k)) { fxModKnob(k, v); return; }
    if (pickup(k, v)) { knobInput(k, v); knobOwner[k] = { tab, val: knobVals[tab][k] }; }
  }
  // Reprise douce : un potard physique n'agit qu'une fois arrivé à la valeur affichée
  // (après un changement de pad, d'onglet, de preset, un réglage tactile, un annuler...)
  const knobOwner = Array(8).fill(null), knobPhys = Array(8).fill(null);
  function pickup(k, v) {
    const val = v / 127, prev = knobPhys[k]; knobPhys[k] = val;
    if ((tab === "sample" && k === 0) || (tab === "loops" && k === 7) || !knobVals[tab]) return true;
    const cur = knobVals[tab][k], o = knobOwner[k];
    const dial = $("dial" + k), lab = KNOB_LABELS[tab][k];
    if (o && o.tab === tab && Math.abs(o.val - cur) < 1e-6) return true;
    const near = Math.abs(val - cur) <= 3 / 127, crossed = prev !== null && (prev - cur) * (val - cur) <= 0;
    if (near || crossed) { if (dial) dial.classList.remove("pickup"); return true; }
    if (dial) { dial.classList.add("pickup"); dial.style.setProperty("--p", val); clearTimeout(dial._pt); dial._pt = setTimeout(() => dial.classList.remove("pickup"), 1500); }
    lcd("lcdPad", "RATTRAPER", `${lab} ${val < cur ? "▲" : "▼"} ${Math.round(cur * 100)} %`);
    return false;
  }
  function knobInput(k, v) {
    const val = v / 127;
    if (tab === "guitar") {
      if (k < 7) setGuitarKnob(k, val); else { knobVals.guitar[7] = val; applyGuitar(); }
      return;
    }
    if (tab === "fx") { knobVals.fx[k] = val; applyFxKnob(k); $("dial" + k).style.setProperty("--v", val); return; }
    if (tab === "scratch") { knobVals.scratch[k] = val; scrKnob(k); $("dial" + k).style.setProperty("--v", val); return; }
    if (tab === "sample") { sampleKnob(k, v); $("dial" + k).style.setProperty("--v", val); return; }
    if (tab === "guitar") return;
    if (tab === "sp") { knobVals.sp[k] = val; $("dial" + k).style.setProperty("--v", val); applySp(k); return; }   // 7 = découpe, 8 = tout couper / rétablir
    if (tab === "song") {
      knobVals.song[k] = val; $("dial" + k).style.setProperty("--v", val);
      if (k === 7) { lcd("lcdPad", "MÉTRONOME", "volume " + Math.round(val * 100) + " %"); return; }
      knobVals.loops[k] = val;
    }
    if (tab === "sons") { sonsKnob(k, val); $("dial" + k).style.setProperty("--v", knobVals.sons[k]); return; }
    if (tab !== "song") knobVals[tab][k] = val;
    if (tab === "play") applyPlayKnob(k);
    else if (ctx) {
      if (k < 6) { const l = LP.layers[k]; if (l) { l.vol = val; if (!l.muted) l.gain.gain.setTargetAtTime(val, ctx.currentTime, 0.02); } }
      if (k === 6) { loopBus.gain.setTargetAtTime(val, ctx.currentTime, 0.02); if (fxSolo) fxSolo.gain.setTargetAtTime(val, ctx.currentTime, 0.02); }
      if (k === 7 && tab === "loops") { const nl = LEN_ORDER[Math.min(3, Math.floor(val * 4))]; if (nl !== LP.nextLen) setNextLen(nl); }
    }
    $("dial" + k).style.setProperty("--v", val);
  }
  // LOOPER : pads 1-2-3 et 5-6-7 = couper / rétablir les pistes 1 à 6 ; 4 = tout couper, 8 = tout rétablir ;
  // banque B : 9-10-11 et 13-14-15 = solo des pistes 1 à 6, 12 = tape stop puis arrêt, 16 = lecture
  // pads rangés comme les pistes à l'écran : rangée du haut = pistes 1 à 3, rangée du bas = pistes 4 à 6
  const LOOP_MUTE_PADS = { 4: 0, 5: 1, 6: 2, 0: 3, 1: 4, 2: 5 }, LOOP_SOLO_PADS = { 12: 0, 13: 1, 14: 2, 8: 3, 9: 4, 10: 5 };
  function loopPad(idx) {
    if (LOOP_MUTE_PADS[idx] !== undefined) toggleMute(LOOP_MUTE_PADS[idx]);
    else if (LOOP_SOLO_PADS[idx] !== undefined) soloLayer(LOOP_SOLO_PADS[idx]);
    else if (idx === 3) muteAll(true);
    else if (idx === 7) muteAll(false);
    else if (idx === 11) tapeStopAll();
    else if (idx === 15) playLoops();
    flash(idx);
  }
  function onMidi(e) {
    const [st, d1, d2] = e.data;
    const type = st & 0xf0, ch = (st & 0x0f) + 1;
    if (type === 0x90 && d2 > 0) {
      if (ch === 10) padsOnCh10 = true;
      const idx = d1 - BASE_NOTE;
      const isPad = ch === 10 || (!padsOnCh10 && idx >= 0 && idx < 16);
      if (isPad && idx >= 0 && idx < 8 && tab === "sons" && isDrum(instCur)) { drPlay(idx); flash(idx); }
      else if (isPad && idx >= 0 && idx < 16 && tab === "sons" && chordMode && !isDrum(instCur)) { const j = idx % 8; chordOn("p" + idx, j < 7 ? j : 0, d2 / 127, 0, (idx >= 8 ? 1 : 0) + (j === 7 ? 1 : 0)); flash(idx); }
      else if (isPad && idx >= 0 && idx < 16 && tab === "sample" && LC.on && ttSrc && liveChopHit(idx)) { flash(idx); drawDigPads(); }
      else if (isPad && idx >= 0 && idx < 16 && tab === "scratch") scrPad(idx, true, d2 / 127);
      else if (isPad && idx >= 0 && idx < 16 && tab === "fx") fxStart(idx);
      else if (isPad && idx >= 0 && idx < 16 && tab === "sp") { spPad(idx, true); flash(idx); }
      else if (isPad && idx >= 0 && idx < 16 && tab === "loops") loopPad(idx);
      else if (isPad && idx >= 0 && idx < 16) playPad(idx, d2 / 127);
      else if (!isPad && tab === "scratch") { if (!scrBlackKey(d1, true)) scrKey(d1); }
      else if (!isPad && tab === "fx" && fxKey(d1)) {}
      else if (!isPad && tab === "sp" && spKey(d1)) {}
      else if (!isPad && tab === "loops" && bankKey(d1)) {}
      else if (!isPad) playKey(d1, d2 / 127);
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      const idx = d1 - BASE_NOTE;
      if (idx >= 0 && idx < 16 && (ch === 10 || !padsOnCh10) && fxActive === idx) fxStop(idx);
      const isPadOff = ch === 10 || (!padsOnCh10 && idx >= 0 && idx < 16);
      if (isPadOff && idx >= 0 && idx < 16 && spDown[idx]) spPad(idx, false);
      if (!isPadOff) { if (tab !== "scratch") keyOff(d1); else scrBlackKey(d1, false); } else if (idx >= 0 && idx < 16) { if (tab === "scratch") scrPad(idx, false); releaseKey("p" + idx); padRelease(idx); padUp(idx); }
    } else if (type === 0xb0) {
      onCC(d1, d2);
    } else if (type === 0xc0) {
      // PROG CHANGE : banque A = onglets PADS … SP (dans l'ordre), banque B = 8 kits
      const PC_TABS = TABS.filter(t => t !== "song");
      if (d1 < 8) { setTab(PC_TABS[d1]); lcd("lcdPad", "ONGLET", $("tab-" + PC_TABS[d1]).textContent); }
      else if (d1 < 16) { const k = kitIndex.find(x => x.id === PC_KITS[d1 - 8]); if (k) loadKit(k.id); }
    }
  }
  async function initMidi() {
    if (!navigator.requestMIDIAccess) { setMidiStatus("non disponible ici", false); return; }
    try {
      const access = await navigator.requestMIDIAccess();
      const refresh = () => {
        const ins = [...access.inputs.values()];
        ins.forEach(inp => inp.onmidimessage = onMidi);
        setMidiStatus(ins.length ? ins.map(i => i.name).join(", ") : "aucun appareil", ins.length > 0);
        try { TAPLED.outs = [...access.outputs.values()]; } catch (e) {}
      };
      access.onstatechange = refresh;
      refresh();
    } catch (err) { setMidiStatus("refusé (" + err.name + ")", false); }
  }
  let midiStatus = "en attente…";
  function setMidiStatus(txt, ok) { midiStatus = txt; $("trMidi").classList.toggle("ok", ok); lcd("lcdPad", "MIDI", txt); }
  $("trMidi").addEventListener("click", () => lcd("lcdPad", "MIDI", midiStatus));
  // Commandes du looper dans l'écran, disponibles depuis tous les onglets
  $("trRec").addEventListener("pointerdown", e => { e.preventDefault(); recPress(); });
  $("trPlay").addEventListener("click", () => { if (SONG.playing) { songStop(); stopAll(); } else togglePlay(); });
  $("trUndo").addEventListener("click", undo);
  $("trMetro").addEventListener("click", () => { SQ.metro = !SQ.metro; SQ.metroF = 0; drawSeqSel(); lcd("lcdPad", "MÉTRONOME", SQ.metro ? "activé" : "désactivé"); });
  initMidi();
  try { if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nomadMidi) { $("btBox").hidden = false; $("btPair").addEventListener("click", () => window.webkit.messageHandlers.nomadMidi.postMessage({ type: "btpair" })); } } catch (e) {}
  window.nomadMidi = (bytes) => onMidi({ data: bytes });
  window.nomadDbg = { sonsT: { selectInst, keyOn, releaseKey: k => activeKeys.forEach((v, key) => releaseKey(key)) }, DR, drPlay, drStop, scrLoad, newKit, micStop, MIC, edSrcApply, song: SONG, songPrint, setFxTarget, setSpTarget, SQ, selectSeq, bankKey, songPlay, songStop, perfArm, songMigrate, loadKit: id => loadKit(id), get kitIndex() { return kitIndex; }, get duck() { return duckNode; }, setClip: (b, t) => setClip(b, null, t), get clip() { return clip; }, get chops() { return chops; }, get sp() { return sp; }, SCR, scrPhrase, scrInit, autoSave, exportBackup, masterMix, lufsOf, loopStems: () => loopStems(), get sr() { return sr; }, dbClear: async () => { for (const st of ["projects", "kits", "scratch"]) { for (const x of await DB.all(st)) await DB.del(st, x.id); } }, stretched: (i, f) => stretched(i, f), setBuf: (i, b) => { buffers[i] = b; }, get nHits() { return notesAny.length + ':' + hits.length; }, SQ, SONG, NR, LP, selectSeq, copySeq, songPlay, get padParams() { return padParams; }, get buffers() { return buffers; }, get names() { return names; }, get kitIndex() { return kitIndex; }, get hist() { return HIST; }, addLayer, removeLayer, mergeLayers };
  let probe = null;
  window.nomadProbe = () => { if (!probe) { probe = ctx.createAnalyser(); probe.fftSize = 2048; fxMaster.connect(probe); } const a = new Float32Array(2048); probe.getFloatTimeDomainData(a); let m = 0; for (const v of a) m = Math.max(m, Math.abs(v)); return +m.toFixed(3); };
  window.nomadState = () => ({ kit: kitCur, kits: kitIndex.length, bufs: buffers.filter(Boolean).length, names: names.slice(0, 4), t0F: LP.t0F, Lf: LP.Lf, layers: LP.layers.map(l => ({ k: l.k, m: l.m })), pending: LP.pending && { ...LP.pending }, latMs, guitar: { amp: G.amp, preset: G.preset, fx: [...G.fx], on: G.on }, cap: capLatest, now: ctx && ctx.currentTime });

  const KEYS = ["z","x","c","v","a","s","d","f","q","w","e","r","1","2","3","4"];
  window.addEventListener("keydown", e => {
    if (e.repeat || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    // ordinateur : Espace = play / stop, Entrée = REC (dans SP et FX : imprimer sur la piste)
    if (e.key === " ") { e.preventDefault(); if (e.target.blur) e.target.blur(); togglePlay(); return; }
    if (e.key === "Enter") { e.preventDefault(); if (tab === "sp") spPrintToggle(); else if (tab === "fx") fxPrintToggle(); else recPress(); return; }
    if (e.key === "Backspace") { e.preventDefault(); undo(); return; }
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0) { select(i); playPad(i, 0.9); }
  });
