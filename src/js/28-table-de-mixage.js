  // ---------- Table de mixage ----------
  const MIX = { ch: [
    { id: "pads", name: "PADS", vol: 0.894, mute: false, solo: false },
    { id: "sons", name: "SONS", vol: 0.894, mute: false, solo: false },
    { id: "gtr", name: "GUITARE", vol: 0.894, mute: false, solo: false },
    { id: "loop", name: "LOOPER", vol: 0.9, mute: false, solo: false },
    { id: "master", name: "MASTER", vol: 1, mute: false, solo: false }] };
  (store.get("mix", null) || []).forEach((v, i) => { if (MIX.ch[i]) Object.assign(MIX.ch[i], { vol: v.vol, mute: false, solo: false }); });
  const mixNode = id => ({ pads: chPads, sons: chSons, gtr: chGtr, master: chMaster })[id];
  const mixAn = {};
  function applyMix() {
    if (!ctx || !chPads) return;
    const anySolo = MIX.ch.some(c => c.solo && c.id !== "master"), t = ctx.currentTime;
    MIX.ch.forEach(c => {
      const on = c.id === "master" ? !c.mute : !c.mute && (!anySolo || c.solo), g = on ? Math.pow(c.vol, 2) * 1.25 : 0;
      if (c.id === "loop") { knobVals.loops[6] = c.vol; loopBus.gain.setTargetAtTime(on ? c.vol : 0, t, 0.02); if (fxSolo) fxSolo.gain.setTargetAtTime(on ? c.vol : 0, t, 0.02); }
      else mixNode(c.id).gain.setTargetAtTime(c.id === "master" ? (on ? c.vol : 0) : g, t, 0.02);
    });
    store.set("mix", MIX.ch.map(c => ({ vol: c.vol })));
  }
  function buildMixer() {
    const el = $("mixer"); el.innerHTML = "";
    MIX.ch.forEach(c => {
      const d = document.createElement("div"); d.className = "mch";
      d.innerHTML = `<b>${c.name}</b><div class="fader"><i class="meter"></i><div class="cap"></div></div><span class="val"></span><div class="mb"><button type="button" class="m">M</button>${c.id === "master" ? "" : '<button type="button" class="s">S</button>'}</div>`;
      const fd = d.querySelector(".fader"), cap = d.querySelector(".cap"), val = d.querySelector(".val");
      const draw = () => { cap.style.top = ((1 - c.vol) * 152) + "px"; val.textContent = c.vol <= 0.001 ? "-∞" : (20 * Math.log10(c.id === "loop" || c.id === "master" ? c.vol : Math.pow(c.vol, 2) * 1.25)).toFixed(1) + " dB"; d.querySelector(".m").classList.toggle("on", c.mute); const sb = d.querySelector(".s"); if (sb) sb.classList.toggle("on", c.solo); };
      let y0 = 0, v0 = 0;
      fd.addEventListener("pointerdown", e => { fd.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = c.vol; });
      fd.addEventListener("pointermove", e => { if (!fd.hasPointerCapture(e.pointerId)) return; c.vol = Math.min(1, Math.max(0, v0 + (y0 - e.clientY) / 152)); applyMix(); draw(); });
      fd.addEventListener("dblclick", () => { c.vol = c.id === "loop" ? 0.9 : 0.894; applyMix(); draw(); });
      d.querySelector(".m").addEventListener("click", () => { c.mute = !c.mute; applyMix(); draw(); });
      const sb = d.querySelector(".s"); if (sb) sb.addEventListener("click", () => { c.solo = !c.solo; applyMix(); MIX.redraw(); });
      c.draw = draw; c.meter = d.querySelector(".meter"); draw(); el.appendChild(d);
    });
    MIX.redraw = () => MIX.ch.forEach(c => c.draw());
  }
  function drawMixMeters() {
    if ($("mixSheet").hidden || !ctx) return;
    MIX.ch.forEach(c => {
      const node = c.id === "loop" ? loopBus : mixNode(c.id); if (!node) return;
      if (!mixAn[c.id]) { mixAn[c.id] = ctx.createAnalyser(); mixAn[c.id].fftSize = 256; node.connect(mixAn[c.id]); }
      const v = level(mixAn[c.id]); c.meter.style.height = Math.min(170, Math.sqrt(v) * 170) + "px"; c.meter.style.background = v > 0.9 ? "var(--red)" : "var(--green)";
    });
  }
  $("mixBtn").addEventListener("click", () => { buildMixer(); $("mixSheet").hidden = false; });
  $("mixClose").addEventListener("click", () => { $("mixSheet").hidden = true; });

