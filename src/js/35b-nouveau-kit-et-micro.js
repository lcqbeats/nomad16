  // ---------- PADS : nouveau kit (vide), sauvegarde automatique des kits perso, prise de son au micro ----------
  async function newKit() {
    if (!ctx) return;
    const n = (await DB.all("kits").catch(() => [])).filter(k => !k.auto).length + 1;
    const v = await askName("NOM DU NOUVEAU KIT", "MON KIT " + n, 30); if (!v) return;
    const id = "user-" + Date.now().toString(36);
    await DB.put("kits", { id, name: v.slice(0, 30), names: new Array(16).fill(""), gains: new Array(16).fill(1), params: null, chokeAll: false, bufs: new Array(16).fill(null), created: Date.now() });
    await refreshUserKits(); $("kitSheet").hidden = true; await loadKit(id);
    select(0); $("micPad").hidden = false; $("micPadBtn").classList.add("on"); drawMicWave();
    lcd("lcdPad", "KIT", v + " : 16 pads vides · ● MICRO, FICHIER ou BIBLIOTHÈQUE pour les remplir");
  }
  $("newKitBtn").addEventListener("click", newKit);
  $("kitNew").addEventListener("click", newKit);
  // un kit perso (créé ici, enregistré, ou chops) garde tout seul les sons posés sur ses pads
  let ukT = null;
  function userKitSaveSoon() {
    const meta = kitIndex.find(k => k.id === kitCur); if (!meta || !meta.user) return;
    clearTimeout(ukT); const id = kitCur;
    ukT = setTimeout(async () => {
      if (kitCur !== id) return;
      try { const rec = await DB.get("kits", id); if (!rec) return;
        Object.assign(rec, { names: names.slice(), gains: gains.slice(), params: padParams.map(p => ({ ...p })), chokeAll: kitChoke, bufs: buffers.map(b => b ? packBuf16(b) : null) });
        await DB.put("kits", rec); } catch (e) {}
    }, 800);
  }
  // Prise de son au micro : la forme d'onde s'affiche pendant l'enregistrement ; à l'arrêt, le son va sur le pad choisi
  var MIC = { rec: null, peaks: [], max: 30 };   // var : lu dès le premier select() des pads
  function drawMicTxt() { if ($("micTxt") && MIC && !MIC.rec) $("micTxt").textContent = `Le son va sur le pad ${String(selected + 1).padStart(2, "0")}. Touchez un pad pour changer de destination ; ● (ou la Sustain) pour lancer et arrêter : la prise est posée tout de suite (↶ pour annuler).`; }
  function drawMicWave() {
    const cv = $("micWave"); if (!cv || $("micPad").hidden) return;
    fitCanvas(cv); const g = cv.getContext("2d"), w = cv.width, h = cv.height; if (!w) return;
    g.fillStyle = "#0f0e0d"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#2a2724"; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    const pk = MIC.peaks, n = Math.max(pk.length, MIC.rec ? Math.ceil(6 * sr / 4096) : 1, 1);   // pendant la prise : 6 s visibles, puis la vue se resserre
    g.fillStyle = MIC.rec ? "#d92b2f" : "#7dff9a";
    for (let i = 0; i < pk.length; i++) { const x = i / n * w, a = Math.min(1, pk[i] * 1.2) * h / 2; g.fillRect(x, h / 2 - a, Math.max(1, w / n), a * 2 || 1); }
    if (MIC.rec) { const t = MIC.rec.n / sr; g.fillStyle = "#ece3d3"; g.font = `${Math.round(h * 0.16)}px VT323, monospace`; g.fillText(`● ${t.toFixed(1)} s / ${MIC.max} s`, 8, h * 0.2); }
  }
  async function micToggle() {
    if (!ctx) return;
    if (MIC.rec) return micStop();
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = ctx.createMediaStreamSource(stream), chunks = [], mute = ctx.createGain(); mute.gain.value = 0;
      const rec = MIC.rec = { stream, src, chunks, n: 0, node: null, mute, pad: selected, acc: 0, cnt: 0 };
      MIC.peaks = [];
      const push = d => {
        if (rec.n >= MIC.max * sr) { micStop(); return; }
        chunks.push(d); rec.n += d.length;
        // un trait de forme d'onde tous les 4096 échantillons
        for (let k = 0; k < d.length; k++) { rec.acc = Math.max(rec.acc, Math.abs(d[k])); if (++rec.cnt >= 4096) { MIC.peaks.push(rec.acc); rec.acc = 0; rec.cnt = 0; } }
      };
      if (hasWorklet) { rec.node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" }); rec.node.port.onmessage = e => push(e.data.l); }
      else { rec.node = ctx.createScriptProcessor(1024, 1, 1); rec.node.onaudioprocess = e => push(e.inputBuffer.getChannelData(0).slice()); }
      src.connect(rec.node); rec.node.connect(mute); mute.connect(ctx.destination);
      $("micRec").textContent = "■ ARRÊTER"; $("micRec").classList.add("on"); $("micPadBtn").classList.add("rec");
      $("micTxt").textContent = `Enregistrement pour le pad ${String(rec.pad + 1).padStart(2, "0")}… (${MIC.max} s max)`;
      const loop = () => { if (MIC.rec !== rec) return; drawMicWave(); requestAnimationFrame(loop); }; loop();
      lcd("lcdPad", "MICRO", `enregistrement · pad ${rec.pad + 1}`);
    } catch (e) { MIC.rec = null; lcd("lcdPad", "MICRO", "micro refusé (" + e.name + ")"); }
  }
  function micStop() {
    const rec = MIC.rec; if (!rec) return; MIC.rec = null;
    try { rec.src.disconnect(); rec.node.disconnect(); rec.mute.disconnect(); } catch (e) {}
    rec.stream.getTracks().forEach(t => t.stop());
    try { if (navigator.audioSession && !(typeof G !== "undefined" && G.on)) navigator.audioSession.type = "playback"; } catch (e) {}
    $("micRec").textContent = "● ENREGISTRER"; $("micRec").classList.remove("on"); $("micPadBtn").classList.remove("rec");
    const n = rec.n; if (n < sr * 0.05) { drawMicTxt(); drawMicWave(); return; }
    const all = new Float32Array(n); let o = 0; rec.chunks.forEach(c => { all.set(c, o); o += c.length; });
    // on coupe le silence du début et de la fin, petit fondu, niveau ramené à -1 dB
    let pk = 0; for (let k = 0; k < n; k++) pk = Math.max(pk, Math.abs(all[k]));
    const th = Math.max(0.01, pk * 0.06); let a = 0, b = n;
    while (a < n && Math.abs(all[a]) < th) a++; while (b > a && Math.abs(all[b - 1]) < th * 0.5) b--;
    a = Math.max(0, a - Math.floor(sr * 0.01)); b = Math.min(n, b + Math.floor(sr * 0.08));
    const len = Math.max(64, b - a), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), g = pk > 0.001 ? 0.89 / pk : 1, f = Math.min(Math.floor(sr * 0.005), len >> 2);
    for (let k = 0; k < len; k++) d[k] = all[a + k] * g * Math.min(1, k / Math.max(1, f), (len - 1 - k) / Math.max(1, f));
    MIC.peaks = []; for (let k = 0; k < len; k += 2048) { let m = 0; for (let j = k; j < Math.min(len, k + 2048); j++) m = Math.max(m, Math.abs(d[j])); MIC.peaks.push(m); }
    const i = rec.pad, dt = new Date(), nm = "MICRO " + String(dt.getHours()).padStart(2, "0") + "H" + String(dt.getMinutes()).padStart(2, "0");
    if (selected !== i) select(i);
    edSrcApply({ buf, name: nm, gain: 1 });
    drawMicWave();
    $("micTxt").textContent = `Pad ${String(i + 1).padStart(2, "0")} ← ${nm} (${(len / sr).toFixed(1)} s). Touchez un autre pad puis ● pour la prise suivante.`;
  }
  $("micPadBtn").addEventListener("click", () => { const h = !$("micPad").hidden; $("micPad").hidden = h; $("micPadBtn").classList.toggle("on", !h); if (!h) { drawMicTxt(); drawMicWave(); } else if (MIC.rec) micStop(); });
  $("micRec").addEventListener("click", micToggle);
  $("micFile").addEventListener("click", () => $("edFile").click());
  $("micLib").addEventListener("click", openSrcSheet);
