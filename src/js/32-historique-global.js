  // ---------- Historique global (annuler / rétablir) ----------
  const HIST = { stack: [], i: 0 };
  function pushHist(label, undo, redo) { HIST.stack.length = HIST.i; HIST.stack.push({ label, undo, redo }); if (HIST.stack.length > 60) HIST.stack.shift(); HIST.i = HIST.stack.length; drawHist(); }
  function drawHist() { $("undoBtn").disabled = HIST.i === 0; $("redoBtn").disabled = HIST.i >= HIST.stack.length; $("undoBtn").title = HIST.i ? "Annuler : " + HIST.stack[HIST.i - 1].label : ""; }
  function histUndo() { if (!HIST.i) return; const a = HIST.stack[--HIST.i]; a.undo(); lcd("lcdPad", "ANNULÉ", a.label); drawHist(); }
  function histRedo() { if (HIST.i >= HIST.stack.length) return; const a = HIST.stack[HIST.i++]; a.redo(); lcd("lcdPad", "RÉTABLI", a.label); drawHist(); }
  $("undoBtn").addEventListener("click", histUndo);
  $("redoBtn").addEventListener("click", histRedo);
  // Instantané du kit en mémoire (sons, noms, réglages)
  const kitSnap = () => ({ b: buffers.slice(), n: names.slice(), g: gains.slice(), p: padParams.map(x => ({ ...x })) });
  const kitRestore = k => { buffers = k.b.slice(); names = k.n.slice(); gains = k.g.slice(); padParams = k.p.map(x => ({ ...x })); drawPads(); select(selected); };
  function kitEdit(label, fn) { const before = kitSnap(); fn(); const after = kitSnap(); pushHist(label, () => kitRestore(before), () => kitRestore(after)); drawPads(); select(selected); }

  $("allPadsBtn").addEventListener("click", () => {
    allPads = !allPads; $("allPadsBtn").classList.toggle("on", allPads); $("allPadsBtn").setAttribute("aria-pressed", allPads);
    lcd("lcdPad", "POTARDS", allPads ? "agissent sur les 16 pads" : "agissent sur le pad choisi");
  });

  $("fullBtn").addEventListener("click", () => { fullLevel = !fullLevel; store.set("full", fullLevel); $("fullBtn").classList.toggle("on", fullLevel); lcd("lcdPad", "FULL LEVEL", fullLevel ? "toutes les frappes à pleine vélocité" : "vélocité selon la frappe"); });
  $("fullBtn").classList.toggle("on", fullLevel);

