  // ---------- Onglets ----------
  const TABS = ["play", "loops", "sons", "sample", "scratch", "guitar", "fx", "sp", "song"]; // même ordre sur téléphone et ordinateur : jouer, matière, finition
  function setTab(t) {
    tab = t;
    TABS.forEach(x => { $("tab-" + x).setAttribute("aria-selected", x === t); $("view-" + x).hidden = x !== t; });
    $("knobs").hidden = t === "guitar" || t === "scratch";
    drawKnobs();
    if (t === "loops") resizeCanvas();
    if (t === "sample") enterDig();
    if (t === "sons") enterSons();
    if (t === "sp") drawSpPads();
    if (t === "scratch") enterScratch();
    if (t === "song") { for (let k = 0; k < 7; k++) knobVals.song[k] = knobVals.loops[k]; drawKnobs(); drawSong(true); }
  }
  TABS.forEach(x => $("tab-" + x).addEventListener("click", () => setTab(x)));
  // pad PROG CHANGE de l'Akai qui ouvre l'onglet (banque A 1 à 8 ; SONG n'en a pas)
  TABS.filter(t => t !== "song").forEach((t, i) => { $("tab-" + t).dataset.pc = i + 1; });

