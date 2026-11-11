  // ---------- Projets ----------
  async function saveProject(name, fixedId) {
    const id = fixedId || "proj-" + Date.now().toString(36);
    const p = {
      id, name: name.toUpperCase().slice(0, 40), created: Date.now(),
      kit: kitCur, kitEmbed: (kitCur === "chops") ? { names: names.slice(), gains: gains.slice(), bufs: buffers.map(packBuf) } : null,
      knobs: JSON.parse(JSON.stringify(knobVals)), manualBpm, padParams: padParams.map(p => ({ ...p })), fxTarget,
      song: { steps: SONG.steps, loop: SONG.loop, cur: SQ.cur, nr: NR.idx },
      guitar: { amp: G.amp, fx: [...G.fx], preset: G.preset },
      loop: LP.t0F === null ? null : { Lf: LP.Lf, sr, beats: LP.beats, seqs: SQ.list.map(x => x.map(l => ({ k: l.k, m: l.m, vol: l.vol, muted: l.muted, buf: packBuf(l.buf) }))) }
    };
    await DB.put("projects", p);
  }
  async function loadProject(id) {
    const p = await DB.get("projects", id); if (!p || !ctx) return;
    Object.keys(p.knobs).forEach(t => { if (knobVals[t]) knobVals[t] = p.knobs[t].slice(); });
    manualBpm = p.manualBpm || 90;
    for (let k = 0; k < 8; k++) applyFxKnob(k);
    G.amp = p.guitar.amp; G.fx = new Set(p.guitar.fx); G.preset = p.guitar.preset; applyGuitar();
    if (p.kitEmbed) {
      chopKit.buffers = p.kitEmbed.bufs.map(unpackBuf); chopKit.names = p.kitEmbed.names.slice();
      if (!kitIndex.some(k => k.id === "chops")) kitIndex.splice(1, 0, { id: "chops", name: "MES CHOPS", style: "Sampling", desc: "du projet " + p.name });
      await loadKit("chops");
    } else if (kitIndex.some(k => k.id === p.kit)) await loadKit(p.kit);
    if (p.padParams) { padParams = fixParams(p.padParams); select(selected); }
    if (p.fxTarget) setFxTarget(p.fxTarget);
    resetAll();
    SONG.steps = p.song ? JSON.parse(JSON.stringify(p.song.steps)) : [{ s: 0, r: 2 }]; SONG.loop = !!(p.song && p.song.loop); if (p.song) NR.idx = p.song.nr ?? 2; drawNR();
    if (p.loop && p.loop.sr === sr) {
      LP.Lf = p.loop.Lf; LP.beats = p.loop.beats; LP.t0F = Math.round((ctx.currentTime + 0.05) * sr); LP.playing = true;
      const seqs = p.loop.seqs || [p.loop.layers], cur = p.song ? p.song.cur || 0 : 0;
      seqs.forEach((arr, q) => {
        switchNow(q);
        arr.forEach((l, i) => { addLayer(unpackBuf(l.buf), l.k, l.m, false); const L = LP.layers[i]; L.vol = l.vol; L.muted = l.muted; L.gain.gain.value = l.muted ? 0 : l.vol; });
        if (q !== cur) LP.layers.forEach(stopLayer);
      });
      switchNow(cur); LP.playing = false; playAll();
    } else if (p.loop) lcd("lcdLoop", "BOUCLE", "boucles enregistrées à une autre fréquence, non chargées");
    drawSong(true);
    drawKnobs();
    lcd("lcdPad", "PROJET", p.name + " chargé");
  }
  async function renderProjects() {
    let list = []; try { list = await DB.all("projects"); } catch (e) {}
    list.sort((a, b) => b.created - a.created);
    $("projList").innerHTML = list.length ? "" : "<p>Aucun projet pour l'instant.</p>";
    list.forEach(p => {
      const row = document.createElement("div"); row.className = "item-row";
      const b = document.createElement("button"); b.type = "button"; b.className = "kititem";
      const d = new Date(p.created);
      b.innerHTML = `${p.name}<small>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${p.loop ? (p.loop.seqs ? p.loop.seqs.filter(x => x.length).length + " séquence(s)" : p.loop.layers.length + " piste(s)") : "sans boucle"}</small>`;
      b.addEventListener("click", async () => { $("setSheet").hidden = true; await loadProject(p.id); });
      const del = document.createElement("button"); del.type = "button"; del.className = "mini"; del.textContent = "SUPPR.";
      del.addEventListener("click", async () => { if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "SÛR ?"; return; } await DB.del("projects", p.id); renderProjects(); });
      const fb = document.createElement("button"); fb.type = "button"; fb.className = "mini"; fb.textContent = "FICHIER";
      fb.addEventListener("click", () => exportProjectFile(p.id));
      row.appendChild(b); row.appendChild(fb); row.appendChild(del); $("projList").appendChild(row);
    });
  }
  $("offBtn").addEventListener("click", () => warmOffline(true));
  $("backupBtn").addEventListener("click", async () => { $("backupBtn").textContent = "…"; try { await exportBackup(); } catch (e) { lcd("lcdPad", "SAUVEGARDE", "impossible : " + e.message); } $("backupBtn").textContent = "SAUVEGARDE COMPLÈTE (.nomad)"; });
  $("projSave").addEventListener("click", async () => {
    if (!ctx) return;
    const n = $("projName").value.trim() || ("PROJET " + new Date().toLocaleDateString());
    $("projSave").textContent = "…";
    try { await saveProject(n); $("projName").value = ""; await renderProjects(); } catch (e) { lcd("lcdPad", "PROJET", "enregistrement impossible : " + e.name); }
    $("projSave").textContent = "ENREGISTRER";
  });

