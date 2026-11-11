  // ---------- Projets dans un fichier (.nomad) : à garder dans l'app Fichiers, à réimporter ----------
  function packAudio(obj, files) {
    if (obj && typeof obj === "object") {
      if (obj.ch && Array.isArray(obj.ch) && obj.ch[0] instanceof Float32Array) {
        const id = "audio/a" + String(files.length).padStart(4, "0") + ".f32", n = obj.ch[0].length, data = new Uint8Array(n * 4 * obj.ch.length);
        obj.ch.forEach((c, k) => data.set(new Uint8Array(c.buffer, c.byteOffset, n * 4), k * n * 4));
        files.push({ name: id, data }); return { __audio: id, sr: obj.sr, nch: obj.ch.length, n };
      }
      if (Array.isArray(obj)) return obj.map(x => packAudio(x, files));
      const o = {}; Object.keys(obj).forEach(k => { o[k] = packAudio(obj[k], files); }); return o;
    }
    return obj;
  }
  function unpackAudio(obj, files) {
    if (obj && typeof obj === "object") {
      if (obj.__audio) { const raw = files[obj.__audio], f = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)); return { sr: obj.sr, ch: Array.from({ length: obj.nch }, (_, k) => f.slice(k * obj.n, (k + 1) * obj.n)) }; }
      if (Array.isArray(obj)) return obj.map(x => unpackAudio(x, files));
      const o = {}; Object.keys(obj).forEach(k => { o[k] = unpackAudio(obj[k], files); }); return o;
    }
    return obj;
  }
  function readZip(u8) {
    const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), out = {}; let p = 0;
    while (p + 30 <= u8.length && v.getUint32(p, true) === 0x04034b50) {
      const size = v.getUint32(p + 18, true), nl = v.getUint16(p + 26, true), xl = v.getUint16(p + 28, true);
      const name = new TextDecoder().decode(u8.subarray(p + 30, p + 30 + nl)), d0 = p + 30 + nl + xl;
      out[name] = u8.subarray(d0, d0 + size); p = d0 + size;
    }
    return out;
  }
  async function exportProjectFile(id) {
    const p = await DB.get("projects", id); if (!p) return;
    const files = [], meta = packAudio(p, files);
    files.unshift({ name: "projet.json", data: JSON.stringify({ format: "nomad16", version: 1, project: meta }) });
    const name = ascii(p.name, 30) + ".nomad";
    await deliver(makeZip(files), name, "application/zip");
  }
  async function importProjectFile(file) {
    try {
      const files = readZip(new Uint8Array(await file.arrayBuffer())), j = JSON.parse(new TextDecoder().decode(files["projet.json"]));
      if (j.format === "nomad16-sauvegarde") { await restoreBackup(j, files); $("setSheet").hidden = true; return; }
      if (j.format !== "nomad16") throw new Error("format");
      const p = unpackAudio(j.project, files); p.id = "proj-" + Date.now().toString(36);
      await DB.put("projects", p); await renderProjects(); await loadProject(p.id);
      $("setSheet").hidden = true;
      lcd("lcdPad", "PROJET", `« ${p.name} » importé`);
    } catch (e) { lcd("lcdPad", "PROJET", "fichier illisible (" + e.message + ")"); }
  }

