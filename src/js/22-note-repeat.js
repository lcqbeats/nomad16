  // ---------- NOTE REPEAT (PADS) : un pad tenu se répète, calé sur la boucle quand elle existe ----------
  const NR_DIVS = [4, 8, 16, 32, 12, 24], NR_NAMES = ["1/4", "1/8", "1/16", "1/32", "1/8T", "1/16T"];
  const NR = { on: false, idx: 2, held: new Map() };
  function padDown(i, vel, t) { if (NR.on) NR.held.set(i, { v: vel, t, last: t }); }
  function padUp(i) { NR.held.delete(i); }
  function nrTick() {
    if (!ctx || !NR.on || !NR.held.size) return;
    const step = 60 / curBpm() * 4 / NR_DIVS[NR.idx], horizon = ctx.currentTime + 0.08;
    const grid = LP.t0F !== null && LP.playing;
    NR.held.forEach((h, p) => {
      const anchor = grid ? LP.t0F / sr : h.t;
      let next = anchor + Math.ceil((h.last + step * 0.5 - anchor) / step) * step;
      while (next < horizon) {
        const when = Math.max(next, ctx.currentTime);
        voice(p, h.v, 1, when); hits.push(when); if (hits.length > 32) hits.shift();
        setTimeout(() => flash(p), Math.max(0, (when - ctx.currentTime) * 1000));
        h.last = next; next += step;
      }
    });
  }
  setInterval(nrTick, 20);
  function drawNR() { $("nrBtn").classList.toggle("on", NR.on); $("nrRate").textContent = NR_NAMES[NR.idx]; }
  function setNR(on) { NR.on = on; if (!on) NR.held.clear(); drawNR(); lcd("lcdPad", "NOTE REPEAT", on ? "activé · " + NR_NAMES[NR.idx] + " · tenez un pad" : "désactivé"); }
  $("nrBtn").addEventListener("click", () => setNR(!NR.on));
  $("nrRate").addEventListener("click", () => { NR.idx = (NR.idx + 1) % NR_DIVS.length; drawNR(); lcd("lcdPad", "NOTE REPEAT", NR_NAMES[NR.idx]); });
  drawNR();

