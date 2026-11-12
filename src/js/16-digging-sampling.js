  // ---------- DIGGING / SAMPLING ----------
  let crate = null, crateIdx = 0, recIdx = 0, digAnim = null, digDragX = null, digDirty = true;
  const chopKit = { buffers: [], names: [] };
  const clipCache = new Map();
  let clip = null;          // { buf, title, peaks }
  let chops = [];           // positions de départ (en échantillons)
  let chopMode = "auto", sens = 0.5, eqN = 8, pitchSemi = 0, sampleVol = 0.9;
  let wz = 1, wStart = 0, ttOff = 0;   // zoom de la forme d'onde, départ de la lecture (échantillons)
  let ttSrc = null, ttStart = 0, ttAngle = 0, previewSrc = null, previewInfo = null;
  const dcv = $("digCanvas"), dg = dcv.getContext("2d");
  const tcv = $("ttCanvas"), tg = tcv.getContext("2d");
  const wcv = $("waveCanvas"), wg = wcv.getContext("2d");
  function fitCanvas(c) { const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1; if (r.width && (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d))) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); } }
  // Petit générateur pseudo-aléatoire stable par disque (prix, couleurs, usure)
  function seeded(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
  const SLEEVES = ["#c9a874", "#b8915a", "#d8c49a", "#8f6b3e", "#a8b39a", "#c4a07a", "#e2d3b2"];
  const PRICES = ["0,50 €", "1 €", "2 €", "1,50 €", "3 €", "50 c", "5 F", "1 $"];
  async function loadCrate() {
    if (crate) return;
    try { crate = await (await fetch("crate/crate.json")).json(); }
    catch (e) { $("digTitle").textContent = "Le bac n'a pas pu être chargé (hors ligne ?)"; return; }
    $("crates").innerHTML = "";
    crate.collections.forEach((c, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "crate"; b.id = "crate" + i; b.setAttribute("role", "tab");
      b.innerHTML = `<i style="background:${c.color}"></i>${c.name}`;
      b.addEventListener("click", () => openCrate(i, 0));
      $("crates").appendChild(b);
    });
    const s = store.get("dig", { c: 0, r: 0 });
    openCrate(Math.min(s.c, crate.collections.length - 1), s.r);
  }
  // ---------- Bacs en ligne : Internet Archive (78 tours d'avant 1926, domaine public) et Wikimedia Commons (licences libres) ----------
  // Rien n'est stocké dans l'appareil : la liste et les sons arrivent d'internet à chaque fois.
  let crateTok = 0;
  async function openCrate(i, r) {
    crateIdx = i; const c = crate.collections[i], tok = ++crateTok;
    drawCrates();
    if (c.src && !c.items) {
      $("digTitle").textContent = "on fouille le bac en ligne…"; $("digYear").textContent = ""; $("digArtist").textContent = ""; $("digCount").textContent = c.name;
      digLoad(-1);
      try { c.items = c.src === "ia" ? await iaList(c) : await wcList(c); } catch (e) { c.items = null; }
      digLoad(null);
      if (tok !== crateTok) return;
      if (!c.items || !c.items.length) { c.items = null; $("digTitle").textContent = "bac en ligne injoignable (pas de connexion ?)"; return; }
    }
    recIdx = Math.max(0, Math.min(r || 0, curItems().length - 1)); showRecord(0);
  }
  async function iaList(c) {
    const u = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent(c.q) + "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date&sort[]=downloads+desc&rows=" + (c.rows || 120) + "&output=json";
    const j = await (await fetch(u, { cache: "no-store" })).json(), seen = new Set(), drop = c.drop ? new RegExp(c.drop, "i") : null;
    return j.response.docs.map(d => ({ id: d.identifier, t: String(d.title || "").replace(/\s+/g, " ").slice(0, 90), a: String([].concat(d.creator || "")[0] || "").split(",")[0].slice(0, 50), y: d.date ? +String(d.date).slice(0, 4) : undefined }))
      .filter(x => { const k = x.t.toLowerCase(); if (!x.t || seen.has(k) || /none legible|unknown/i.test(x.t) || (drop && drop.test(x.t + " " + x.a))) return false; seen.add(k); return true; })
      .map(x => ({ ...x, ia: 1, u: "https://archive.org/details/" + x.id, img: "https://archive.org/services/img/" + x.id, l: "domaine public" }));
  }
  async function wcList(c) {
    const strip = h => String(h || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), drop = c.drop ? new RegExp(c.drop, "i") : null;
    const okLic = l => /^(CC0|Public domain|PD|CC BY(-SA)?)/i.test(l) && !/NC|ND/.test(l);
    const res = await Promise.all(c.terms.map(term => fetch("https://commons.wikimedia.org/w/api.php?format=json&origin=*&" + new URLSearchParams({ action: "query", generator: "search", gsrsearch: term + " filetype:audio", gsrnamespace: 6, gsrlimit: 40, prop: "videoinfo", viprop: "url|mime|size|derivatives|extmetadata", viextmetadatafilter: "LicenseShortName|Artist|DateTimeOriginal|ObjectName|Categories" }), { cache: "no-store" }).then(r => r.json()).catch(() => ({}))));
    const out = [], seen = new Set();
    res.forEach(j => { if (!j.query) return; Object.values(j.query.pages).sort((a, b) => a.index - b.index).forEach(p => {
      const vi = p.videoinfo && p.videoinfo[0]; if (!vi) return;
      const m = vi.extmetadata || {}, lic = strip(m.LicenseShortName && m.LicenseShortName.value), cats = strip(m.Categories && m.Categories.value), a = strip(m.Artist && m.Artist.value).replace(/Unknown author/g, "");
      const t = strip((m.ObjectName && m.ObjectName.value) || p.title.slice(5).replace(/\.\w+$/, "")).slice(0, 90);
      if (seen.has(t) || !okLic(lic) || !(vi.duration >= 25 && vi.duration <= 330)) return;
      if (/LL-Q|\.mid$|pronunciation|dialect|interview|soundfont|minus one|Nl-|wav\)?$/i.test(p.title) || /MacLeod/i.test(a) || (drop && drop.test(t + " " + a))) return;
      if (!/music|song|musique|audio files of|recordings|78|jazz|blues|gospel|spiritual/i.test(cats)) return;
      const mp3 = /mpeg/.test(vi.mime) ? vi.url : ((vi.derivatives || []).find(x => /mpeg/.test(x.type)) || {}).src; if (!mp3) return;
      const dt = strip(m.DateTimeOriginal && m.DateTimeOriginal.value), y = (dt.match(/1[89]\d\d|20\d\d/) || [""])[0];
      seen.add(t); out.push({ id: "wc-" + p.pageid, t, a: a.slice(0, 60), y: y ? +y : undefined, l: /public|PD|CC0/i.test(lic) ? "domaine public" : lic, u: "https://commons.wikimedia.org/?curid=" + p.pageid, m: mp3, d: vi.duration });
    }); });
    return out.slice(0, c.rows || 80);
  }
  // Barre de chargement discrète : p entre 0 et 1, -1 = on attend sans savoir combien, null = fini
  function digLoad(p) {
    const el = $("digLoad"); if (!el) return;
    el.hidden = p === null; el.classList.toggle("wait", p === -1);
    if (p !== null && p >= 0) el.firstElementChild.style.width = Math.round(p * 100) + "%";
  }
  async function fetchProgress(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const total = +r.headers.get("content-length") || 0;
    if (!r.body || !total) { digLoad(-1); return r.arrayBuffer(); }
    const rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; digLoad(Math.min(1, got / total)); }
    const out = new Uint8Array(got); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
    return out.buffer;
  }
  // Pochettes réelles : photo de l'étiquette du 78 tours (Internet Archive)
  const covers = new Map();
  function cover(it) {
    if (!it.img) return null;
    let im = covers.get(it.id);
    if (!im) { im = new Image(); im.onload = () => { digDirty = true; }; im.src = it.img; covers.set(it.id, im); if (covers.size > 30) covers.delete(covers.keys().next().value); }
    return im.complete && im.naturalWidth ? im : null;
  }
  function enterDig() { fitCanvas(dcv); fitCanvas(wcv); tcv.width = 240; tcv.height = 240; loadCrate(); drawWave(); }
  function drawCrates() { digDirty = true; crate.collections.forEach((c, i) => { $("crate" + i).classList.toggle("on", i === crateIdx); $("crate" + i).setAttribute("aria-selected", i === crateIdx); }); }
  const curItems = () => crate ? crate.collections[crateIdx].items || [] : [];
  const curItem = () => curItems()[recIdx];
  function showRecord(dir) {
    if (!crate) return;
    const it = curItem(), c = crate.collections[crateIdx];
    if (!it) return;
    $("digTitle").textContent = it.t;
    $("digYear").textContent = it.y || "";
    $("digArtist").textContent = it.a || "artiste inconnu";
    $("digCount").textContent = `${c.name} · ${recIdx + 1}/${curItems().length}` + (it.l && it.l !== "domaine public" ? ` · ${it.l} (citer l'auteur)` : "");
    $("digLink").href = it.u;
    $("digLink").textContent = it.ia ? "fiche sur Internet Archive" : it.m ? "fiche sur Wikimedia Commons" : "fiche à la Bibliothèque du Congrès";
    if (dir) digAnim = { dir, t0: performance.now() };
    digDirty = true;
    store.set("dig", { c: crateIdx, r: recIdx });
    if (tab === "sample") lcd("lcdPad", "BAC", `${c.name} · ${it.t}`);
  }
  function flip(d) { if (!crate) return; const n = curItems().length; if (!n) return; recIdx = (recIdx + d + n) % n; showRecord(d); }
  $("digPrev").addEventListener("click", () => flip(-1));
  $("digNext").addEventListener("click", () => flip(1));
  $("digRand").addEventListener("click", () => { if (!crate) return; const i = Math.floor(Math.random() * crate.collections.length); openCrate(i, 0).then(() => { if (i !== crateIdx || !curItems().length) return; recIdx = Math.floor(Math.random() * curItems().length); showRecord(1); }); });
  dcv.addEventListener("pointerdown", e => { digDragX = e.clientX; });
  dcv.addEventListener("pointerup", e => { if (digDragX === null) return; const dx = e.clientX - digDragX; digDragX = null; if (Math.abs(dx) > 25) flip(dx < 0 ? 1 : -1); else pullRecord(); });
  dcv.addEventListener("pointercancel", () => { digDragX = null; });

  // Dessin du bac : planches de caisse, tranches des pochettes, pochette de 78 tours trouée sur l'étiquette
  function labelColors(it) { const r = seeded(it.id); const base = crate.collections[crateIdx].color; const alt = ["#1d1d1d", "#6b1b1b", "#16324f", "#2c4a1e", "#4a2a5a", "#7a5a12"][Math.floor(r() * 6)]; return r() > 0.5 ? [base, "#f2e6c8"] : [alt, "#e8d9a8"]; }
  function wrapText(g, text, x, y, maxW, lh, maxLines) {
    const words = String(text).split(/\s+/); let line = "", lines = [];
    words.forEach(w => { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    lines = lines.slice(0, maxLines);
    lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
  }
  function drawLabel(g, it, cx, cy, r, angle) {
    const im = cover(it);
    if (im) {
      g.save(); g.translate(cx, cy); g.rotate(angle || 0);
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
      const s = Math.min(im.naturalWidth, im.naturalHeight);
      g.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, -r, -r, r * 2, r * 2);
      g.beginPath(); g.arc(0, 0, r * 0.055, 0, Math.PI * 2); g.fillStyle = "#111"; g.fill();
      g.restore(); return;
    }
    const [bg, ink] = labelColors(it);
    g.save(); g.translate(cx, cy); g.rotate(angle || 0);
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = bg; g.fill();
    g.strokeStyle = ink; g.globalAlpha = 0.6; g.lineWidth = r * 0.02; g.beginPath(); g.arc(0, 0, r * 0.92, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `italic 700 ${r * 0.16}px ${"Playfair Display, Georgia, serif"}`;
    g.fillText(crate.collections[crateIdx].name.split(" ")[0], 0, -r * 0.62);
    g.font = `600 ${r * 0.075}px IBM Plex Mono, monospace`;
    g.fillText(it.m ? String(it.l || "").toUpperCase() : "78 TOURS · DOMAINE PUBLIC", 0, -r * 0.42);
    g.font = `700 ${r * 0.13}px Archivo Black, sans-serif`;
    wrapText(g, it.t.toUpperCase(), 0, r * 0.25, r * 1.35, r * 0.15, 2);
    g.font = `${r * 0.09}px IBM Plex Mono, monospace`;
    g.fillText((it.a || "").slice(0, 34), 0, r * 0.55);
    g.fillText(String(it.y || ""), 0, r * 0.7);
    g.beginPath(); g.arc(0, 0, r * 0.055, 0, Math.PI * 2); g.fillStyle = "#111"; g.fill();
    g.restore();
  }
  function drawSleeve(g, it, x, y, w, h, rot) {
    const r = seeded(it.id + "s");
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot);
    const col = SLEEVES[Math.floor(r() * SLEEVES.length)];
    g.fillStyle = col; g.fillRect(-w / 2, -h / 2, w, h);
    // usure du papier
    g.globalAlpha = 0.08; g.fillStyle = "#000";
    for (let i = 0; i < 40; i++) { g.fillRect(-w / 2 + r() * w, -h / 2 + r() * h, r() * w * 0.2, 1 + r() * 2); }
    g.globalAlpha = 0.18; g.fillRect(-w / 2, -h / 2, w, 3); g.globalAlpha = 1;
    // trou central qui montre l'étiquette
    const lr = it.img && cover(it) ? w * 0.36 : w * 0.24;
    g.beginPath(); g.arc(0, 0, lr * 1.12, 0, Math.PI * 2); g.fillStyle = "#121212"; g.fill();
    drawLabel(g, it, 0, 0, lr, (r() - 0.5) * 0.5);
    g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, lr * 1.12, 0, Math.PI * 2); g.stroke();
    // texte imprimé de la pochette
    g.fillStyle = "rgba(40,25,10,.55)"; g.font = `700 ${w * 0.035}px Archivo Black, sans-serif`; g.textAlign = "center";
    g.fillText("PROTÉGEZ VOS DISQUES", 0, -h / 2 + w * 0.08);
    g.font = `${w * 0.028}px IBM Plex Mono, monospace`;
    g.fillText("78 T · NE PAS EXPOSER AU SOLEIL", 0, h / 2 - w * 0.05);
    // étiquette de prix du bac
    const pr = PRICES[Math.floor(r() * PRICES.length)];
    g.save(); g.translate(w / 2 - w * 0.13, -h / 2 + w * 0.12); g.rotate(0.12);
    g.fillStyle = r() > 0.5 ? "#f6e35a" : "#ff8a6b"; g.fillRect(-w * 0.09, -w * 0.035, w * 0.18, w * 0.07);
    g.fillStyle = "#1a1a1a"; g.font = `700 ${w * 0.04}px IBM Plex Mono, monospace`; g.textBaseline = "middle"; g.fillText(pr, 0, 0);
    g.restore();
    g.restore();
  }
  function drawDig() {
    if (!crate) return;
    drawTurntable();
    drawWave();
    const pw = dcv.width; fitCanvas(dcv); if (dcv.width !== pw) digDirty = true;
    if (!digDirty && !digAnim) return;
    digDirty = false;
    const W = dcv.width, H = dcv.height, g = dg;
    // fond : intérieur de caisse en bois
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, "#2a1c10"); grd.addColorStop(1, "#4a3220");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(0,0,0,.25)"; for (let i = 1; i < 4; i++) g.fillRect(0, H * i / 4, W, 2);
    const items = curItems(), n = items.length;
    if (!n) return;
    const w = Math.min(W * 0.62, H * 0.86), x0 = (W - w) / 2;
    let p = 1, dir = 0;
    if (digAnim) { p = Math.min(1, (performance.now() - digAnim.t0) / 260); dir = digAnim.dir; if (p >= 1) digAnim = null; }
    const ease = 1 - Math.pow(1 - p, 3);
    // tranches des disques derrière (on voit le haut des pochettes)
    for (let k = 5; k >= 1; k--) {
      const it = items[(recIdx + k) % n]; const r = seeded(it.id + "s");
      const yy = H * 0.05 + (5 - k) * H * 0.018 - (dir > 0 ? (1 - ease) * H * 0.018 : 0);
      g.fillStyle = SLEEVES[Math.floor(r() * SLEEVES.length)];
      g.save(); g.translate(W / 2, yy + w / 2); g.rotate((r() - 0.5) * 0.04); g.fillRect(-w / 2, -w / 2, w, w);
      g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(-w / 2, -w / 2, w, w); g.restore();
    }
    // disque de devant
    const yFront = H * 0.05 + 5 * H * 0.018 + H * 0.03;
    const it = items[recIdx];
    let off = 0, alpha = 1;
    if (dir > 0) off = (1 - ease) * H * 0.12; else if (dir < 0) off = -(1 - ease) * H * 0.5;
    g.globalAlpha = alpha;
    g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 18; g.shadowOffsetY = 6;
    drawSleeve(g, it, x0, yFront + off, w, w, (seeded(it.id)() - 0.5) * 0.03);
    g.shadowColor = "transparent";
    // avant de la caisse
    g.fillStyle = "#5e3f23"; g.fillRect(0, H * 0.84, W, H * 0.16);
    g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(0, H * 0.84, W, 3);
    g.fillStyle = "#f3e9d2"; g.textAlign = "center"; g.textBaseline = "middle";
    const foot = crate.collections[crateIdx].name + " · " + crate.collections[crateIdx].sub;
    let fs = H * 0.06; g.font = `${fs}px Archivo Black, sans-serif`;
    const fw = g.measureText(foot).width; if (fw > W * 0.94) { fs *= W * 0.94 / fw; g.font = `${fs}px Archivo Black, sans-serif`; }
    g.fillText(foot, W / 2, H * 0.92);
    g.globalAlpha = 1;
  }

  // Platine
  function drawTurntable() {
    if ($("deck").hidden || !clip) return;
    const g = tg, W = tcv.width, c = W / 2;
    g.clearRect(0, 0, W, W);
    g.fillStyle = "#1c1b19"; g.fillRect(0, 0, W, W);
    g.beginPath(); g.arc(c, c, W * 0.46, 0, Math.PI * 2); g.fillStyle = "#0b0b0b"; g.fill();
    if (ttSrc) ttAngle += 0.06 * Math.pow(2, pitchSemi / 12);
    g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1;
    for (let rr = W * 0.2; rr < W * 0.45; rr += 3) { g.beginPath(); g.arc(c, c, rr, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.arc(c, c, W * 0.38, ttAngle, ttAngle + 0.6); g.stroke();
    drawLabel(g, clip.item, c, c, W * 0.17, ttAngle);
    // bras de lecture
    g.strokeStyle = "#c9c2b3"; g.lineWidth = 5; g.lineCap = "round";
    g.beginPath(); g.moveTo(W * 0.92, W * 0.08); g.lineTo(W * 0.86, W * 0.62); g.lineTo(ttSrc ? W * 0.66 : W * 0.78, ttSrc ? W * 0.74 : W * 0.8); g.stroke();
    g.beginPath(); g.arc(W * 0.92, W * 0.08, 9, 0, Math.PI * 2); g.fillStyle = "#c9c2b3"; g.fill();
  }
  function pullRecord() {
    if (!crate) return;
    const it = curItem(); if (!it) return;
    $("deck").hidden = false;
    $("faces").innerHTML = "";
    if (!it.c) { loadOnline(it); return; }
    it.c.forEach((cl, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "face"; b.textContent = "extrait " + (i + 1) + " · " + cl[1];
      b.addEventListener("click", () => loadClip(it, i));
      $("faces").appendChild(b);
    });
    loadClip(it, 0);
  }
  $("digPull").addEventListener("click", pullRecord);
  async function loadClip(it, i) {
    if (!ctx) return;
    stopTT();
    [...$("faces").children].forEach((b, j) => b.classList.toggle("on", j === i));
    const file = it.c[i][0], url = crate.base + crate.collections.find(c => (c.items || []).includes(it)).id + "/" + file + ".wav";
    $("ttMsg").textContent = "on pose le disque…"; digLoad(0);
    try {
      let buf = clipCache.get(url);
      if (!buf) {
        const ab = await fetchProgress(url);
        buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
        clipCache.set(url, buf); if (clipCache.size > 4) clipCache.delete(clipCache.keys().next().value);
      }
      setClip(buf, it, `${it.t} · extrait ${i + 1}`);
      $("ttMsg").textContent = Math.round(buf.duration) + " s";
    } catch (e) { $("ttMsg").textContent = "chargement impossible"; }
    digLoad(null);
  }
  // Disque en ligne : on télécharge le morceau entier une fois, puis on le découpe en extraits de 30 s (sans re-télécharger)
  let online = null, onlineTok = 0;
  async function loadOnline(it) {
    if (!ctx) return;
    stopTT(); const tok = ++onlineTok;
    $("faces").innerHTML = ""; $("ttMsg").textContent = "on pose le disque…"; digLoad(0);
    try {
      if (!online || online.id !== it.id) {
        online = null;
        let url = it.m;
        if (it.ia) {
          const md = await (await fetch("https://archive.org/metadata/" + it.id, { cache: "no-store" })).json();
          const f = md.files.filter(f => /\.mp3$/i.test(f.name) && !/_sample|_64kb/i.test(f.name)).sort((a, b) => (+a.size || 0) - (+b.size || 0))[0];
          if (!f) throw new Error("pas de mp3");
          url = "https://archive.org/download/" + it.id + "/" + encodeURIComponent(f.name);
        }
        const ab = await fetchProgress(url);
        if (tok !== onlineTok) return;
        digLoad(-1); $("ttMsg").textContent = "décodage…";
        const buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
        if (tok !== onlineTok) return;
        online = { id: it.id, buf };
      }
      const seg = 30, n = Math.max(1, Math.min(8, Math.ceil(online.buf.duration / seg - 0.2)));
      for (let i = 0; i < n; i++) {
        const b = document.createElement("button"), s0 = i * seg;
        b.type = "button"; b.className = "face"; b.textContent = "extrait " + (i + 1) + " · " + Math.floor(s0 / 60) + ":" + String(s0 % 60).padStart(2, "0");
        b.addEventListener("click", () => onlineFace(it, i, seg)); $("faces").appendChild(b);
      }
      onlineFace(it, 0, seg);
    } catch (e) { if (tok === onlineTok) $("ttMsg").textContent = "chargement impossible (connexion ?)"; }
    if (tok === onlineTok) digLoad(null);
  }
  function onlineFace(it, i, seg) {
    if (!online) return;
    stopTT();
    [...$("faces").children].forEach((b, j) => b.classList.toggle("on", j === i));
    const src = online.buf, a = Math.floor(i * seg * src.sampleRate), len = Math.min(src.length - a, Math.floor(seg * src.sampleRate));
    const buf = ctx.createBuffer(src.numberOfChannels, len, src.sampleRate);
    for (let c = 0; c < src.numberOfChannels; c++) buf.getChannelData(c).set(src.getChannelData(c).subarray(a, a + len));
    setClip(buf, it, `${it.t} · extrait ${i + 1}`);
    $("ttMsg").textContent = Math.round(buf.duration) + " s";
  }
  function setClip(buf, item, title) {
    clip = { buf, item, title, peaks: null, orig: buf };
    wz = 1; wStart = 0; drawWaveBar();
    computePeaks(); rechop();
    $("digKey").textContent = "";
    setTimeout(() => { if (!clip || clip.buf !== buf) return; const k = keyOfChroma(chromaOf(buf)); $("digKey").textContent = k ? "tonalité : " + k.name : "tonalité : incertaine"; if (k) lcd("lcdPad", "PLATINE", `${title} · ${k.name}`); }, 30);
    lcd("lcdPad", "PLATINE", title);
  }
  let ciTimers = [];
  function stopTT() { ciTimers.forEach(clearTimeout); ciTimers = []; if (ttSrc) { try { ttSrc.stop(); } catch (e) {} ttSrc = null; } $("ttPlay").textContent = "▶ ÉCOUTER"; }
  // countIn : nombre de temps de décompte avant le départ (au tempo du looper, sinon au tempo réglé dans FX)
  function ttStartPlay(countIn) {
    if (!clip || !ctx) return;
    const s = ctx.createBufferSource(); s.buffer = clip.buf; s.playbackRate.value = Math.pow(2, pitchSemi / 12);
    const g = ctx.createGain(); g.gain.value = sampleVol; s.connect(g); g.connect(liveIn);
    s.onended = () => { if (ttSrc === s) stopTT(); };
    const beat = 60 / curBpm(), t0 = ctx.currentTime + 0.05 + (countIn ? countIn * beat : 0);
    for (let k = 0; k < (countIn || 0); k++) {
      const t = t0 - (countIn - k) * beat, o = ctx.createOscillator(), cg = ctx.createGain();
      o.frequency.value = k === 0 ? 1600 : 1100; cg.gain.setValueAtTime(0.35, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(cg); cg.connect(fxOut); o.start(t); o.stop(t + 0.06);
      ciTimers.push(setTimeout(() => lcd("lcdPad", "CHOP LIVE", "décompte · " + (countIn - k) + " … préparez-vous"), Math.max(0, (t - ctx.currentTime) * 1000)));
    }
    if (countIn) ciTimers.push(setTimeout(() => lcd("lcdPad", "CHOP LIVE", "GO · frappez les pads"), Math.max(0, (t0 - ctx.currentTime) * 1000)));
    ttOff = Math.min(wStart, clip.buf.length - 1);
    s.start(t0, ttOff / sr); ttSrc = s; ttStart = t0; $("ttPlay").textContent = "■ STOP";
  }
  $("ttPlay").addEventListener("click", () => { if (ttSrc) stopTT(); else ttStartPlay(0); });
  function setPitch(v) { pitchSemi = v; $("pitchSl").value = v; $("pitchVal").textContent = (v > 0 ? "+" : "") + v; if (ttSrc) ttSrc.playbackRate.value = Math.pow(2, v / 12); }
  $("pitchSl").addEventListener("input", e => setPitch(+e.target.value));

  // Forme d'onde et découpe
  function mono(buf) { const n = buf.length, out = new Float32Array(n); for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; } return out; }
  function computePeaks() { clip.mono = mono(clip.buf); }
  function detectOnsets() {
    const x = clip.mono, hop = 512, n = Math.floor(x.length / hop);
    const e = new Float32Array(n); let prev = 0;
    for (let i = 0; i < n; i++) { let s = 0, hf = 0; for (let j = 0; j < hop; j++) { const v = x[i * hop + j], d = v - prev; prev = v; s += v * v; hf += d * d; } e[i] = Math.log(1e-6 + hf + s * 0.2); }
    const flux = new Float32Array(n); for (let i = 1; i < n; i++) flux[i] = Math.max(0, e[i] - e[i - 1]);
    let mean = 0; flux.forEach(v => mean += v); mean /= n; let sd = 0; flux.forEach(v => sd += (v - mean) ** 2); sd = Math.sqrt(sd / n);
    const th = mean + sd * (2.6 - sens * 2.2), minGap = Math.floor(0.12 * sr / hop);
    const peaks = [];
    for (let i = 2; i < n - 2; i++) if (flux[i] > th && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) peaks.push([i, flux[i]]);
    const keep = []; peaks.sort((a, b) => b[1] - a[1]).forEach(p => { if (keep.length < 16 && keep.every(k => Math.abs(k - p[0]) >= minGap)) keep.push(p[0]); });
    return keep.sort((a, b) => a - b).map(i => Math.max(0, i * hop - 256));
  }
  // CRÊTES : coupe juste avant les sons les plus forts (les plus hautes crêtes de la forme d'onde)
  function detectCrests() {
    const x = clip.mono, hop = 256, n = Math.floor(x.length / hop), env = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < hop; j++) m = Math.max(m, Math.abs(x[i * hop + j])); env[i] = m; }
    let mx = 0; env.forEach(v => mx = Math.max(mx, v)); if (!mx) return [0];
    const th = mx * (0.85 - sens * 0.7), gap = Math.floor(0.15 * sr / hop), pk = [];
    for (let i = 1; i < n - 1; i++) if (env[i] >= th && env[i] >= env[i - 1] && env[i] > env[i + 1]) pk.push(i);
    const keep = []; pk.sort((a, b) => env[b] - env[a]).forEach(i => { if (keep.length < 16 && keep.every(k => Math.abs(k - i) >= gap)) keep.push(i); });
    // on recule jusqu'au pied de la montée pour garder l'attaque
    return keep.sort((a, b) => a - b).map(i => { let j = i; const lim = Math.max(0, i - Math.floor(0.08 * sr / hop)); while (j > lim && env[j - 1] > env[i] * 0.35) j--; return Math.max(0, j * hop - 64); });
  }
  function rechop() {
    if (!clip) return;
    const L = clip.buf.length;
    if (chopMode === "auto") chops = detectOnsets();
    else if (chopMode === "eq") chops = Array.from({ length: eqN }, (_, i) => Math.floor(i * L / eqN));
    else if (chopMode === "crest") chops = detectCrests();
    if (!chops.length) chops = [0];
    drawWave();
  }
  function setChopMode(m, n) {
    chopMode = m; if (n) eqN = n;
    ["chAuto", "chCrest", "chEq8", "chEq16", "chMan"].forEach(id => $(id).classList.remove("on"));
    $(m === "auto" ? "chAuto" : m === "crest" ? "chCrest" : m === "man" ? "chMan" : eqN === 8 ? "chEq8" : "chEq16").classList.add("on");
    if (m !== "man") rechop();
  }
  $("chAuto").addEventListener("click", () => setChopMode("auto"));
  $("chCrest").addEventListener("click", () => { setChopMode("crest"); lcd("lcdPad", "CHOP", `crêtes : ${chops.length} découpes (potard 3 = sensibilité)`); });
  // EFFACER : plus aucune coupe, on passe en MANUEL pour poser les siennes
  $("chClear").addEventListener("click", () => { if (!clip) return; setChopMode("man"); chops = [0]; drawWave(); lcd("lcdPad", "CHOP", "découpes effacées · touchez la forme d'onde pour couper"); });
  $("chEq8").addEventListener("click", () => setChopMode("eq", 8));
  $("chEq16").addEventListener("click", () => setChopMode("eq", 16));
  $("chMan").addEventListener("click", () => setChopMode("man"));
  function chopRange(i) { const L = clip.buf.length; return [chops[i], i + 1 < chops.length ? chops[i + 1] : L]; }
  // fenêtre visible : au zoom ×1 tout l'extrait ; plus on zoome, plus on voit autour du départ de lecture
  function wView() { const L = clip.buf.length, span = Math.max(256, Math.floor(L / wz)); const v0 = Math.max(0, Math.min(L - span, Math.floor(wStart - span * 0.25))); return [v0, span]; }
  function drawWave() {
    fitCanvas(wcv);
    const g = wg, W = wcv.width, H = wcv.height, d = window.devicePixelRatio || 1;
    g.clearRect(0, 0, W, H);
    if (!clip) { g.fillStyle = "#5d574f"; g.font = `${12 * d}px IBM Plex Mono, monospace`; g.textAlign = "center"; g.fillText("posez un disque ou importez un son", W / 2, H / 2); return; }
    const x = clip.mono, L = x.length, mid = H / 2, [v0, span] = wView(), X = s => (s - v0) / span * W;
    chops.forEach((c, i) => { const [a, b] = chopRange(i); if (b < v0 || a > v0 + span) return; g.fillStyle = i % 2 ? "rgba(34,163,90,.10)" : "rgba(217,43,47,.10)"; g.fillRect(X(a), 0, (b - a) / span * W, H); });
    g.fillStyle = "#cfc6b6";
    if (!clip.pk || clip.pk.W !== W || clip.pk.v0 !== v0 || clip.pk.span !== span || clip.pk.x !== x) {
      const mnA = new Float32Array(W), mxA = new Float32Array(W), stp = Math.max(1, Math.floor(span / W / 64));
      for (let px = 0; px < W; px++) { const s0 = v0 + Math.floor(px / W * span), e0 = Math.max(s0 + 1, v0 + Math.floor((px + 1) / W * span)); let mn = 0, mx = 0; for (let k = s0; k < e0; k += stp) { const v = x[k]; if (v < mn) mn = v; if (v > mx) mx = v; } mnA[px] = mn; mxA[px] = mx; }
      clip.pk = { W, v0, span, x, mnA, mxA };
    }
    for (let px = 0; px < W; px++) g.fillRect(px, mid - clip.pk.mxA[px] * mid * 0.95, 1, Math.max(1, (clip.pk.mxA[px] - clip.pk.mnA[px]) * mid * 0.95));
    chops.forEach((c, i) => {
      if (c < v0 || c > v0 + span) return;
      const xx = X(c); g.fillStyle = i < 8 ? "#d92b2f" : "#22a35a"; g.fillRect(xx, 0, 2 * d, H);
      g.font = `600 ${10 * d}px IBM Plex Mono, monospace`; g.textAlign = "left"; g.fillText(String(i + 1), xx + 3 * d, 11 * d);
    });
    // départ de la lecture (jaune)
    g.fillStyle = "#f6c945"; g.fillRect(X(wStart) - d, 0, 2 * d, H); g.beginPath(); g.moveTo(X(wStart) - 5 * d, H); g.lineTo(X(wStart) + 5 * d, H); g.lineTo(X(wStart), H - 7 * d); g.fill();
    if (previewInfo && ctx) { const t = (ctx.currentTime - previewInfo.t0) * Math.pow(2, pitchSemi / 12) * sr + previewInfo.a; if (t < previewInfo.b) { g.fillStyle = "#fff"; g.fillRect(X(t), 0, 1.5 * d, H); } }
    if (ttSrc && ctx) { const t = ttPos(); g.fillStyle = "#7dffa6"; g.fillRect(X(t), 0, 1.5 * d, H); }
  }
  function fmtT(n) { const s = n / sr; return Math.floor(s / 60) + ":" + (s % 60).toFixed(1).padStart(4, "0"); }
  function drawWaveBar() {
    $("wzVal").textContent = "×" + wz;
    $("wStart").value = clip ? Math.round(wStart / Math.max(1, clip.buf.length) * 1000) : 0;
    $("wStartVal").textContent = clip ? fmtT(wStart) : "0:00.0";
  }
  function setZoom(z) { wz = Math.max(1, Math.min(32, z)); drawWaveBar(); drawWave(); lcd("lcdPad", "EXTRAIT", `zoom ×${wz}`); }
  $("wzIn").addEventListener("click", () => setZoom(wz * 2));
  $("wzOut").addEventListener("click", () => setZoom(wz / 2));
  function setStart(s, restart) {
    if (!clip) return;
    wStart = Math.max(0, Math.min(clip.buf.length - 1, Math.floor(s))); drawWaveBar(); drawWave();
    if (restart && ttSrc && !LC.on) { stopTT(); ttStartPlay(0); }
  }
  $("wStart").addEventListener("input", e => setStart(+e.target.value / 1000 * (clip ? clip.buf.length : 0), true));
  function previewChop(i) {
    if (!clip || !ctx) return;
    const [a, b] = chopRange(i);
    if (previewSrc) { try { previewSrc.stop(); } catch (e) {} }
    const s = ctx.createBufferSource(); s.buffer = clip.buf; s.playbackRate.value = Math.pow(2, pitchSemi / 12);
    const g = ctx.createGain(); g.gain.value = sampleVol; s.connect(g); g.connect(liveIn);
    s.start(0, a / sr, (b - a) / sr); previewSrc = s; previewInfo = { t0: ctx.currentTime, a, b };
    lcd("lcdPad", "CHOP", `${i + 1}/${chops.length} · ${((b - a) / sr).toFixed(2)} s`);
  }
  let wPress = null;
  wcv.addEventListener("pointerdown", e => {
    if (!clip) return;
    const r = wcv.getBoundingClientRect(), [v0, span] = wView(), pos = Math.floor(v0 + (e.clientX - r.left) / r.width * span);
    wPress = { pos, t: setTimeout(() => {
      if (chopMode !== "man") { setStart(pos, true); lcd("lcdPad", "EXTRAIT", "départ de la lecture : " + fmtT(pos)); wPress = null; return; }
      if (chopMode === "man" && chops.length > 1) { let bi = 0, bd = Infinity; chops.forEach((c, i) => { const d = Math.abs(c - pos); if (d < bd) { bd = d; bi = i; } }); chops.splice(bi, 1); drawWave(); }
      wPress = null;
    }, 550) };
  });
  wcv.addEventListener("pointerup", () => {
    if (!wPress) return; clearTimeout(wPress.t);
    const pos = wPress.pos; wPress = null;
    if (chopMode === "man" && chops.length < 16 && chops.every(c => Math.abs(c - pos) > sr * 0.03)) {
      let z = pos; const m = clip.mono; for (let k = 0; k < 400 && z + 1 < m.length; k++) { if (m[z] <= 0 && m[z + 1] > 0) break; z++; }
      chops.push(z); chops.sort((a, b) => a - b); drawWave(); return;
    }
    let idx = 0; chops.forEach((c, i) => { if (c <= pos) idx = i; }); previewChop(idx);
  });
  $("toPads").addEventListener("click", () => {
    if (!clip || !ctx) return;
    const rate = Math.pow(2, pitchSemi / 12);
    chopKit.buffers = []; chopKit.names = [];
    chops.slice(0, 16).forEach((c, i) => {
      const [a, b] = chopRange(i);
      chopKit.buffers.push(sliceBuf(a, b, rate)); chopKit.names.push("Chop " + (i + 1));
    });
    while (chopKit.buffers.length < 16) { chopKit.buffers.push(null); chopKit.names.push("—"); }
    persistChops(true).then(name => lcd("lcdPad", "PADS", `${Math.min(16, chops.length)} découpes · kit ${name} (gardé dans l'appareil)`));
  });
  // Kits de chops gardés automatiquement, nommés d'après le disque : on peut changer de kit et y revenir quand on veut.
  // Un kit par extrait (renvoyer le même extrait met le kit à jour) ; les 6 plus récents sont gardés, en 16 bits.
  const CHOP_KEEP = 6;
  function chopKitName() {
    const t = (clip && clip.title) || "CHOPS", m = t.match(/^(.*) · extrait (\d+)$/), base = (m ? m[1] : t).replace(/\.[a-z0-9]{2,4}$/i, "").trim();
    const tail = m ? " " + m[2] : "";
    return ("CHOPS · " + base.toUpperCase()).slice(0, 30 - tail.length) + tail;
  }
  async function persistChops(load) {
    if (!clip || !chopKit.buffers.some(Boolean)) return "";
    const t = clip.title || "chops"; let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const id = "chops-" + (h >>> 0).toString(36), name = chopKitName();
    try {
      const prev = await DB.get("kits", id);
      await DB.put("kits", { id, name, names: chopKit.names.slice(), gains: new Array(16).fill(1), chokeAll: true, bufs: chopKit.buffers.map(packBuf16), created: prev ? prev.created : Date.now(), used: Date.now(), auto: true, desc: t.slice(0, 60) });
      const autos = (await DB.all("kits")).filter(k => k.auto).sort((a, b) => (b.used || 0) - (a.used || 0));
      for (const k of autos.slice(CHOP_KEEP)) if (k.id !== kitCur) await DB.del("kits", k.id);
      await refreshUserKits();
      if (load) await loadKit(id);
    } catch (e) { if (load) loadKit("chops"); }
    return name;
  }
  // Import de fichier et enregistrement micro
  $("fileBtn").addEventListener("click", () => $("fileIn").click());
  $("fileIn").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f || !ctx) return;
    try { const buf = await new Promise(async (res, rej) => ctx.decodeAudioData(await f.arrayBuffer(), res, rej)); $("deck").hidden = true; setClip(buf, null, f.name); }
    catch (err) { lcd("lcdPad", "IMPORT", "format non lu : " + f.name); }
    e.target.value = "";
  });
  let micRec = null;
  $("micBtn").addEventListener("click", async () => {
    if (!ctx) return;
    if (micRec) {
      const { stream, node, src, chunks } = micRec; micRec = null;
      src.disconnect(); node.disconnect(); stream.getTracks().forEach(t => t.stop());
      try { if (navigator.audioSession && !G.on) navigator.audioSession.type = "playback"; } catch (e) {}
      $("micBtn").textContent = "● MICRO"; $("micBtn").classList.remove("on");
      const n = chunks.reduce((s, c) => s + c.length, 0); if (!n) return;
      const buf = ctx.createBuffer(1, n, sr); const d = buf.getChannelData(0); let o = 0; chunks.forEach(c => { d.set(c, o); o += c.length; });
      $("deck").hidden = true; setClip(buf, null, "Micro " + new Date().toLocaleTimeString().slice(0, 5));
      return;
    }
    try {
      try { if (navigator.audioSession) navigator.audioSession.type = "play-and-record"; } catch (e) {}
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = ctx.createMediaStreamSource(stream), chunks = [];
      let node;
      if (hasWorklet) { node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" }); node.port.onmessage = e => { if (chunks.length * 1024 < sr * 30) chunks.push(e.data.l); }; }
      else { node = ctx.createScriptProcessor(1024, 1, 1); node.onaudioprocess = e => { if (chunks.length * 1024 < sr * 30) chunks.push(e.inputBuffer.getChannelData(0).slice()); }; }
      const mute = ctx.createGain(); mute.gain.value = 0;
      src.connect(node); node.connect(mute); mute.connect(ctx.destination);
      micRec = { stream, node, src, chunks };
      $("micBtn").textContent = "■ STOP"; $("micBtn").classList.add("on");
      lcd("lcdPad", "MICRO", "enregistrement… (30 s max)");
    } catch (e) { lcd("lcdPad", "MICRO", "micro refusé (" + e.name + ")"); }
  });
  // Chop live : pendant la lecture, chaque pad frappé prend le son à partir de cet instant
  const LC = { on: false, marks: {}, hist: [], countIn: store.get("chopCountIn", 4) };
  $("liveChop").addEventListener("click", () => {
    LC.on = !LC.on; $("liveChop").classList.toggle("on", LC.on);
    if (LC.on) { LC.marks = {}; LC.hist = []; $("lcUndo").disabled = true; if (!ttSrc) ttStartPlay(LC.countIn); lcd("lcdPad", "CHOP LIVE", LC.countIn ? "décompte…" : "frappez les pads pendant l'écoute"); }
    drawDigPads();
  });
  $("ciBtn").addEventListener("click", () => {
    LC.countIn = { 0: 4, 4: 8, 8: 0 }[LC.countIn]; store.set("chopCountIn", LC.countIn);
    $("ciBtn").textContent = LC.countIn ? "DÉCOMPTE " + LC.countIn : "SANS DÉCOMPTE"; $("ciBtn").classList.toggle("on", !!LC.countIn);
  });
  $("ciBtn").textContent = LC.countIn ? "DÉCOMPTE " + LC.countIn : "SANS DÉCOMPTE"; $("ciBtn").classList.toggle("on", !!LC.countIn);
  // Pads à l'écran sous la forme d'onde (sans l'Akai) : même rôle que les pads de l'Akai dans DIGGING
  const digPadEls = [];
  for (let r = 1; r >= 0; r--) for (let c = 0; c < 8; c++) {
    const i = r * 8 + c, b = document.createElement("button"); b.type = "button"; b.className = "dpad"; b.textContent = i + 1;
    b.addEventListener("pointerdown", e => { e.preventDefault(); digPadHit(i, 0.9); });
    $("digPads").appendChild(b); digPadEls[i] = b;
  }
  function digPadHit(i, vel) {
    if (LC.on && ttSrc && liveChopHit(i)) flash(i);
    else playPad(i, vel);
    const b = digPadEls[i]; b.classList.add("hit"); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("hit"), 110);
    drawDigPads();
  }
  function drawDigPads() { digPadEls.forEach((b, i) => b.classList.toggle("has", LC.on ? LC.marks[i] !== undefined : String(kitCur).startsWith("chops") && !!buffers[i])); }
  function ttPos() { return ttSrc ? Math.floor(ttOff + (ctx.currentTime - ttStart) * Math.pow(2, pitchSemi / 12) * sr) : -1; }
  function sliceBuf(a, b, rate) {
    const len = Math.max(32, Math.floor((b - a) / rate)), out = ctx.createBuffer(clip.buf.numberOfChannels, len, sr);
    const fade = Math.min(Math.floor(sr * 0.004), Math.floor(len / 4));
    for (let ch = 0; ch < clip.buf.numberOfChannels; ch++) {
      const src = clip.buf.getChannelData(ch), dst = out.getChannelData(ch);
      for (let j = 0; j < len; j++) { const p = a + j * rate, k = Math.floor(p), f = p - k; dst[j] = (src[k] || 0) * (1 - f) + (src[k + 1] || 0) * f; }
      for (let j = 0; j < fade; j++) dst[len - 1 - j] *= j / fade;
    }
    return out;
  }
  function liveChopHit(i) {
    const pos = ttPos(); if (pos < 0 || !clip) return false;
    LC.hist.push({ i, prev: LC.marks[i] });
    LC.marks[i] = pos;
    rebuildChops();
    lcd("lcdPad", "CHOP LIVE", `pad ${i + 1} ← ${(pos / sr).toFixed(2)} s`);
    return true;
  }
  // Annuler le dernier chop live (plusieurs fois de suite si besoin), ou tout recommencer en relançant l'extrait
  function lcUndo() {
    const h = LC.hist.pop(); if (!h) return;
    if (h.prev === undefined) delete LC.marks[h.i]; else LC.marks[h.i] = h.prev;
    rebuildChops(h.prev === undefined ? h.i : -1);
    lcd("lcdPad", "CHOP LIVE", `chop du pad ${h.i + 1} annulé`);
  }
  function lcRestart() {
    LC.marks = {}; LC.hist = []; rebuildChops(-2);
    if (LC.on) { stopTT(); ttStartPlay(LC.countIn); }
    lcd("lcdPad", "CHOP LIVE", "on recommence" + (LC.countIn ? " · décompte…" : ""));
  }
  $("lcUndo").addEventListener("click", lcUndo);
  $("lcRestart").addEventListener("click", lcRestart);
  function rebuildChops(cleared) {
    if (!clip) return;
    if (chopKit.buffers.length !== 16) { chopKit.buffers = new Array(16).fill(null); chopKit.names = new Array(16).fill("—"); }
    if (cleared >= 0) { chopKit.buffers[cleared] = null; chopKit.names[cleared] = "—"; }
    if (cleared === -2) { chopKit.buffers = new Array(16).fill(null); chopKit.names = new Array(16).fill("—"); }
    const L = clip.buf.length, rate = Math.pow(2, pitchSemi / 12);
    const starts = Object.values(LC.marks).sort((x, y) => x - y);
    if (chopKit.buffers.length !== 16) { chopKit.buffers = new Array(16).fill(null); chopKit.names = new Array(16).fill("—"); }
    Object.entries(LC.marks).forEach(([pad, a]) => {
      const nxt = starts.find(x => x > a + sr * 0.05); const b = Math.min(L, nxt ?? a + sr * 4);
      chopKit.buffers[+pad] = sliceBuf(a, b, rate); chopKit.names[+pad] = "Chop " + (+pad + 1);
    });
    chops = starts; drawWave();
    if (!kitIndex.some(k => k.id === "chops")) kitIndex.splice(1, 0, { id: "chops", name: "MES CHOPS", style: "Sampling", desc: "" });
    const cm = kitIndex.find(k => k.id === "chops"); cm.name = chopKitName() + " · LIVE"; cm.desc = (clip.title || "").slice(0, 60) + " · chop live";
    if (kitCur !== "chops") loadKit("chops"); else { buffers = chopKit.buffers.slice(); names = chopKit.names.slice(); drawPads(); }
    $("lcUndo").disabled = !LC.hist.length; $("lcRestart").disabled = !Object.keys(LC.marks).length && !LC.hist.length;
    drawDigPads();
  }
  function sampleKnob(k, v) {
    const val = v / 127;
    knobVals.sample[k] = val;
    if (k === 0) { if (!crate) return; const n = curItems().length; const target = Math.round(val * (n - 1)); if (target !== recIdx) { const d = target > recIdx ? 1 : -1; recIdx = target; showRecord(d); } }
    if (k === 1) setPitch(Math.round((val - 0.5) * 24));
    if (k === 2) { sens = val; if (chopMode === "auto" || chopMode === "crest") rechop(); }
    if (k === 3) { const n = [4, 8, 12, 16][Math.min(3, Math.floor(val * 4))]; if (n !== eqN || chopMode !== "eq") setChopMode("eq", n); }
    if (k === 7) sampleVol = val;
  }

  // ---------- Nettoyage de l'extrait : normaliser, réduire le souffle, enlever les craquements ----------
  // Tout se calcule dans l'appareil, par petits morceaux pour ne pas figer l'écran ; ORIGINAL revient au son de départ.
  const yieldUI = () => new Promise(r => setTimeout(r, 0));
  let cleaning = false;
  async function cleanClip(kind) {
    if (!clip || !ctx || cleaning) return;
    cleaning = true; stopTT();
    const src = clip.buf, nc = src.numberOfChannels, L = src.length, out = ctx.createBuffer(nc, L, src.sampleRate);
    let msg = "";
    try {
      digLoad(0);
      if (kind === "norm") {
        let pk = 0; for (let c = 0; c < nc; c++) { const d = src.getChannelData(c); for (let i = 0; i < L; i++) pk = Math.max(pk, Math.abs(d[i])); }
        const g = pk > 1e-4 ? 0.944 / pk : 1;
        for (let c = 0; c < nc; c++) { const d = src.getChannelData(c), o = out.getChannelData(c); for (let i = 0; i < L; i++) o[i] = d[i] * g; }
        msg = `normalisé · ${g >= 1 ? "+" : ""}${(20 * Math.log10(g)).toFixed(1)} dB`;
      } else if (kind === "click") {
        let n = 0;
        for (let c = 0; c < nc; c++) {
          const x = src.getChannelData(c), o = out.getChannelData(c); o.set(x);
          const W = 512; let acc = 0; const dd = new Float32Array(L);
          for (let i = 1; i < L; i++) dd[i] = Math.abs(x[i] - x[i - 1]);
          for (let i = 0; i < Math.min(W, L); i++) acc += dd[i];
          for (let i = 1; i < L - 1; i++) {
            if (i + W / 2 < L) acc += dd[i + W / 2]; if (i - W / 2 >= 0) acc -= dd[i - W / 2];
            const avg = Math.max(1e-5, acc / W);
            if (dd[i] > 7 * avg && dd[i] > 0.02) {
              let a = Math.max(1, i - 4), b = i; while (b < L - 2 && b - i < 48 && dd[b + 1] > 2.5 * avg) b++; b = Math.min(L - 2, b + 6);
              const y0 = o[a - 1], y1 = o[b + 1];
              for (let k = a; k <= b; k++) o[k] = y0 + (y1 - y0) * (k - a + 1) / (b - a + 2);
              n++; i = b + 1;
            }
            if ((i & 65535) === 0) { digLoad((c + i / L) / nc); await yieldUI(); }
          }
        }
        msg = n ? `${Math.round(n / nc)} craquements enlevés` : "aucun craquement trouvé";
      } else if (kind === "hiss") {
        // réduction de souffle par bandes de fréquences : on mesure le bruit dans les passages les plus calmes, puis on l'ôte partout
        const N = 2048, H = N / 2, B = N / 2 + 1, win = new Float32Array(N);
        for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        const F = Math.max(1, Math.ceil((L - N) / H) + 1);
        const re = new Float32Array(N), im = new Float32Array(N);
        for (let c = 0; c < nc; c++) {
          const x = src.getChannelData(c), o = out.getChannelData(c);
          const mags = [], en = new Float32Array(F);
          for (let f = 0; f < F; f++) {
            const p = f * H; for (let i = 0; i < N; i++) { re[i] = (x[p + i] || 0) * win[i]; im[i] = 0; } fft(re, im, false);
            const m = new Float32Array(B); let e = 0; for (let k = 0; k < B; k++) { m[k] = Math.hypot(re[k], im[k]); e += m[k]; } mags.push(m); en[f] = e;
            if (f % 80 === 0) { digLoad((c + f / F * 0.4) / nc); await yieldUI(); }
          }
          const ord = Array.from(en.keys()).sort((a, b) => en[a] - en[b]), q = ord.slice(0, Math.max(3, Math.floor(F * 0.12)));
          const noise = new Float32Array(B); q.forEach(f => { for (let k = 0; k < B; k++) noise[k] += mags[f][k] / q.length; });
          let gPrev = new Float32Array(B).fill(1);
          for (let f = 0; f < F; f++) {
            const p = f * H; for (let i = 0; i < N; i++) { re[i] = (x[p + i] || 0) * win[i]; im[i] = 0; } fft(re, im, false);
            const gNow = new Float32Array(B);
            for (let k = 0; k < B; k++) { const g = Math.max(0.12, 1 - 2 * noise[k] / Math.max(1e-9, mags[f][k])); gNow[k] = 0.6 * g + 0.4 * gPrev[k]; }
            for (let k = 0; k < B; k++) { re[k] *= gNow[k]; im[k] *= gNow[k]; if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; } }
            fft(re, im, true);
            for (let i = 0; i < N && p + i < L; i++) o[p + i] += re[i] * win[i];
            gPrev = gNow;
            if (f % 80 === 0) { digLoad((c + 0.4 + f / F * 0.6) / nc); await yieldUI(); }
          }
        }
        msg = "souffle réduit";
      }
      clip.buf = out; computePeaks(); clip.pk = null; drawWave();
      lcd("lcdPad", "NETTOYAGE", msg + " · ORIGINAL pour revenir");
    } catch (e) { lcd("lcdPad", "NETTOYAGE", "impossible sur cet extrait"); }
    digLoad(null); cleaning = false;
  }
  // FFT en place (radix 2) ; inv = inverse normalisée
  function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  $("clNorm").addEventListener("click", () => cleanClip("norm"));
  $("clHiss").addEventListener("click", () => cleanClip("hiss"));
  $("clClick").addEventListener("click", () => cleanClip("click"));
  $("clOrig").addEventListener("click", () => { if (!clip || cleaning || clip.buf === clip.orig) return; stopTT(); clip.buf = clip.orig; computePeaks(); clip.pk = null; drawWave(); lcd("lcdPad", "NETTOYAGE", "retour au son d'origine"); });
