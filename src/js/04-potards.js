  // ---------- Potards (rangée commune) ----------
  const knobEls = [];
  for (let k = 0; k < 8; k++) {
    const d = document.createElement("div");
    d.className = "knob";
    d.innerHTML = `<div class="dial" id="dial${k}" role="slider" tabindex="0" aria-labelledby="klab${k}"></div><label for="dial${k}" id="klab${k}"></label>`;
    $("knobs").appendChild(d);
    // Glisser vers le haut ou vers le bas sur le potard de l'écran, comme sur une appli de MPC
    const dial = d.querySelector(".dial");
    let y0 = 0, v0 = 0;
    dial.addEventListener("pointerdown", e => { e.preventDefault(); dial.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = knobVals[tab][k]; if (tab === "fx") fxGlideStop(k); });
    ["pointerup", "pointercancel"].forEach(ev => dial.addEventListener(ev, () => { if (tab === "fx" && FX_SPRING.includes(k)) fxSpringBack(k); }));
    dial.addEventListener("pointermove", e => {
      if (!dial.hasPointerCapture(e.pointerId) || KNOB_LABELS[tab][k] === "—") return;
      const nv = Math.min(1, Math.max(0, v0 + (y0 - e.clientY) / 160));
      knobInput(k, Math.round(nv * 127));
    });
    knobEls.push(d);
  }
  function drawKnobs() {
    if (!$("klab0")) return;
    for (let k = 0; k < 8; k++) {
      const label = KNOB_LABELS[tab][k];
      $("klab" + k).textContent = label;
      knobEls[k].classList.toggle("off", label === "—");
      const dial = $("dial" + k);
      dial.style.setProperty("--v", knobVals[tab][k]);
      dial.style.setProperty("--kc", tab === "loops" && k < 6 ? COLORS[k] : tab === "fx" ? "var(--green)" : tab === "guitar" ? "#d9b968" : tab === "scratch" ? "#a8dd3a" : "var(--red)");
    }
  }
  drawKnobs();

