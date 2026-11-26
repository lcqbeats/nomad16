  // ---------- KIT À VARIANTES : les kits de batterie d'un pack réunis dans un seul kit ----------
  // Chaque pad garde son rôle (mapping de Jérémy : 1 kick, 2 snare, 3 hat fermé, 4 hat ouvert, 5 kick 2,
  // 6 snare 2 / clap / rim / roll, 7 hat fermé 2 / shaker, 8 ride ; 9 à 16 = le reste du kit), et chaque pad
  // propose la version de chacun des kits du pack : on passe de l'une à l'autre pad par pad, ou tout le kit d'un coup.
  var VAR = null;   // { id, vars: [[{ buf, name, k }]] par pad, vsel: [index par pad], kits: [noms], g: kit global }
  const VR = {
    kick: /kick|kik|\bbd\b|bass ?drum/i, k808: /808/i, snare: /snare|\bsd\b/i, clap: /clap|snap/i, rim: /rim|stick|side/i, roll: /roll/i,
    open: /open|\boh\b|ohh/i, hat: /hat|\bhh\b|\bch\b|chh|hi-?hat/i, shaker: /shaker|shake|tamb|cabasa|maraca/i, ride: /ride/i, crash: /crash|cymbal/i
  };
  // rôles d'un kit → 16 pads (index du son dans le kit, ou -1)
  function varMap(namesK) {
    const used = new Set(), out = new Array(16).fill(-1);
    const find = (test, avoid) => { for (let i = 0; i < namesK.length; i++) if (!used.has(i) && test(namesK[i]) && !(avoid && avoid(namesK[i]))) { used.add(i); return i; } return -1; };
    const isHat = n => VR.hat.test(n) && !VR.open.test(n), isOpen = n => VR.hat.test(n) && VR.open.test(n);
    const isKick = n => VR.kick.test(n), isSnare = n => VR.snare.test(n);
    const firstOf = (...tests) => { for (const t of tests) { const i = find(t); if (i >= 0) return i; } return -1; };
    out[0] = firstOf(n => isKick(n) && !VR.k808.test(n), isKick);
    out[1] = firstOf(n => isSnare(n) && !VR.clap.test(n), isSnare, n => VR.clap.test(n));
    out[2] = firstOf(isHat);
    out[3] = firstOf(isOpen);
    out[4] = firstOf(isKick, n => VR.k808.test(n));
    out[5] = firstOf(isSnare, n => VR.clap.test(n), n => VR.rim.test(n), n => VR.roll.test(n));
    out[6] = firstOf(isHat, n => VR.shaker.test(n));
    out[7] = firstOf(n => VR.ride.test(n), n => VR.crash.test(n));
    let p = 8; for (let i = 0; i < namesK.length && p < 16; i++) if (!used.has(i)) { used.add(i); out[p++] = i; }
    return out;
  }
  // kits = [{ name, sons: [{ name, buf (AudioBuffer) }] }] → enregistrement du kit à variantes
  function varBuild(kits) {
    const vars = Array.from({ length: 16 }, () => []);
    kits.forEach((kit, k) => {
      const m = varMap(kit.sons.map(s => s.name));
      m.forEach((si, pad) => { if (si >= 0) vars[pad].push({ buf: packBuf16(kit.sons[si].buf), name: kit.sons[si].name, k }); });
    });
    return { vars, vsel: new Array(16).fill(0), kits: kits.map(k => k.name) };
  }
  function varLoad(k) {
    VAR = { id: k.id, vars: k.vars, vsel: (k.vsel || []).slice(), kits: k.kits || [], g: k.vg || 0 };
    for (let i = 0; i < 16; i++) { const n = VAR.vars[i].length; VAR.vsel[i] = n ? Math.min(VAR.vsel[i] || 0, n - 1) : 0; }
    return { bufs: VAR.vars.map((vs, i) => vs.length ? unpackBuf(vs[VAR.vsel[i]].buf) : null), names: VAR.vars.map((vs, i) => vs.length ? vs[VAR.vsel[i]].name : "") };
  }
  let varSaveT = null;
  function varSave() {
    clearTimeout(varSaveT);
    const id = VAR && VAR.id;
    varSaveT = setTimeout(async () => { try { const r = await DB.get("kits", id); if (!r || !VAR || VAR.id !== id) return; r.vsel = VAR.vsel.slice(); r.vg = VAR.g; await DB.put("kits", r); } catch (e) {} }, 600);
  }
  const varKitName = v => (VAR.kits[v.k] || "kit " + (v.k + 1)).replace(/\s*drum kit\s*$/i, "").toUpperCase();
  function varSet(i, v) {
    if (!VAR || !VAR.vars[i] || !VAR.vars[i].length) return;
    const n = VAR.vars[i].length; v = ((v % n) + n) % n; VAR.vsel[i] = v;
    const x = VAR.vars[i][v]; buffers[i] = unpackBuf(x.buf); names[i] = x.name;
    drawPads(); varSave();
    lcd("lcdPad", "VARIANTE", `pad ${i + 1} : ${x.name} · ${varKitName(x)} (${v + 1}/${n})`);
  }
  // tout le kit : chaque pad prend la version du même kit d'origine (s'il l'a)
  function varAll(d) {
    if (!VAR) return;
    const K = VAR.kits.length || 1; VAR.g = ((VAR.g + d) % K + K) % K;
    VAR.vars.forEach((vs, i) => { const j = vs.findIndex(x => x.k === VAR.g); if (j >= 0) { VAR.vsel[i] = j; buffers[i] = unpackBuf(vs[j].buf); names[i] = vs[j].name; } });
    drawPads(); varSave();
    lcd("lcdPad", "VARIANTES", `tout le kit : ${(VAR.kits[VAR.g] || "").toUpperCase()} (${VAR.g + 1}/${K})`);
  }
  function drawVar() {
    const bar = $("varBar"); if (!bar) return;
    bar.hidden = !VAR; if (!VAR) return;
    const i = selected, vs = VAR.vars[i] || [], x = vs[VAR.vsel[i]];
    $("varPad").textContent = vs.length ? `PAD ${String(i + 1).padStart(2, "0")} · ${varKitName(x)} ${VAR.vsel[i] + 1}/${vs.length}` : `PAD ${String(i + 1).padStart(2, "0")} · —`;
    $("varAll").textContent = `TOUT : ${(VAR.kits[VAR.g] || "").replace(/\s*drum kit\s*$/i, "").toUpperCase()}`;
  }
  $("varPrev").addEventListener("click", () => VAR && varSet(selected, VAR.vsel[selected] - 1));
  $("varNext").addEventListener("click", () => VAR && varSet(selected, VAR.vsel[selected] + 1));
  $("varAllPrev").addEventListener("click", () => varAll(-1));
  $("varAllNext").addEventListener("click", () => varAll(1));
