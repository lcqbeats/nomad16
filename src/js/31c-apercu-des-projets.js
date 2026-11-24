  // ---------- APERÇU des projets : quelques secondes à écouter dans RÉGLAGES pour reconnaître un projet ----------
  // Calculé à partir du projet enregistré (boucles de toutes les banks, sinon morceau imprimé, sinon sons du kit intégré),
  // en mono 22 kHz : ~0,5 Mo, assez léger pour être aussi rangé dans Dropbox à côté du projet.
  const AP_SR = 22050, AP_SEC = 12;
  function apChan(o, c) { const d = o.ch[Math.min(c, o.ch.length - 1)]; return o.q ? Float32Array.from(d, v => v / 32767) : d; }
  function apMono(o) { const a = apChan(o, 0), b = o.ch.length > 1 ? apChan(o, 1) : a, m = new Float32Array(a.length); for (let i = 0; i < a.length; i++) m[i] = (a[i] + b[i]) * 0.5; return m; }
  function apResample(x, from, maxN) { const r = from / AP_SR, n = Math.min(maxN, Math.floor(x.length / r)), o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * r, k = p | 0, f = p - k; o[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f; } return o; }
  function projectPreview(p) {
    const N = AP_SEC * AP_SR;
    let out = null;
    // 1. les boucles : toutes les banks jouent ensemble, comme dans le looper
    const L = p.loop, layers = L ? (L.seqs ? [].concat(...L.seqs) : (L.layers || [])) : [];
    const live = layers.filter(l => l && l.buf && !l.muted);
    if (L && L.Lf && live.length) {
      const sr0 = L.sr || live[0].buf.sr, n0 = Math.min(Math.round(AP_SEC * sr0), 8 * 16 * L.Lf), mix = new Float32Array(n0);
      live.forEach(l => {
        const s = apMono(l.buf), LkL = l.k * L.Lf, off = l.m * L.Lf, g = l.vol ?? 1;
        for (let i = 0; i < n0; i++) mix[i] += (s[(((i - off) % LkL) + LkL) % LkL] || 0) * g;
      });
      out = apResample(mix, sr0, N);
    }
    // 2. le morceau imprimé (onglet SONG)
    if (!out && p.song && p.song.prints) { const pr = Object.values(p.song.prints).find(b => b && b.ch); if (pr) out = apResample(apMono(pr), pr.sr, N); }
    // 3. les sons du kit emporté dans le projet, joués l'un après l'autre
    if (!out && p.kitEmbed && p.kitEmbed.bufs) {
      const parts = p.kitEmbed.bufs.filter(b => b && b.ch).slice(0, 16).map(b => apResample(apMono(b), b.sr, Math.round(0.7 * AP_SR)));
      if (parts.length) { out = new Float32Array(Math.min(N, parts.reduce((a, x) => a + x.length + 1500, 0))); let o = 0; for (const x of parts) { if (o >= out.length) break; out.set(x.subarray(0, out.length - o), o); o += x.length + 1500; } }
    }
    if (!out || !out.length) return null;
    let pk = 0; for (let i = 0; i < out.length; i++) pk = Math.max(pk, Math.abs(out[i]));
    if (pk < 1e-4) return null;
    const g = 0.9 / pk, fade = Math.min(out.length >> 2, AP_SR >> 1);
    for (let i = 0; i < out.length; i++) out[i] *= g * Math.min(1, (out.length - i) / fade);
    return wavBlob([out], AP_SR);
  }
  // lecture : un seul aperçu à la fois ; le même bouton arrête
  const AP = { audio: null, btn: null, url: null };
  function apStop() {
    if (AP.audio) { AP.audio.pause(); AP.audio = null; }
    if (AP.url) { URL.revokeObjectURL(AP.url); AP.url = null; }
    if (AP.btn) { AP.btn.textContent = "▶"; AP.btn.classList.remove("on"); AP.btn = null; }
  }
  async function apPlay(btn, getBlob) {
    if (AP.btn === btn) { apStop(); return; }
    apStop(); AP.btn = btn; btn.textContent = "…"; btn.classList.add("on");
    // l'élément audio est créé tout de suite (pendant le toucher) : iOS accepte ensuite de le faire jouer
    const a = new Audio(); AP.audio = a;
    try {
      const blob = await getBlob();
      if (AP.btn !== btn) return;
      if (!blob) { apStop(); lcd("lcdPad", "APERÇU", "rien à écouter (projet sans boucle ni son intégré)"); return; }
      AP.url = URL.createObjectURL(blob); a.src = AP.url; a.onended = () => { if (AP.audio === a) apStop(); };
      await a.play(); btn.textContent = "■";
    } catch (e) { if (AP.btn === btn) { apStop(); lcd("lcdPad", "APERÇU", "lecture impossible : " + e.message); } }
  }
  function apButton(getBlob) {
    const b = document.createElement("button"); b.type = "button"; b.className = "mini apbtn"; b.textContent = "▶"; b.title = "Écouter un extrait";
    b.addEventListener("click", () => apPlay(b, getBlob));
    return b;
  }
