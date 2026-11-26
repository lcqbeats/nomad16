  // ---------- PADS : importer un pack de sons (zip ou dossier) → kits perso de 16 pads, un par dossier ----------
  // Les sons restent dans l'appareil (kits perso) : rien n'est envoyé ni publié. Pratique pour les packs gratuits
  // « libres de droits mais à ne pas redistribuer » (MusicRadar SampleRadar…).
  const PACK_AUDIO = /\.(wav|wave|aif|aiff|mp3|m4a|flac|ogg)$/i;
  // lecture d'un zip sans tout charger : le répertoire central à la fin, puis chaque fichier à part
  async function zipEntries(file) {
    const tailLen = Math.min(file.size, 66000), tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
    let eocd = -1; for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("zip illisible");
    let n = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
    if (cdOff === 0xffffffff || n === 0xffff) {   // zip64
      const loc = eocd - 20; if (loc >= 0 && tail.getUint32(loc, true) === 0x07064b50) {
        const z64 = Number(tail.getBigUint64(loc + 8, true)), zd = new DataView(await file.slice(z64, z64 + 56).arrayBuffer());
        n = Number(zd.getBigUint64(32, true)); cdSize = Number(zd.getBigUint64(40, true)); cdOff = Number(zd.getBigUint64(48, true));
      }
    }
    const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder(), out = [];
    for (let p = 0, k = 0; k < n && p + 46 <= cd.byteLength; k++) {
      if (cd.getUint32(p, true) !== 0x02014b50) break;
      const method = cd.getUint16(p + 10, true), flags = cd.getUint16(p + 8, true);
      let comp = cd.getUint32(p + 20, true), size = cd.getUint32(p + 24, true), off = cd.getUint32(p + 42, true);
      const nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true);
      const name = (flags & 0x800 ? dec : new TextDecoder("latin1")).decode(new Uint8Array(cd.buffer, p + 46, nl));
      for (let e = p + 46 + nl, end = e + el; e + 4 <= end;) {   // champs zip64
        const id = cd.getUint16(e, true), len = cd.getUint16(e + 2, true);
        if (id === 1) { let q = e + 4; if (size === 0xffffffff) { size = Number(cd.getBigUint64(q, true)); q += 8; } if (comp === 0xffffffff) { comp = Number(cd.getBigUint64(q, true)); q += 8; } if (off === 0xffffffff) off = Number(cd.getBigUint64(q, true)); }
        e += 4 + len;
      }
      out.push({ name, method, comp, size, off });
      p += 46 + nl + el + cl;
    }
    return out;
  }
  async function zipRead(file, en) {
    const lh = new DataView(await file.slice(en.off, en.off + 30).arrayBuffer());
    const start = en.off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = file.slice(start, start + en.comp);
    if (en.method === 0) return raw.arrayBuffer();
    if (en.method !== 8 || typeof DecompressionStream === "undefined") throw new Error("compression non gérée");
    return new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
  }
  const packName = s => s.replace(/\.(zip|serato-pack)$/i, "").replace(/^musicradar[-_ ]*/i, "").replace(/[-_]+/g, " ").replace(/\s+samples?$/i, "").trim().toUpperCase();
  async function importPack(files) {
    if (!ctx || !files || !files.length) return;
    // liste des sons : { path, read() } depuis un zip ou un dossier
    let items = [], title = "PACK";
    if (files.length === 1 && /\.(zip|serato-pack)$/i.test(files[0].name)) {
      const z = files[0]; title = packName(z.name);
      lcd("lcdPad", "PACK", "lecture du zip…");
      const ents = await zipEntries(z);
      // pack Serato (.serato-pack) : un zip avec un « manifest » ; les kits de batterie sont dans Drums/<kit>,
      // les boucles et sons dans Audio Samples, et chaque instrument (une basse…) dans Instruments/<nom>
      const man = ents.find(e => e.name === "manifest");
      if (man) { try { const j = JSON.parse(new TextDecoder().decode(await zipRead(z, man))); if (j.pack && j.pack.name) title = j.pack.name.toUpperCase(); } catch (e) {} }
      items = ents.filter(e => PACK_AUDIO.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name)).map(e => ({ path: e.name, read: () => zipRead(z, e) }));
    } else {
      const list = [...files].filter(f => PACK_AUDIO.test(f.name));
      const rel = f => f.webkitRelativePath || f.name; title = packName((rel(list[0] || files[0]).split("/")[0]) || "PACK");
      items = list.map(f => ({ path: rel(f), read: () => f.arrayBuffer() }));
    }
    if (!items.length) { lcd("lcdPad", "PACK", "aucun son trouvé (WAV, AIFF, MP3, M4A…)"); return; }
    // pack à plusieurs kits de batterie (Drums/<kit>/…) : ils deviennent un seul kit à variantes
    const drumOf = p => { const m = p.match(/^Drums\/([^/]+)\//i); return m ? m[1] : null; };
    const dk = new Map(); items.forEach(it => { const k = drumOf(it.path); if (k) { if (!dk.has(k)) dk.set(k, []); dk.get(k).push(it); } });
    const multi = dk.size >= 2;
    if (multi) items = items.filter(it => !drumOf(it.path));
    // regroupés par dossier, dans l'ordre alphabétique ; 16 par kit
    const groups = new Map();
    items.sort((a, b) => a.path.localeCompare(b.path, "fr", { numeric: true })).forEach(it => { const parts = it.path.split("/"); parts.pop(); const g = /^Instruments\//i.test(it.path) ? "Instruments" : /^Audio Samples\//i.test(it.path) ? "Samples" : parts.filter(Boolean).slice(-2).join(" · ").replace(/^Drums · /i, "") || "SONS"; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); });
    const plan = []; groups.forEach((arr, g) => { for (let i = 0; i < arr.length; i += 16) plan.push({ g, part: Math.floor(i / 16) + 1, of: Math.ceil(arr.length / 16), items: arr.slice(i, i + 16) }); });
    // kits de batterie d'abord, puis les samples et les instruments (packs Serato)
    const rank = g => g === "Samples" ? 1 : g === "Instruments" ? 2 : 0; plan.sort((a, b) => rank(a.g) - rank(b.g));
    const nDr = multi ? [...dk.values()].reduce((a, x) => a + x.length, 0) : 0;
    const ok = await askName(multi ? `${dk.size} kits de batterie → 1 kit à ${dk.size} variantes · ${items.length} autres sons → ${plan.length} kits · nom du pack` : `${items.length} sons → ${plan.length} kits · nom du pack`, title.slice(0, 24), 24); if (!ok) return;
    title = ok.toUpperCase();
    let done = 0, made = 0, firstId = null;
    const cleanName = path => path.split("/").pop().replace(PACK_AUDIO, "").replace(/^musicradar[-_ ]*/i, "").replace(/(\s*\([^)]*kit[^)]*\))+\s*$/i, "").replace(/^\d{1,2}\s+/, "").replace(/[-_]+/g, " ").trim().slice(0, 24).toUpperCase();
    const decode = async it => { const ab = await it.read(), b = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)); const n = Math.min(b.length, Math.round(b.sampleRate * 20)), c = ctx.createBuffer(Math.min(2, b.numberOfChannels), n, b.sampleRate); for (let ch = 0; ch < c.numberOfChannels; ch++) c.copyToChannel(b.getChannelData(ch).subarray(0, n), ch); return c; };
    if (multi) {
      const kits = [];
      for (const [kname, arr] of [...dk.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr", { numeric: true }))) {
        const sons = [];
        for (const it of arr.sort((a, b) => a.path.localeCompare(b.path, "fr", { numeric: true }))) {
          try { sons.push({ name: cleanName(it.path), buf: await decode(it) }); } catch (e) {}
          done++; if (done % 6 === 0) lcd("lcdPad", "PACK", `batterie · ${done}/${nDr} sons`);
        }
        if (sons.length) kits.push({ name: kname.trim(), sons });
      }
      if (kits.length) {
        const v = varBuild(kits), id = "pack-" + Date.now().toString(36) + "-v";
        const first = v.vars.map(vs => vs[0] || null);
        await DB.put("kits", { id, name: (title + " · BATTERIE ×" + kits.length).slice(0, 40), names: first.map(x => x ? x.name : ""), gains: new Array(16).fill(1), params: null, chokeAll: false, bufs: first.map(x => x ? x.buf : null), vars: v.vars, vsel: v.vsel, kits: v.kits, vg: 0, created: Date.now(), pack: title });
        firstId = id; made++;
      }
      done = 0;
    }
    for (const p of plan) {
      const bufs = new Array(16).fill(null), names = new Array(16).fill("");
      for (let i = 0; i < p.items.length; i++) {
        const it = p.items[i];
        try {
          const ab = await it.read(), b = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
          // 20 s au plus par pad (boucles et lignes de basse comprises)
          const n = Math.min(b.length, Math.round(b.sampleRate * 20)), c = ctx.createBuffer(Math.min(2, b.numberOfChannels), n, b.sampleRate);
          for (let ch = 0; ch < c.numberOfChannels; ch++) c.copyToChannel(b.getChannelData(ch).subarray(0, n), ch);
          bufs[i] = c; names[i] = cleanName(it.path);
        } catch (e) {}
        done++; if (done % 4 === 0) lcd("lcdPad", "PACK", `import · ${done}/${items.length} sons · kit ${made + 1}/${plan.length}`);
      }
      if (!bufs.some(Boolean)) continue;
      const id = "pack-" + Date.now().toString(36) + "-" + made, name = (title + " · " + p.g.toUpperCase() + (p.of > 1 ? " " + p.part : "")).slice(0, 40);
      await DB.put("kits", { id, name, names, gains: new Array(16).fill(1), params: null, chokeAll: false, bufs: bufs.map(packBuf16), created: Date.now(), pack: title });
      if (!firstId) firstId = id; made++;
    }
    await refreshUserKits();
    if (firstId) { $("kitSheet").hidden = true; await loadKit(firstId); }
    lcd("lcdPad", "PACK", `${title} : ${made} kits créés dans MES KITS (◀ ▶ pour passer de l'un à l'autre)`);
  }
  $("packZip").addEventListener("click", () => $("packFile").click());
  $("packDir").addEventListener("click", () => $("packFolder").click());
  $("packFile").addEventListener("change", e => { const f = [...e.target.files]; e.target.value = ""; importPack(f); });
  $("packFolder").addEventListener("change", e => { const f = [...e.target.files]; e.target.value = ""; importPack(f); });
