  // ---------- Compensation de latence ----------
  let latMs = 0; // volontairement remis à zéro à chaque lancement
  $("latRange").value = latMs; $("latVal").textContent = latMs + " ms";
  $("latRange").addEventListener("input", e => { latMs = +e.target.value; $("latVal").textContent = latMs + " ms"; });
  function updateLatInfo() {
    if (!ctx) return;
    const out = ((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000;
    $("latInfo").textContent = "Latence annoncée par l'appareil : " + (out ? Math.round(out) + " ms" : "inconnue");
  }
  $("gearBtn").addEventListener("click", () => { updateLatInfo(); renderProjects(); renderGlossary(); drawBackupInfo(); drawStoreInfo(); offStatus(store.get("offFull", 0) ? `Tout est prêt hors ligne (le ${new Date(store.get("offFull")).toLocaleDateString()}).` : store.get("offKits", 0) ? "Kits prêts hors ligne. Instruments et sons de scratch : au fur et à mesure, ou bouton ci-dessus." : "Les kits se préparent tout seuls après le démarrage."); $("setSheet").hidden = false; });
  $("setClose").addEventListener("click", () => { $("setSheet").hidden = true; });
  $("calBtn").addEventListener("click", () => {
    if (!ctx || calib) return;
    const T0 = ctx.currentTime + 0.6, clicks = [];
    for (let j = 0; j < 12; j++) {
      const t = T0 + j * 0.5; clicks.push(t);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = j % 4 === 0 ? 1500 : 1000;
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
    }
    calib = { clicks, taps: [] };
    $("calMsg").textContent = "écoutez… frappez dès le 3e clic";
    setTimeout(() => {
      const d = [];
      calib.taps.forEach(t => { let best = null; clicks.slice(2).forEach(c => { const x = t - c; if (x > -0.12 && x < 0.45 && (best === null || Math.abs(x) < Math.abs(best))) best = x; }); if (best !== null) d.push(best); });
      calib = null;
      if (d.length < 4) { $("calMsg").textContent = "pas assez de frappes, recommencez"; return; }
      d.sort((a, b) => a - b);
      const med = Math.max(0, Math.round(d[Math.floor(d.length / 2)] * 1000));
      latMs = Math.min(400, med); $("latRange").value = latMs; $("latVal").textContent = latMs + " ms";
      $("calMsg").textContent = "mesuré : " + latMs + " ms";
    }, (12 * 0.5 + 1.2) * 1000);
  });

