  // ---------- SONS : BATTERIE — banques de patterns par genre ----------
  // Un pattern n'est pas du son : c'est la liste des coups (quel rôle, quand, quelle force), joués en direct avec les
  // sons du kit en cours (ou ceux de NOMAD si le kit n'a pas le rôle). Quelques centaines d'octets par pattern.
  // Écriture : une ligne par rôle, un caractère par double-croche ; « . » = rien, 1 à 9 = force.
  // k grosse caisse · s caisse claire · h charleston fermé · o charleston ouvert · p percussion (rim, shaker…)
  // sw : swing des double-croches (0 à 0,6) · sw8 : swing des croches (le « et » retardé) · lag : retard d'un rôle
  // en fraction de double-croche (jeu « en arrière ») · cat : catégorie de SONS (sinon BATTERIE)
  const DRUM_GENRES = [
    { id: "boombap", name: "BOOM BAP", bpm: 90, sw: 0.2, p: [
      { n: "BASIQUE", k: "9......79.......", s: "....9.......9...", h: "6.5.6.5.6.5.6.5." },
      { n: "SYNCOPÉ", k: "9.....6...9..6..", s: "....9.......9...", h: "6.5.6.5.6.5.6.5." },
      { n: "GHOST NOTES", k: "9......7..9.....", s: "....9..3.3..9..3", h: "6.5.6.5.6.5.6.5." },
      { n: "DOUBLE KICK", k: "9.9.......9.6...", s: "....9.......9...", h: "6.6.6.6.6.6.6.6." },
      { n: "HAT OUVERT", k: "9......79.......", s: "....9.......9...", h: "6.5.6.5.6.5.6...", o: "..............6." },
      { n: "RIM SHOT", k: "9.....7...9.....", s: "....9.......9...", h: "6...6...6...6...", p: "..5.......5...5." },
      { n: "LOURD · 2 MES", k: "9......79.......9.....6...9..6..", s: "....9.......9.......9.......9.3.", h: "6.5.6.5.6.5.6.5.6.5.6.5.6.5.6.5." },
      { n: "BREAK", k: "9.....9.9.......", s: "....9..5.5.59.99", h: "6.6.6.6.6.6....." }
    ] },
    { id: "neosoul", name: "NÉO SOUL", bpm: 84, sw: 0.32, lag: { s: 0.18 }, p: [
      { n: "EN ARRIÈRE", k: "9.....7...8.....", s: "....9.......9...", h: "5.4.5.4.5.4.5.4." },
      { n: "KICK BAVARD", k: "9..6..7...8..5..", s: "....9.......9...", h: "5.4.5.4.5.4.5.4." },
      { n: "GHOSTS", k: "9.....7...8.....", s: "..2.9..2.2..9.2.", h: "5.4.5.4.5.4.5.4." },
      { n: "RIM DOUX", k: "9.....7...8.....", p: "....8.......8...", h: "4.4.4.4.4.4.4.4." },
      { n: "SHUFFLE", k: "9.....7.....8...", s: "....9.......9...", h: "5.3.5.35.5.3.5.3" },
      { n: "SANS CAISSE", k: "9.....7...8..6..", h: "5.4.5.4.5.4.5.4.", p: "........6......." },
      { n: "HAT OUVERT", k: "9.....7...8.....", s: "....9.......9...", h: "5.4.5.4.5.4.5...", o: "..............5." },
      { n: "FILL", k: "9.....7...8.....", s: "....9...5.5.9.66", h: "5.4.5.4.5.4....." }
    ] },
    { id: "triphop", name: "TRIP-HOP", bpm: 80, sw: 0.12, p: [
      { n: "DEMI-TEMPS", k: "9.......9.7.....", s: "........9.......", h: "5.5.5.5.5.5.5.5." },
      { n: "LENT LOURD", k: "9..7......9.....", s: "....9.......9...", h: "4.3.4.3.4.3.4.3." },
      { n: "BALAI", k: "9.......9.......", s: "....9.......9...", p: "4343434343434343" },
      { n: "SOMBRE", k: "9.........7.....9.......9.7.....", s: "........9...............9.......", h: "5...5...5...5...5...5...5...5..." },
      { n: "CAISSE TARD", k: "9......7..9.....", s: ".....9.......9..", h: "5.4.5.4.5.4.5.4." },
      { n: "RIDE", k: "9.......9.7.....", s: "........9.......", o: "6.4.6.4.6.4.6.4." },
      { n: "BREAK SALE", k: "9.9.....9.7.....", s: "....9..6....9...", h: "5555555555555555" },
      { n: "ROULEMENT", k: "9.......9.......", s: "........9.7.9.99", h: "5.5.5.5.5.5....." }
    ] },
    { id: "dub", name: "DUB", bpm: 76, sw: 0.15, p: [
      { n: "ONE DROP", k: "........9.......", s: "........9.......", h: "..5...5...5...5." },
      { n: "ROCKERS", k: "9.......9.......", s: "........9.......", h: "..5...5...5...5." },
      { n: "STEPPERS", k: "9...9...9...9...", s: "........9.......", h: "..5...5...5...5." },
      { n: "RIM", k: "........9.......", p: "........9.......", h: "5.5.5.5.5.5.5.5." },
      { n: "HAT OUVERT", k: "........9.......", s: "........9.......", o: "..5...5...5...5." },
      { n: "SHAKER", k: "9.......9.......", s: "........9.......", p: "4.5.4.5.4.5.4.5." },
      { n: "DOUBLE · 2 MES", k: "........9...............9.....7.", s: "........9...............9.......", h: "..5...5...5...5...5...5...5...5." },
      { n: "FILL", k: "........9.......", s: "........9...7.79", h: "..5...5...5....." }
    ] },
    { id: "lofi", name: "LO-FI", bpm: 82, sw: 0.24, lag: { s: 0.1, h: 0.06 }, p: [
      { n: "TRANQUILLE", k: "7......57.......", s: "....7.......7...", h: "4.3.4.3.4.3.4.3." },
      { n: "SYNCOPÉ", k: "7.....5...7..5..", s: "....7.......7...", h: "4.3.4.3.4.3.4.3." },
      { n: "RIM", k: "7......57.......", p: "....7.......7...", h: "4.3.4.3.4.3.4.3." },
      { n: "SHAKER", k: "7.......7.5.....", s: "....7.......7...", p: "3434343434343434" },
      { n: "GHOSTS", k: "7......5..7.....", s: "....7..2.2..7..2", h: "4.3.4.3.4.3.4.3." },
      { n: "SANS KICK", s: "....7.......7...", h: "4.3.4.3.4.3.4.3." },
      { n: "HAT OUVERT", k: "7......57.......", s: "....7.......7...", h: "4.3.4.3.4.3.4...", o: "..............4." },
      { n: "FILL", k: "7......57.......", s: "....7..4.4.47.77", h: "4.3.4.3.4.3....." }
    ] },
    { id: "breaks", name: "BREAKBEAT", bpm: 96, sw: 0.1, p: [
      { n: "FUNK", k: "9.9.......9.....", s: "....9..6.6..9..6", h: "7676767676767676" },
      { n: "SYNCOPÉ", k: "9.....9...9..9..", s: "....9.......9...", h: "7676767676767676" },
      { n: "CHARLESTON OUVERT", k: "9.9.......9.....", s: "....9.......9...", h: "7.7.7.7.7.7.7...", o: "..............7." },
      { n: "GHOSTS", k: "9.9...6...9.....", s: "..3.9.3..3..9.3.", h: "7676767676767676" },
      { n: "RIDE", k: "9.........9.....", s: "....9.......9...", o: "7.6.7.6.7.6.7.6." },
      { n: "DOUBLE CAISSE", k: "9.9.......9.....", s: "....9.9.....9...", h: "7676767676767676" },
      { n: "2 MESURES", k: "9.9.......9.....9.9...9...9..9..", s: "....9..6.6..9..6....9..6.6..9.99", h: "76767676767676767676767676767676" },
      { n: "ROULEMENT", k: "9.9.......9.....", s: "....9..7.7.79999", h: "76767676767....." }
    ] },
    // Mesuré sur « Sober » : 83 BPM ; grosse caisse 1, 1+ (double-croche 3) et 3, levée en fin de mesure ;
    // charleston en croches sauf sur 1 et 3, le « et » joué ~45 ms en retard (swing de croches) ; grosse caisse un peu derrière
    { id: "sober", name: "BATTERIE SOBER", cat: "SOBER", bpm: 83, sw: 0, sw8: 0.25, lag: { k: 0.06 }, p: [
      { n: "GROOVE", k: "9.7.....8......5", s: "....9.......9...", h: "..5.4.5...5.4.5." },
      { n: "SANS LEVÉE", k: "9.7.....8.......", s: "....9.......9...", h: "..5.4.5...5.4.5." },
      { n: "GHOST", k: "9.7.....8......5", s: "....9..3....9...", h: "..5.4.53..5.4.5." },
      { n: "CHARLESTON PLEIN", k: "9.7.....8.......", s: "....9.......9...", h: "..554.5.4.5.4.55", o: "..............4." }
    ] },
    // Mesuré sur « All Things to All Men » : 75,5 BPM, batteur jazz ; caisse sur 2 et 4 (fantôme parfois sur le 3),
    // cymbale en « ding, ding-a » (paires de double-croches sur 1 et 3), double-croches impaires ~38 ms en retard
    { id: "allthings", name: "BATTERIE ALL THINGS", cat: "ALL THINGS", bpm: 75, sw: 0.29, lag: { k: 0.05 }, p: [
      { n: "BASE", k: "9...6...9.......", s: "....9.......9...", h: "76..7.6.76..7.6." },
      { n: "KICK QUI AVANCE", k: "9...6.5.9.......", s: "....9.......9...", h: "76..7.6.76..7.6." },
      { n: "FANTÔME SUR 3", k: "9..6....9.......", s: "....9...4...9...", h: "7...7.6.7...7..." },
      { n: "PLEIN", k: "9..665..9.......", s: "..3.9..3....9.3.", h: "76..7.6.76..7.6.", o: "..............5." }
    ] }
  ];
  DRUM_GENRES.forEach(g => SYNTHS.push({ id: "drum:" + g.id, name: g.name, cat: g.cat || "BATTERIE", lic: `${g.p.length} patterns · ${g.bpm} BPM conseillés` }));
  { const i = CATS.indexOf("CLAVIERS"); CATS.splice(i < 0 ? CATS.length : i, 0, "BATTERIE"); }
  const DR = { genre: null, cur: -1, next: -1, anchor: 0, step: 0, nextT: 0, kitSounds: store.get("drKit", true), synth: null };
  const isDrum = id => typeof id === "string" && id.startsWith("drum:");
  const drGenre = () => DRUM_GENRES.find(g => "drum:" + g.id === instCur) || DRUM_GENRES[0];
  // rôle → pad du kit en cours, d'après le nom du pad (sinon le son de NOMAD)
  const DR_RX = {
    k: /kick|kik|\bbd\b|bass ?drum|grosse/i, s: /snare|\bsd\b|caisse|clap/i,
    h: /hat|\bhh\b|charl/i, o: /open|ouvert|\boh\b|ride/i, p: /rim|shaker|tamb|conga|perc|snap|cowbell|cloche|clave/i
  };
  const drMapAuto = () => drMap(true);
  function drMap(auto) {
    const m = {};
    if (!DR.kitSounds) return m;
    const find = (rx, not) => names.findIndex((n, i) => buffers[i] && rx.test(n || "") && !(not && not.test(n || "")));
    m.k = find(DR_RX.k); m.s = find(/snare|\bsd\b|caisse/i); if (m.s < 0) m.s = find(DR_RX.s);
    m.o = find(DR_RX.o); m.h = find(DR_RX.h, /open|ouvert|\boh\b/i); m.p = find(DR_RX.p);
    // choix faits à la main pour ce kit : un pad précis, ou le son de NOMAD (-1)
    const ov = auto ? {} : (store.get("drRoles", {}) || {})[kitCur] || {};
    Object.keys(ov).forEach(r => { m[r] = ov[r]; });
    Object.keys(m).forEach(r => { if (m[r] < 0 || !buffers[m[r]]) delete m[r]; });
    return m;
  }
  function drSetRole(r, v) {
    const all = store.get("drRoles", {}) || {}, ov = all[kitCur] || (all[kitCur] = {});
    if (v === "auto") delete ov[r]; else ov[r] = +v;
    store.set("drRoles", all); DR.map = drMap(); drawDrums();
  }
  // swing réglable par genre (remplace celui du genre ; croches pour les genres « croches », sinon double-croches)
  const drSw = g => { const v = (store.get("drSwing", {}) || {})[g.id]; return v === undefined ? { sw: g.sw, sw8: g.sw8 || 0 } : g.sw8 ? { sw: 0, sw8: v } : { sw: v, sw8: 0 }; };
  const drSwPct = g => { const w = drSw(g); return Math.round(Math.max(w.sw, w.sw8) * 100); };
  function drSynth() {
    if (DR.synth) return DR.synth;
    const r = render(sr), mk = x => { const b = ctx.createBuffer(1, x.length, sr); b.copyToChannel(x, 0); return b; };
    return (DR.synth = { k: mk(r[0]), s: mk(r[1]), h: mk(r[2]), o: mk(r[3]), p: mk(r[5]) });
  }
  function drHit(role, vel, when, map) {
    if (role in map) { voice(map[role], vel, 1, when); const i = map[role]; setTimeout(() => flash(i), Math.max(0, (when - ctx.currentTime) * 1000)); return; }
    const b = drSynth()[role]; if (!b) return;
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; g.gain.value = vel * 0.9; s.connect(g); g.connect(chPads); s.start(when);
  }
  const drLen = p => Math.max(...["k", "s", "h", "o", "p"].map(r => (p[r] || "").length), 16);
  function drTick() {
    if (!ctx || DR.cur < 0) return;
    const g = DR.genre, horizon = ctx.currentTime + 0.12, st = 60 / curBpm() / 4;
    while (DR.nextT < horizon) {
      const p = g.p[DR.cur], n = drLen(p), i = DR.step % n;
      if (i === 0 && DR.step > 0 && DR.next !== DR.cur) {   // changement ou arrêt au début d'une mesure
        if (DR.next < 0) { DR.cur = -1; drawDrums(); return; }
        DR.cur = DR.next; DR.step = 0; drawDrums(); continue;
      }
      if (i % 16 === 0) DR.barT = DR.nextT;   // grille des mesures (pour caler le départ d'une prise)
      if (i === 0) { DR.cycT0 = DR.nextT; DR.cycDur = n * st; DR.cycPat = DR.cur; drRecTick(); }   // début d'un tour du pattern
      const map = DR.map, w = drSw(g), base = DR.nextT + (i % 2 ? w.sw * st * 0.66 : 0) + (i % 4 === 2 ? w.sw8 * st : 0);
      ["k", "s", "h", "o", "p"].forEach(r => {
        const c = (p[r] || "")[i]; if (!c || c === ".") return;
        const when = Math.max(ctx.currentTime, base + ((g.lag && g.lag[r]) || 0) * st);
        drHit(r, (+c) / 9, when, map);
      });
      DR.step++; DR.nextT += st;
      if (DR.step % n === 0 && DR.next === DR.cur) DR.step = 0;
    }
  }
  setInterval(drTick, 25);
  // kit changé : les rôles suivent (et le panneau se met à jour)
  setInterval(() => { if (DR.mapKit !== kitCur || DR.mapN !== names.join("|")) { DR.mapKit = kitCur; DR.mapN = names.join("|"); DR.map = drMap(); if (tab === "sons" && isDrum(instCur)) drawDrums(); } }, 400);
  // lancer / changer / arrêter : au début de la mesure suivante (calé sur la boucle du LOOPER quand elle tourne)
  function drPlay(i) {
    if (!ctx) return;
    const g = drGenre(); if (!g.p[i]) return;
    if (DR.cur >= 0 && DR.genre === g) {
      DR.next = (DR.next === i && DR.cur === i) ? -1 : i; DR.last = i;
      if (DR.cur === i && DR.next === i) DR.next = -1;
      drawDrums(); lcd("lcdPad", g.name, DR.next < 0 ? "arrêt en fin de mesure" : "ensuite : " + g.p[i].n); return;
    }
    DR.genre = g; DR.map = drMap(); DR.cur = i; DR.next = i; DR.step = 0; DR.last = i;
    const st = 60 / curBpm() / 4, bar = st * 16, now = ctx.currentTime + 0.04;
    if (LP.t0F !== null && LP.playing) { const a = LP.t0F / sr; DR.nextT = a + Math.ceil((now - a) / bar) * bar; } else DR.nextT = now;
    drawDrums(); lcd("lcdPad", g.name, g.p[i].n + (LP.playing ? " · départ à la mesure" : ""));
  }
  function drStop() { if (DR.cur < 0) return; DR.cur = -1; DR.next = -1; if (DR.rec && DR.rec.phase === "rec") drRec(); drawDrums(); }
  // ---------- REC : enregistrer la batterie dans le LOOPER, sur la longueur qu'on veut ----------
  // 1er appui : départ à la mesure suivante (au tour de boucle suivant s'il y a une boucle) ; on peut changer de pattern
  // pendant la prise (syncopé ×3 puis break…) ; 2e appui : arrêt à la fin de la mesure (du tour de boucle) en cours.
  // Sans boucle : la première boucle prend cette longueur et le tempo. Avec une boucle : nouvelle piste de n tours.
  const drUnit = () => LP.t0F !== null && LP.Lf ? LP.Lf : Math.round(16 * 60 / curBpm() / 4 * sr);
  function drRec() {
    if (!ctx) return;
    const r = DR.rec, nowF = ctx.currentTime * sr;
    if (r && r.phase === "stopping") return;
    if (r) {
      if (nowF < r.sF) { DR.rec = null; drawDrums(); lcd("lcdPad", "BATTERIE", "enregistrement annulé"); return; }
      const U = drUnit(), n = Math.max(1, Math.min(16, Math.ceil((nowF - r.sF - 0.15 * U) / U)));
      r.phase = "stopping"; r.n = n; r.len = n * U;
      const fin = () => {
        if (DR.rec !== r) return;
        if (capLatest < r.sF + r.len) return setTimeout(fin, 20);
        const buf = extract(r.sF, r.len); DR.rec = null;
        if (!buf) { drawDrums(); return; }
        if (LP.t0F === null) {
          LP.t0F = r.sF; LP.Lf = r.len; LP.beats = n * 4; LP.playing = true;
          addLayer(buf, 1, 0, true, []);
          lcd("lcdPad", "BATTERIE", `boucle de ${n} mesure(s) · ${curBpm().toFixed(1)} BPM`);
        } else {
          addLayer(buf, n, Math.round((r.sF - LP.t0F) / LP.Lf), true, []);
          lcd("lcdPad", "BATTERIE", `nouvelle piste de ${n} tour(s) de boucle`);
        }
        drawDrums();
      };
      setTimeout(fin, Math.max(0, (r.sF + r.len) / sr - ctx.currentTime) * 1000);
      lcd("lcdPad", "BATTERIE", `fin de la prise dans ${(Math.max(0, (r.sF + r.len - nowF) / sr)).toFixed(1)} s (${n} ${LP.t0F !== null ? "tour(s)" : "mesure(s)"})`);
      return;
    }
    if (LP.pending) { lcd("lcdPad", "BATTERIE", "le LOOPER enregistre déjà"); return; }
    if (LP.t0F !== null && LP.layers.length >= MAX_LAYERS) { lcd("lcdPad", "BATTERIE", "bank pleine (6 pistes)"); return; }
    let sF;
    if (LP.t0F !== null && LP.Lf) { if (!LP.playing) playAll(); sF = LP.t0F + Math.ceil((nowF + 0.06 * sr - LP.t0F) / LP.Lf) * LP.Lf; if (DR.cur < 0) drPlay(DR.last >= 0 ? DR.last : 0); }
    else if (DR.cur < 0) { drPlay(DR.last >= 0 ? DR.last : 0); sF = Math.round(DR.nextT * sr); }
    else { const bar = 16 * 60 / curBpm() / 4; sF = Math.round((DR.barT + Math.ceil((ctx.currentTime + 0.06 - DR.barT) / bar) * bar) * sr); }
    DR.rec = { phase: "rec", sF };
    drawDrums(); lcd("lcdPad", "BATTERIE", "REC à la prochaine mesure · change de pattern à volonté · REC pour finir");
  }
  function drRecTick() {}
  $("drRec").addEventListener("click", drRec);
  // anneau de progression : un tour complet par tour du pattern qui joue
  (function drRing() {
    requestAnimationFrame(drRing);
    if (tab !== "sons" || !ctx || $("drumPanel").hidden) return;
    const live = DR.cur >= 0 && DR.cycDur && DR.genre === drGenre();
    document.querySelectorAll("#drPats .drpat").forEach(b => {
      const i = +b.dataset.i, on = live && i === DR.cycPat, ring = b.querySelector(".drring");
      const p = on ? Math.max(0, Math.min(1, ((ctx.currentTime - DR.cycT0) % DR.cycDur + DR.cycDur) % DR.cycDur / DR.cycDur)) : 0;
      ring.style.setProperty("--p", p.toFixed(3)); ring.classList.toggle("on", on);
    });
    const r = DR.rec, b = $("drRec"), nowF = ctx.currentTime * sr, U = drUnit();
    b.textContent = !r ? "● REC BOUCLE" : nowF < r.sF ? "● REC · ATTEND LA MESURE" : r.phase === "stopping" ? `■ FIN · ${r.n} ${LP.t0F !== null ? "TOUR" : "MES."}` : `■ STOP · ${Math.floor((nowF - r.sF) / U) + 1} ${LP.t0F !== null ? "TOUR" : "MES."}`;
    b.classList.toggle("on", !!r);
  })();
  function drawDrums() {
    const on = isDrum(instCur);
    ["drumPanel"].forEach(id => { $(id).hidden = !on; });
    ["modebar", "duckbar"].forEach(c => document.querySelectorAll("#view-sons ." + c).forEach(e => { e.hidden = on; }));
    ["sonsFx", "sonsFxInfo"].forEach(id => { $(id).hidden = on; });
    document.querySelectorAll("#view-sons .sphead").forEach(h => { if (/EFFETS/.test(h.textContent)) h.hidden = on; });
    if (on) $("chordPanel").hidden = true;
    if (!on) return;
    const g = drGenre(), live = DR.genre === g;
    $("drTitle").textContent = `${g.name} · ${g.bpm} BPM conseillés`;
    const locked = LP.t0F !== null && LP.Lf;
    $("drBpm").textContent = curBpm().toFixed(1).replace(/\.0$/, "") + " BPM";
    ["drBpmDown", "drBpmUp", "drBpmSet"].forEach(id => { $(id).disabled = !!locked; });
    $("drBpmInfo").textContent = locked ? "calé sur la boucle du LOOPER" : "";
    $("drSwing").value = drSwPct(g); $("drSwingVal").textContent = drSwPct(g) + " %" + (g.sw8 ? " croches" : "");
    const box = $("drPats"); box.innerHTML = "";
    (g.p.length > 4 ? [4, 5, 6, 7, 0, 1, 2, 3] : [0, 1, 2, 3]).forEach(i => {
      const p = g.p[i], b = document.createElement("button"); b.type = "button"; b.className = "drpat";
      b.classList.toggle("on", live && DR.cur === i); b.classList.toggle("next", live && DR.next === i && DR.cur !== i);
      const n = drLen(p), cells = Array.from({ length: Math.min(n, 16) }, (_, j) => { const k = (p.k || "")[j], s = (p.s || "")[j]; return `<i class="${k && k !== "." ? "k" : s && s !== "." ? "s" : ""}"></i>`; }).join("");
      b.dataset.i = i;
      b.innerHTML = `<s class="drring${n > 16 ? " two" : ""}" title="${n / 16} mesure(s)"></s><b>${p.n}</b><span>pad ${i + 1}${n > 16 ? " · 2 mes." : ""}</span><em>${cells}</em>`;
      b.addEventListener("click", () => drPlay(i));
      box.appendChild(b);
    });
    $("drStop").classList.toggle("on", DR.cur >= 0);
    $("drKit").textContent = DR.kitSounds ? "SONS : KIT" : "SONS : NOMAD";
    // rôles → pads du kit, modifiables (gardés pour ce kit)
    const m = drMap(), ov = ((store.get("drRoles", {}) || {})[kitCur]) || {}, box2 = $("drRoles");
    box2.hidden = !DR.kitSounds;
    $("drMapInfo").textContent = DR.kitSounds ? "Choix gardés pour ce kit · AUTO = repéré d'après le nom des pads" : "Sons de batterie de NOMAD, quel que soit le kit.";
    if (DR.kitSounds) {
      const LAB = { k: "GROSSE CAISSE", s: "CAISSE CLAIRE", h: "CHARLESTON", o: "OUVERT / RIDE", p: "PERCUSSION" };
      box2.innerHTML = "";
      Object.keys(LAB).forEach(r => {
        const auto = drMapAuto()[r];
        const l = document.createElement("label"), sel = document.createElement("select");
        sel.innerHTML = `<option value="auto">AUTO · ${auto !== undefined ? "pad " + (auto + 1) : "NOMAD"}</option><option value="-1">SON DE NOMAD</option>` +
          names.map((n, i) => buffers[i] ? `<option value="${i}">pad ${i + 1} · ${(n || "").toUpperCase().slice(0, 18)}</option>` : "").join("");
        sel.value = r in ov ? String(ov[r]) : "auto";
        sel.addEventListener("change", () => { drSetRole(r, sel.value); if (sel.value >= 0) { flash(+sel.value); playPad(+sel.value, 0.8); } });
        l.innerHTML = `<span>${LAB[r]}</span>`; l.appendChild(sel); box2.appendChild(l);
      });
    }
  }
  $("drStop").addEventListener("click", drStop);
  // tempo (sans boucle au LOOPER ; même tempo que FX) et swing
  const drBpmSet = v => { manualBpm = Math.max(50, Math.min(180, Math.round(v))); try { drawFxBar(); applyFxKnob(3); } catch (e) {} drawDrums(); };
  $("drBpmDown").addEventListener("click", () => drBpmSet(manualBpm - 1));
  $("drBpmUp").addEventListener("click", () => drBpmSet(manualBpm + 1));
  $("drBpmSet").addEventListener("click", () => drBpmSet(drGenre().bpm));
  $("drSwing").addEventListener("input", e => { const g = drGenre(), all = store.get("drSwing", {}) || {}; all[g.id] = e.target.value / 100; store.set("drSwing", all); $("drSwingVal").textContent = e.target.value + " %" + (g.sw8 ? " croches" : ""); });
  $("drSwingReset").addEventListener("click", () => { const g = drGenre(), all = store.get("drSwing", {}) || {}; delete all[g.id]; store.set("drSwing", all); drawDrums(); });
  $("drKit").addEventListener("click", () => { DR.kitSounds = !DR.kitSounds; store.set("drKit", DR.kitSounds); DR.map = drMap(); drawDrums(); });
  // clavier dans SONS avec une batterie : do à do (touches blanches de l'octave basse) = patterns 1 à 8
  function drKey(note) {
    const w = [0, 2, 4, 5, 7, 9, 11, 12].indexOf(note - 48); if (w < 0) return false;
    drPlay(w); return true;
  }
