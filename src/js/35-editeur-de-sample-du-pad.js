  // ---------- Éditeur de sample du pad ----------
  const ecv = $("edCanvas"), eg = ecv.getContext("2d");
  let edDrag = null;
  $("edBtn").addEventListener("click", () => { $("editor").hidden = !$("editor").hidden; $("edBtn").classList.toggle("on", !$("editor").hidden); drawEditor(); });
  function drawEditor() {
    if ($("editor").hidden) return;
    fitCanvas(ecv);
    const W = ecv.width, H = ecv.height, d = window.devicePixelRatio || 1, p = padParams[selected], b = buffers[selected];
    eg.clearRect(0, 0, W, H);
    if (!b) { eg.fillStyle = "#5d574f"; eg.font = `${12 * d}px IBM Plex Mono, monospace`; eg.textAlign = "center"; eg.fillText("pad vide", W / 2, H / 2); return; }
    const x = b.getChannelData(0), L = x.length, mid = H / 2;
    eg.fillStyle = "rgba(217,43,47,.14)"; eg.fillRect(p.start * W, 0, (p.end - p.start) * W, H);
    eg.fillStyle = "#cfc6b6";
    for (let px = 0; px < W; px++) { const s0 = Math.floor(px / W * L), e0 = Math.floor((px + 1) / W * L); let mn = 0, mx = 0; for (let k = s0; k < e0; k += 3) { const v = x[k]; if (v < mn) mn = v; if (v > mx) mx = v; } eg.fillRect(px, mid - mx * mid * 0.95, 1, Math.max(1, (mx - mn) * mid * 0.95)); }
    eg.fillStyle = "#d92b2f"; eg.fillRect(p.start * W - d, 0, 3 * d, H); eg.fillRect(p.end * W - 2 * d, 0, 3 * d, H);
    eg.fillStyle = "#ece3d3"; eg.font = `${10 * d}px IBM Plex Mono, monospace`; eg.textAlign = "left";
    eg.fillText(`${(p.start * b.duration).toFixed(2)} s → ${(p.end * b.duration).toFixed(2)} s${p.fit !== 1 ? " · ×" + p.fit.toFixed(2) : ""}`, 4 * d, 12 * d);
    $("edShot").textContent = p.oneshot ? "ONE SHOT" : "MAINTENU"; $("edShot").classList.toggle("on", !p.oneshot);
    $("edRev").classList.toggle("on", p.rev); $("edLoop").classList.toggle("on", p.loop);
    $("edChoke").textContent = "MUTE : " + (p.choke ? p.choke : "—"); $("edChoke").classList.toggle("on", !!p.choke);
    $("edFit").textContent = "TEMPO : " + (p.fitBeats ? p.fitBeats + " t" : "—"); $("edFit").classList.toggle("on", !!p.fitBeats);
    const busy = p.fitBeats && p.fitMode && !stretched(selected);
    $("edMode").textContent = "MODE : " + ["RE-PITCH", "BEATS", "MODERNE"][p.fitMode || 0] + (busy ? " …" : "");
    [["edEqL", "eqL"], ["edEqM", "eqM"], ["edEqH", "eqH"]].forEach(([id, k]) => { $(id).value = p[k]; $(id + "V").textContent = (p[k] > 0 ? "+" : "") + p[k] + " dB"; });
    $("edAtt").value = p.att; $("edAttV").textContent = Math.round(p.att * p.att * 1500) + " ms";
    $("edRel").value = p.rel; $("edRelV").textContent = Math.round((0.01 + p.rel * p.rel * 3) * 1000) + " ms";
    $("edTone").value = p.tone; $("edToneV").textContent = Math.abs(p.tone - 0.5) <= 0.03 ? "neutre" : p.tone < 0.5 ? "sourd" : "brillant";
  }
  ecv.addEventListener("pointerdown", e => {
    const r = ecv.getBoundingClientRect(), f = (e.clientX - r.left) / r.width, p = padParams[selected];
    edDrag = { which: Math.abs(f - p.start) < Math.abs(f - p.end) ? "start" : "end", before: kitSnap() };
    ecv.setPointerCapture(e.pointerId);
  });
  ecv.addEventListener("pointermove", e => {
    if (!edDrag) return;
    const r = ecv.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), p = padParams[selected];
    if (edDrag.which === "start") p.start = Math.min(f, p.end - 0.005); else p.end = Math.max(f, p.start + 0.005);
    drawEditor();
  });
  ecv.addEventListener("pointerup", () => { if (!edDrag) return; const before = edDrag.before, after = kitSnap(); edDrag = null; pushHist("début/fin du pad", () => kitRestore(before), () => kitRestore(after)); voice(selected, 0.9, 1); });
  const edToggle = (id, key, label) => $(id).addEventListener("click", () => { kitEdit(label, () => { padParams[selected][key] = !padParams[selected][key]; }); drawEditor(); });
  edToggle("edShot", "oneshot", "one shot / maintenu"); edToggle("edRev", "rev", "reverse"); edToggle("edLoop", "loop", "boucle");
  $("edChoke").addEventListener("click", () => { kitEdit("groupe de mute", () => { const p = padParams[selected]; p.choke = (p.choke + 1) % 7; }); drawEditor(); });
  ["edAtt", "edRel", "edTone", "edEqL", "edEqM", "edEqH"].forEach(id => {
    let before = null;
    $(id).addEventListener("pointerdown", () => { before = kitSnap(); });
    $(id).addEventListener("input", e => { padParams[selected][{ edAtt: "att", edRel: "rel", edTone: "tone", edEqL: "eqL", edEqM: "eqM", edEqH: "eqH" }[id]] = +e.target.value; drawEditor(); syncPlayKnobs(); });
    $(id).addEventListener("change", () => { const b = before || kitSnap(), a = kitSnap(); pushHist("réglage du pad", () => kitRestore(b), () => kitRestore(a)); before = null; });
  });
  // Caler au tempo : la portion choisie dure 1, 2, 4 ou 8 temps (la vitesse change, comme un re-pitch)
  $("edMode").addEventListener("click", () => {
    kitEdit("mode de calage", () => { const p = padParams[selected]; p.fitMode = ((p.fitMode || 0) + 1) % 3; });
    stretchSoon(); drawEditor();
    lcd("lcdPad", "TEMPO", ["RE-PITCH : la vitesse et la hauteur changent", "BEATS : découpe aux attaques, hauteur gardée", "MODERNE : étirement fluide, hauteur gardée"][padParams[selected].fitMode]);
  });
  $("edFit").addEventListener("click", () => {
    const b = buffers[selected]; if (!b) return;
    kitEdit("calage au tempo", () => {
      const p = padParams[selected], order = [0, 1, 2, 4, 8], nb = order[(order.indexOf(p.fitBeats) + 1) % order.length];
      p.fitBeats = nb;
      p.fit = nb ? ((p.end - p.start) * b.duration) / (nb * 60 / curBpm()) : 1;
    });
    stretchSoon(); drawEditor(); voice(selected, 0.9, 1);
  });
  function mapBuf(b, fn) { const o = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate); for (let c = 0; c < b.numberOfChannels; c++) o.getChannelData(c).set(fn(b.getChannelData(c), c)); return o; }
  $("edNorm").addEventListener("click", () => {
    const b = buffers[selected]; if (!b) return;
    let pk = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let k = 0; k < d.length; k++) pk = Math.max(pk, Math.abs(d[k])); }
    if (!pk) return;
    kitEdit("normaliser", () => { buffers[selected] = mapBuf(b, d => d.map(v => v / pk * 0.95)); });
    drawEditor();
  });
  $("edCrop").addEventListener("click", () => {
    const b = buffers[selected]; if (!b) return;
    const p = padParams[selected], a = Math.floor(p.start * b.length), e2 = Math.ceil(p.end * b.length);
    if (e2 - a < 64) return;
    kitEdit("tronquer", () => {
      const o = ctx.createBuffer(b.numberOfChannels, e2 - a, b.sampleRate);
      for (let c = 0; c < b.numberOfChannels; c++) o.getChannelData(c).set(b.getChannelData(c).subarray(a, e2));
      buffers[selected] = o; p.start = 0; p.end = 1;
    });
    drawEditor();
  });
  $("edReset").addEventListener("click", () => { kitEdit("réinitialiser le pad", () => { padParams[selected] = { ...PDEF }; }); drawEditor(); });

  // Remplacer le son du pad : n'importe quel son des kits fournis, des kits perso, des chops, ou un fichier
  const edSrcCache = new Map();
  async function edSrcFill() {
    const sel = $("edSrc"), keep = sel.value;
    const groups = [];
    groups.push({ label: "NOMAD SYNTH", items: SYNTH_NAMES.map((n, i) => ({ v: `synth|${i}`, n })) });
    for (const k of kitIndex) {
      if (k.id === "synth" || k.id === "chops" || k.user) continue;
      try { if (!edSrcCache.has(k.id)) edSrcCache.set(k.id, await (await fetch(`kits/${k.id}/kit.json`)).json()); groups.push({ label: k.name, items: edSrcCache.get(k.id).pads.map((p, i) => ({ v: `kit|${k.id}|${i}`, n: p.name })) }); } catch (e) {}
    }
    if (chopKit.buffers.length) groups.push({ label: "MES CHOPS", items: chopKit.names.map((n, i) => ({ v: `chop|${i}`, n })) });
    try { const mine = await DB.all("kits"); mine.forEach(k => groups.push({ label: k.name, items: k.names.map((n, i) => ({ v: `user|${k.id}|${i}`, n })) })); } catch (e) {}
    sel.innerHTML = `<option value="">— remplacer le son du pad par… —</option><option value="file">un fichier de l'appareil…</option>` +
      groups.map(g => `<optgroup label="${g.label.replace(/"/g, "")}">${g.items.map(it => `<option value="${it.v}">${(it.n || "—").replace(/</g, "")}</option>`).join("")}</optgroup>`).join("");
    sel.value = keep && [...sel.options].some(o => o.value === keep) ? keep : "";
  }
  async function edSrcBuffer(v) {
    const [kind, a, b] = v.split("|");
    if (kind === "synth") return { buf: synthBuffers[+a], name: SYNTH_NAMES[+a], gain: 1 };
    if (kind === "chop") return { buf: chopKit.buffers[+a], name: chopKit.names[+a], gain: 1 };
    if (kind === "kit") { const kj = edSrcCache.get(a), p = kj.pads[+b], ab = await (await fetch(`kits/${a}/${p.file}`)).arrayBuffer(); return { buf: await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)), name: p.name, gain: p.gain ?? 1 }; }
    if (kind === "user") { const k = await DB.get("kits", a); return { buf: unpackBuf(k.bufs[+b]), name: k.names[+b], gain: k.gains ? k.gains[+b] : 1 }; }
    return null;
  }
  function edSrcApply(r) {
    if (!r || !r.buf) return;
    const i = selected;
    kitEdit(`son du pad ${i + 1}`, () => {
      buffers[i] = r.buf; names[i] = r.name; gains[i] = r.gain;
      padParams[i] = { ...PDEF };
      const rule = hatsSoft && HAT_RULES.find(([re]) => re.test(r.name || "")); if (rule) Object.assign(padParams[i], rule[1]);
    });
    syncPlayKnobs(); drawEditor(); voice(i, 0.9, 1);
    lcd("lcdPad", "PAD", `${String(i + 1).padStart(2, "0")} ← ${r.name}`);
  }
  $("edSrc").addEventListener("focus", edSrcFill);
  $("edSrc").addEventListener("pointerdown", edSrcFill);
  $("edSrc").addEventListener("change", async e => {
    const v = e.target.value; e.target.value = "";
    if (!v || !ctx) return;
    if (v === "file") { $("edFile").click(); return; }
    try { edSrcApply(await edSrcBuffer(v)); } catch (err) { lcd("lcdPad", "PAD", "son introuvable (hors ligne ?)"); }
  });
  $("edFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f || !ctx) return;
    try { const buf = await new Promise(async (res, rej) => ctx.decodeAudioData(await f.arrayBuffer(), res, rej)); edSrcApply({ buf, name: f.name.replace(/\.[^.]+$/, "").slice(0, 16), gain: 1 }); }
    catch (err) { lcd("lcdPad", "PAD", "fichier illisible"); }
  });
