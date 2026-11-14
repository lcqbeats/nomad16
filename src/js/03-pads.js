  // ---------- Pads ----------
  const padEls = [];
  let padDrag = null;
  for (let row = 3; row >= 0; row--) {
    for (let col = 0; col < 4; col++) {
      const i = row * 4 + col;
      const b = document.createElement("button");
      b.type = "button"; b.id = "pad" + (i + 1);
      b.className = "pad " + (i < 8 ? "bank1" : "bank2");
      b.addEventListener("pointerdown", e => { e.preventDefault(); b.setPointerCapture(e.pointerId); padDrag = { from: i, x0: e.clientX, y0: e.clientY, moved: false }; select(i); playPad(i, 0.9); });
      b.addEventListener("pointermove", e => {
        if (!padDrag || padDrag.from !== i) return;
        if (Math.hypot(e.clientX - padDrag.x0, e.clientY - padDrag.y0) > 18) padDrag.moved = true;
        padEls.forEach(p => p.classList.remove("dragover"));
        if (padDrag.moved) { const el = document.elementFromPoint(e.clientX, e.clientY); const j = padEls.findIndex(p => p.contains(el)); if (j >= 0 && j !== i) padEls[j].classList.add("dragover"); }
      });
      b.addEventListener("pointerup", e => {
        padRelease(i); padUp(i);
        padEls.forEach(p => p.classList.remove("dragover"));
        const d = padDrag; padDrag = null;
        if (d && d.moved) { const el = document.elementFromPoint(e.clientX, e.clientY); const j = padEls.findIndex(p => p.contains(el)); if (j >= 0 && j !== i) openPadMenu(i, j); }
      });
      b.addEventListener("pointercancel", () => { padDrag = null; padRelease(i); padUp(i); });
      $("pads").appendChild(b);
      padEls[i] = b;
    }
  }
  function drawPads() { padEls.forEach((b, i) => { b.innerHTML = `<span class="n">${String(i + 1).padStart(2, "0")} · ${BASE_NOTE + i}</span><span class="m">PAD ${i + 1}</span><span class="name">${names[i] || "—"}</span>`; }); }
  drawPads();
  function select(i) {
    padEls[selected].classList.remove("sel"); selected = i; padEls[i].classList.add("sel");
    const p = padParams[i];
    if (typeof syncPlayKnobs === "function" && padParams) syncPlayKnobs();
    if ($("edBtn")) { $("edBtn").textContent = `ÉDITER ${String(i + 1).padStart(2, "0")}`; $("edBtn").title = (names[i] || "—").toUpperCase(); if (typeof drawMicTxt === "function") drawMicTxt(); if (!$("editor").hidden) drawEditor(); }
  }
  select(0);
  function flash(i) { const el = padEls[i]; el.classList.add("hit"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("hit"), 110); }

