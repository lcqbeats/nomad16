  // ---------- Kits en ligne ----------
  async function loadKitIndex() {
    try {
      const r = await fetch("kits/index.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      kitIndex = kitIndex.slice(0, 1).concat(j.kits);
    } catch (e) { /* hors ligne ou aperçu : seul le kit synthétisé est disponible */ }
    await refreshUserKits();
  }
  async function refreshUserKits() {
    try {
      const mine = await DB.all("kits");
      kitIndex = kitIndex.filter(k => !k.user);
      mine.sort((a, b) => a.created - b.created).forEach(k => kitIndex.push({ id: k.id, name: k.name, style: k.auto ? "Chops" : "Perso", desc: k.auto ? (k.desc || "chops gardés automatiquement") : "kit enregistré dans cet appareil", user: true }));
    } catch (e) {}
  }
  async function saveCurrentKit(name) {
    const id = "user-" + Date.now().toString(36);
    await DB.put("kits", { id, name: name.toUpperCase().slice(0, 30), names: names.slice(), gains: gains.slice(), params: padParams.map(p => ({ ...p })), chokeAll: kitChoke, bufs: buffers.map(packBuf), created: Date.now() });
    await refreshUserKits();
    await loadKit(id);
  }
  function renderKitList() {
    $("kitList").innerHTML = "";
    kitIndex.forEach(k => {
      const row = document.createElement("div"); row.className = "item-row";
      const b = document.createElement("button");
      b.type = "button"; b.className = "kititem" + (k.id === kitCur ? " cur" : "");
      b.innerHTML = `${k.name}<small>${k.style} · ${k.desc}</small>`;
      b.addEventListener("click", () => { $("kitSheet").hidden = true; loadKit(k.id); });
      row.appendChild(b);
      if (k.user) {
        const rn = document.createElement("button"); rn.type = "button"; rn.className = "mini"; rn.textContent = "RENOMMER";
        rn.addEventListener("click", async () => {
          const nn = $("kitSaveName").value.trim(); if (!nn) { $("kitSaveName").focus(); $("kitSaveName").placeholder = "tapez le nouveau nom ici"; return; }
          const rec = await DB.get("kits", k.id); rec.name = nn.toUpperCase().slice(0, 30); await DB.put("kits", rec);
          await refreshUserKits(); if (kitCur === k.id) $("kitName").textContent = rec.name; $("kitSaveName").value = ""; renderKitList();
        });
        const del = document.createElement("button"); del.type = "button"; del.className = "mini"; del.textContent = "SUPPR.";
        del.addEventListener("click", async () => {
          if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "SÛR ?"; return; }
          await DB.del("kits", k.id); await refreshUserKits(); if (kitCur === k.id) loadKit("synth"); renderKitList();
        });
        row.appendChild(rn); row.appendChild(del);
      }
      $("kitList").appendChild(row);
    });
  }
  let kitLoading = 0, userParams = null, userChoke = false;
  async function loadKit(id) {
    if (!ctx) return;
    if (kitCur === "chops" && id !== "chops" && typeof persistChops === "function") persistChops(false);
    const ticket = ++kitLoading;
    const meta = kitIndex.find(k => k.id === id) || kitIndex[0];
    $("kitName").textContent = meta.name + (meta.id === "synth" ? "" : " …");
    if (meta.id === "synth") {
      buffers = synthBuffers.slice(); names = SYNTH_NAMES.slice(); gains = new Array(16).fill(1);
    } else if (meta.id === "chops") {
      buffers = chopKit.buffers.slice(); names = chopKit.names.slice(); gains = new Array(16).fill(1);
    } else if (meta.user) {
      try {
        const k = await DB.get("kits", meta.id);
        if (ticket !== kitLoading) return;
        buffers = k.bufs.map(b => b ? unpackBuf(b) : null); names = k.names.slice(); gains = k.gains ? k.gains.slice() : new Array(16).fill(1);
        userParams = k.params ? k.params.map(p => ({ ...p })) : null; userChoke = !!k.chokeAll;
      } catch (e) { lcd("lcdPad", "PAD", "kit perso illisible"); return; }
    } else {
      try {
        const kit = await (await fetch(`kits/${id}/kit.json`)).json();
        const bufs = await Promise.all(kit.pads.map(async p => {
          const ab = await (await fetch(`kits/${id}/${p.file}`)).arrayBuffer();
          return await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
        }));
        if (ticket !== kitLoading) return;
        buffers = bufs; names = kit.pads.map(p => p.name); gains = kit.pads.map(p => p.gain ?? 1);
      } catch (e) {
        if (ticket !== kitLoading) return;
        lcd("lcdPad", "PAD", "kit introuvable · " + meta.name);
        $("kitName").textContent = kitIndex.find(k => k.id === kitCur).name;
        return;
      }
    }
    if (ticket !== kitLoading) return;
    padParams = (meta.user && userParams) ? fixParams(userParams) : newParams(); userParams = null;
    if (!meta.user && meta.id !== "chops") softHats();
    kitChoke = meta.id === "chops" || !!(meta.user && userChoke); userChoke = false;
    select(selected);
    kitCur = meta.id; store.set("kit", kitCur);
    $("kitName").textContent = meta.name;
    drawPads();
    lcd("lcdPad", "PAD", meta.style.toUpperCase() + " · " + meta.desc);
  }
  // Charleys discrets : hats, shakers et cymbales plus bas, plus courts, un peu étouffés et très sensibles à la frappe,
  // pour accompagner le dialogue kick / caisse claire sans l'écraser (kits fournis seulement ; réglable pad par pad)
  let hatsSoft = store.get("softHats", true);
  const HAT_RULES = [
    [/^(hat|hh|pédale hh|charley|closed)/i, { level: 0.6, decay: 0.6, tone: 0.42, vc: 1.7 }],
    [/open hat|^oh\b/i, { level: 0.55, decay: 0.75, tone: 0.42, vc: 1.6 }],
    [/shaker|tamb|cabasa|maracas/i, { level: 0.6, decay: 0.7, tone: 0.44, vc: 1.6 }],
    [/ride|cymbale|crash|triangle/i, { level: 0.65, tone: 0.44, vc: 1.4 }]
  ];
  function softHats() {
    if (!hatsSoft) return;
    names.forEach((n, i) => { const r = HAT_RULES.find(([re]) => re.test(n || "")); if (r) Object.assign(padParams[i], r[1]); });
  }
  function drawHatsBtn() { $("hatsBtn").textContent = "CHARLEYS DISCRETS : " + (hatsSoft ? "OUI" : "NON"); $("hatsBtn").classList.toggle("on", hatsSoft); }
  drawHatsBtn();
  $("hatsBtn").addEventListener("click", () => {
    hatsSoft = !hatsSoft; store.set("softHats", hatsSoft); drawHatsBtn();
    const meta = kitIndex.find(k => k.id === kitCur);
    if (meta && !meta.user && meta.id !== "chops") { names.forEach((n, i) => { if (HAT_RULES.some(([re]) => re.test(n || ""))) { const p = padParams[i]; ["level", "decay", "tone", "vc"].forEach(k => p[k] = PDEF[k]); } }); softHats(); syncPlayKnobs(); }
  });
  function stepKit(d) { const i = kitIndex.findIndex(k => k.id === kitCur); loadKit(kitIndex[(i + d + kitIndex.length) % kitIndex.length].id); }
  $("kitPrev").addEventListener("click", () => stepKit(-1));
  $("kitNext").addEventListener("click", () => stepKit(1));
  $("kitName").addEventListener("click", () => { renderKitList(); $("kitSheet").hidden = false; });
  $("kitSave").addEventListener("click", async () => {
    if (!ctx) return;
    const n = $("kitSaveName").value.trim() || (kitIndex.find(k => k.id === kitCur).name + " PERSO");
    $("kitSave").textContent = "…";
    try { await saveCurrentKit(n); $("kitSaveName").value = ""; renderKitList(); } catch (e) { lcd("lcdPad", "KIT", "enregistrement impossible"); }
    $("kitSave").textContent = "ENREGISTRER";
  });
  $("kitClose").addEventListener("click", () => { $("kitSheet").hidden = true; });

