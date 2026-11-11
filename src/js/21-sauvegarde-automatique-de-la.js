  // ---------- SAUVEGARDE AUTOMATIQUE de la session, et sauvegarde complète en un fichier ----------
  const AUTO_ID = "proj-auto";
  let autoSig = "", autoBusy = false;
  const sessionSig = () => [SQ.list.map(a => a.length).join(","), HIST.i, HIST.stack.length, kitCur, JSON.stringify(SONG.steps), padParams.map(p => p.level + p.tune + p.decay).join(",")].join("|");
  async function autoSave(force) {
    if (!ctx || autoBusy || SQ.list.every(a => !a.length) && !force) return;
    const sig = sessionSig(); if (sig === autoSig && !force) return;
    autoBusy = true;
    try { await saveProject("SESSION AUTO", AUTO_ID); autoSig = sig; store.set("autoAt", Date.now()); } catch (e) {}
    autoBusy = false;
  }
  setInterval(() => autoSave(false), 45000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") autoSave(false); });
  // Reprendre la dernière session depuis l'écran d'accueil
  (async () => {
    try {
      const p = await DB.get("projects", AUTO_ID); if (!p) return;
      const d = new Date(p.created), b = $("resumeBtn");
      b.textContent = `REPRENDRE LA SESSION DU ${d.toLocaleDateString("fr-FR")} À ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
      b.hidden = false;
      b.addEventListener("click", async () => { try { await powerOn(); await loadProject(AUTO_ID); } catch (e) { $("power").querySelector("p").textContent = "Le son n'a pas pu démarrer : " + e.message; } });
    } catch (e) {}
  })();
  async function exportBackup() {
    const files = [], projects = await DB.all("projects"), kits = await DB.all("kits");
    let scr = []; try { scr = await DB.all("scratch"); } catch (e) {}
    const meta = packAudio({ projects, kits, scratch: scr }, files);
    files.unshift({ name: "projet.json", data: JSON.stringify({ format: "nomad16-sauvegarde", version: 1, data: meta }) });
    const d = new Date();
    await deliver(makeZip(files), `NOMAD16-sauvegarde-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.nomad`, "application/zip");
    store.set("backupAt", Date.now()); drawBackupInfo();
  }
  async function restoreBackup(j, files) {
    const d = unpackAudio(j.data, files);
    for (const p of d.projects || []) await DB.put("projects", p);
    for (const k of d.kits || []) await DB.put("kits", k);
    for (const s of d.scratch || []) await DB.put("scratch", s);
    await refreshUserKits(); await renderProjects();
    lcd("lcdPad", "SAUVEGARDE", `restaurée : ${(d.projects || []).length} projet(s), ${(d.kits || []).length} kit(s), ${(d.scratch || []).length} son(s)`);
  }
  function drawBackupInfo() {
    const t = store.get("backupAt", 0), el = $("backupInfo"); if (!el) return;
    el.textContent = t ? `Dernière sauvegarde complète : ${new Date(t).toLocaleDateString()}.` : "Aucune sauvegarde complète pour l'instant.";
  }
  drawBackupInfo();
