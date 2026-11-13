  // ---------- Projets ----------
  // projet en cours : SAVE (en haut de l'écran, ou Cmd/Ctrl+S) l'enregistre à sa place, au fur et à mesure
  let CUR = store.get("curProj", null);
  function setCur(id, name) { CUR = id ? { id, name } : null; store.set("curProj", CUR); drawCur(); }
  function drawCur() {
    const b = $("saveBtn"); if (b) b.title = CUR ? `Enregistrer « ${CUR.name} »` : "Enregistrer un nouveau projet";
    const c = $("curProj"); if (c) c.textContent = CUR ? `Projet en cours : ${CUR.name} · SAVE l'enregistre à sa place` : "Pas de projet en cours : SAVE en crée un";
  }
  async function saveProject(name, fixedId) {
    const id = fixedId || "proj-" + Date.now().toString(36);
    const km = kitIndex.find(k => k.id === kitCur) || {};
    const p = {
      id, name: name.toUpperCase().slice(0, 40), created: Date.now(), origin: fixedId === "proj-auto" ? CUR : null,
      // kit de chops ou kit perso : on l'emporte dans le projet (pour qu'un .nomad ouvert ailleurs ait ses sons)
      kit: kitCur, kitEmbed: (kitCur === "chops" || km.user) ? { names: names.slice(), gains: gains.slice(), bufs: buffers.map(packBuf16) } : null,
      knobs: JSON.parse(JSON.stringify(knobVals)), knobsV: 3, manualBpm, padParams: padParams.map(p => ({ ...p })), fxTarget,
      song: { steps: SONG.steps, loop: SONG.loop, cur: SQ.cur, nr: NR.idx }, banks: NB,
      guitar: { amp: G.amp, fx: [...G.fx], preset: G.preset },
      loop: LP.t0F === null ? null : { Lf: LP.Lf, sr, beats: LP.beats, seqs: SQ.list.map(x => x.map(l => ({ k: l.k, m: l.m, vol: l.vol, muted: l.muted, pan: l.pan || 0, hp: !!l.hp, notes: l.notes || [], buf: packBuf(l.buf) }))) }
    };
    await DB.put("projects", p);
    return id;
  }
  let saving = false;
  async function quickSave() {
    if (!ctx || saving) return;
    saving = true; const b = $("saveBtn"); b.classList.add("busy");
    try {
      let ok = CUR && await DB.get("projects", CUR.id);
      if (ok) await saveProject(CUR.name, CUR.id);
      else { const d = new Date(), n = `PROJET ${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`; setCur(await saveProject(n), n.toUpperCase()); }
      lcd("lcdPad", "SAVE", `« ${CUR.name} » enregistré à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
      b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 900);
      if (!$("setSheet").hidden) renderProjects();
    } catch (e) { lcd("lcdPad", "SAVE", "enregistrement impossible : " + (e.name || e.message)); }
    b.classList.remove("busy"); saving = false;
  }
  $("saveBtn").addEventListener("click", quickSave);
  window.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); quickSave(); } });
  async function loadProject(id) {
    const p = await DB.get("projects", id); if (!p || !ctx) return;
    Object.keys(p.knobs).forEach(t => { if (knobVals[t]) knobVals[t] = p.knobs[t].slice(); });
    if (!p.knobsV) { knobVals.sons[5] = 1; knobVals.sons[6] = 0; }
    if (!p.knobsV || p.knobsV < 3) { knobVals.sp[6] = 0; knobVals.sp[7] = 1; }   // anciens potards SP : sortie et rien
    if (typeof sonsFxDose === "function") sonsFxDose(true);
    { const f = SP_FX[SPX.cur]; knobVals.sp[0] = f.a; knobVals.sp[1] = f.b; knobVals.sp[2] = SPX.dose; }   // les effets SP gardent leurs propres réglages
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
    SONG.steps = p.song ? JSON.parse(JSON.stringify(p.song.steps)) : []; SONG.loop = !!(p.song && p.song.loop); if (p.song) NR.idx = p.song.nr ?? 2; drawNR();
    if (p.loop && p.loop.sr === sr) {
      LP.Lf = p.loop.Lf; LP.beats = p.loop.beats; LP.t0F = Math.round((ctx.currentTime + 0.05) * sr); LP.playing = true;
      // projet d'avant les banks (séquences A à H, une seule jouait) : les séquences remplies vont dans les banks A, B, C,
      // celle qui jouait reste audible, les autres sont coupées ; le morceau est converti en prises
      const raw = p.loop.seqs || [p.loop.layers], old = !p.banks, curOld = p.song ? p.song.cur || 0 : 0;
      let seqs = raw, cur = Math.min(curOld, NB - 1), map = null, dropped = 0;
      if (old) {
        const ne = raw.map((x, i) => x.length ? i : -1).filter(i => i >= 0);
        let keep = ne.slice(0, NB); if (ne.includes(curOld) && !keep.includes(curOld)) keep = [curOld, ...ne.filter(i => i !== curOld)].slice(0, NB).sort((x, y) => x - y);
        dropped = ne.length - keep.length; map = {}; keep.forEach((o, n) => { map[o] = n; });
        seqs = Array.from({ length: NB }, (_, n) => keep[n] !== undefined ? raw[keep[n]] : []); cur = map[curOld] ?? 0;
      }
      LP.playing = false;
      seqs.slice(0, NB).forEach((arr, q) => {
        showBank(q);
        arr.forEach((l, i) => { addLayer(unpackBuf(l.buf), l.k, l.m, false, l.notes || []); const L = LP.layers[i]; L.vol = l.vol; L.muted = l.muted || (old && q !== cur); L.pan = l.pan || 0; L.hp = !!l.hp; L.gain.gain.value = L.muted ? 0 : l.vol; if (L.pn) { L.pn.pan.value = L.pan; L.hpf.frequency.value = L.hp ? 120 : 10; } });
      });
      showBank(cur); playAll();
      if (old) {
        SONG.steps = songMigrate(SONG.steps, map);
        if (raw.filter(x => x.length).length > 1 || dropped) lcd("lcdLoop", "BANKS", `ancien projet converti : ${Object.keys(map).map(o => SEQ_N[o] + "→" + SEQ_N[map[o]]).join(" ")}` + (dropped ? ` · ${dropped} séquence(s) au-delà de 3 non chargée(s)` : "") + " · banks autres que " + SEQ_N[cur] + " coupées");
      } else songNormalize();
    } else if (p.loop) lcd("lcdLoop", "BOUCLE", "boucles enregistrées à une autre fréquence, non chargées");
    drawSong(true);
    drawKnobs();
    if (id === "proj-auto") { if (p.origin && await DB.get("projects", p.origin.id)) setCur(p.origin.id, p.origin.name); else setCur(null); }
    else setCur(p.id, p.name);
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
      b.innerHTML = `${p.name}<small>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${p.loop ? (p.loop.seqs ? p.loop.seqs.filter(x => x.length).length + (p.banks ? " bank(s)" : " séquence(s)") : p.loop.layers.length + " piste(s)") : "sans boucle"}</small>`;
      b.addEventListener("click", async () => { $("setSheet").hidden = true; await loadProject(p.id); });
      const del = document.createElement("button"); del.type = "button"; del.className = "mini"; del.textContent = "SUPPR.";
      del.addEventListener("click", async () => { if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "SÛR ?"; return; } await DB.del("projects", p.id); if (CUR && CUR.id === p.id) setCur(null); renderProjects(); });
      const fb = document.createElement("button"); fb.type = "button"; fb.className = "mini"; fb.textContent = "FICHIER";
      fb.addEventListener("click", () => exportProjectFile(p.id));
      row.appendChild(b); row.appendChild(fb); row.appendChild(del); $("projList").appendChild(row);
    });
  }
  drawCur();
  $("offBtn").addEventListener("click", () => warmOffline(true));
  $("backupBtn").addEventListener("click", async () => { $("backupBtn").textContent = "…"; try { await exportBackup(); } catch (e) { lcd("lcdPad", "SAUVEGARDE", "impossible : " + e.message); } $("backupBtn").textContent = "SAUVEGARDE COMPLÈTE (.nomad)"; });
  $("projSave").addEventListener("click", async () => {
    if (!ctx) return;
    const n = $("projName").value.trim() || ("PROJET " + new Date().toLocaleDateString());
    $("projSave").textContent = "…";
    try { setCur(await saveProject(n), n.toUpperCase().slice(0, 40)); $("projName").value = ""; await renderProjects(); } catch (e) { lcd("lcdPad", "PROJET", "enregistrement impossible : " + e.name); }
    $("projSave").textContent = "ENREGISTRER SOUS";
  });

