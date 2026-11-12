  // ---------- Piano à l'écran (onglet SONS) : des notes seules, sans le MPK, avec glissé d'une touche à l'autre ----------
  let pBase = store.get("pianoBase", 48), pianoOpen = store.get("piano", false);
  const pDown = new Map();   // pointeur → note tenue
  function pianoKeys() {
    const wrap = $("pKeys"); wrap.innerHTML = "";
    const oct = document.documentElement.classList.contains("desk") ? 3 : 2, whites = [], blacks = [];
    for (let n = pBase; n <= pBase + oct * 12; n++) { const pc = n % 12; ([1, 3, 6, 8, 10].includes(pc) ? blacks : whites).push(n); }
    const W = whites.length;
    whites.forEach((n, i) => { const k = document.createElement("div"); k.className = "pk w" + (n % 12 === 0 ? " c" : ""); k.dataset.n = n; k.style.left = (i / W * 100) + "%"; k.style.width = (100 / W) + "%"; if (n % 12 === 0) k.textContent = "C" + (Math.floor(n / 12) - 1); wrap.appendChild(k); });
    blacks.forEach(n => { const i = whites.indexOf(n - 1); const k = document.createElement("div"); k.className = "pk b"; k.dataset.n = n; k.style.left = ((i + 1) / W * 100 - 100 / W * 0.32) + "%"; k.style.width = (100 / W * 0.64) + "%"; wrap.appendChild(k); });
    $("pOct").textContent = "C" + (Math.floor(pBase / 12) - 1);
  }
  function pianoOn(n, id) {
    if (!ctx) return;
    const el = document.querySelector(`.pk[data-n="${n}"]`); if (el) el.classList.add("on");
    if (instCur === "pad") { playKey(n, 0.85); return; }
    if (!instBus) enterSons();
    releaseKey("s" + id);
    const v = noteOn(n, 0.85); if (v) activeKeys.set("s" + id, [v]);
    onFirstNote(ctx.currentTime);
    lcd("lcdPad", "PIANO", NN[n % 12] + (Math.floor(n / 12) - 1));
  }
  function pianoOff(n, id) { const el = document.querySelector(`.pk[data-n="${n}"]`); if (el) el.classList.remove("on"); if (instCur !== "pad") releaseKey("s" + id); }
  const keyAt = (x, y) => { const e = document.elementFromPoint(x, y); return e && e.classList && e.classList.contains("pk") ? +e.dataset.n : null; };
  $("pKeys").addEventListener("pointerdown", e => {
    const n = keyAt(e.clientX, e.clientY); if (n === null) return;
    e.preventDefault(); $("pKeys").setPointerCapture(e.pointerId);
    pDown.set(e.pointerId, n); pianoOn(n, e.pointerId);
  });
  $("pKeys").addEventListener("pointermove", e => {
    if (!pDown.has(e.pointerId)) return;
    const n = keyAt(e.clientX, e.clientY), was = pDown.get(e.pointerId);
    if (n === null || n === was) return;
    pianoOff(was, e.pointerId); pDown.set(e.pointerId, n); pianoOn(n, e.pointerId);
  });
  ["pointerup", "pointercancel"].forEach(ev => $("pKeys").addEventListener(ev, e => { if (!pDown.has(e.pointerId)) return; pianoOff(pDown.get(e.pointerId), e.pointerId); pDown.delete(e.pointerId); }));
  function setPiano(open) { pianoOpen = open; store.set("piano", open); $("piano").hidden = !open; $("pianoBtn").hidden = open; if (open) pianoKeys(); }
  $("pianoBtn").addEventListener("click", () => setPiano(true));
  $("pClose").addEventListener("click", () => setPiano(false));
  $("pOctDown").addEventListener("click", () => { pBase = Math.max(24, pBase - 12); store.set("pianoBase", pBase); pianoKeys(); });
  $("pOctUp").addEventListener("click", () => { pBase = Math.min(84, pBase + 12); store.set("pianoBase", pBase); pianoKeys(); });
  setPiano(pianoOpen);
