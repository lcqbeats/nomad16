  // ---------- SONG : enchaînement des séquences ----------
  const SONG = { steps: [{ s: 0, r: 2 }], playing: false, idx: 0, loop: false, stepT0: 0, endT: null };
  const SEQ_N = "ABCDEFGH";
  // durée d'une ligne : prise = sa longueur ; séquence = répétitions × cycle
  const stepDur = st => st.take ? st.take.len : st.r * cycF(SQ.list[st.s]);
  // prise : applique un état des pistes (et la séquence) à l'instant F
  function takeApply(e, F) {
    const ls = SQ.list[e.seq] || [], T = Math.max(F / sr, ctx.currentTime);
    ls.forEach((l, q) => { const m = !!e.mask[q]; l.muted = m; if (e.seq === SQ.cur) { l.gain.gain.cancelScheduledValues(T); l.gain.gain.setTargetAtTime(m ? 0 : l.vol, T, 0.004); } });
    if (e.seq !== SQ.cur) SQ.sw = { i: e.seq, bF: Math.round(F) };
  }
  function takeTick() {
    const st = SONG.steps[SONG.idx]; if (!st || !st.take || SQ.sw) return;
    const ev = st.take.ev, nowF = ctx.currentTime * sr;
    while (SONG.tkI < ev.length && SONG.stepT0 + ev[SONG.tkI].t <= nowF + 0.14 * sr) { const e = ev[SONG.tkI++]; takeApply(e, SONG.stepT0 + e.t); if (SQ.sw) break; }
  }
  function songPlay() {
    if (!ctx) return;
    if (LP.t0F === null) { lcd("lcdPad", "SONG", "enregistrez d'abord une boucle au LOOPER"); return; }
    if (!SONG.steps.length) return;
    SONG.idx = 0; SONG.endT = null;
    const s0 = SONG.steps[0];
    if (s0.take) s0.take.ev[0].mask.forEach((m, q) => { const l = SQ.list[s0.s][q]; if (l) l.muted = !!m; });
    else if (SONG.steps.some(x => x.take)) SQ.list[s0.s].forEach(l => { l.muted = false; });
    switchNow(s0.s);
    playAll();
    SONG.stepT0 = LP.t0F; SONG.tkI = 0; SONG.playing = true; drawSong(true);
  }
  function songStop() { if (!SONG.playing) return; SONG.playing = false; clearTimeout(SONG.endT); SONG.endT = null; SQ.next = -1; SQ.sw = null; drawSong(true); drawSeqSel(); }
  function songTick() {
    if (!SONG.playing || !LP.playing || LP.t0F === null) return;
    takeTick();
    if (SQ.sw) return;
    const st = SONG.steps[SONG.idx]; if (!st) { songStop(); return; }
    const endF = SONG.stepT0 + (st.take ? st.take.len : st.r * cycF(LP.layers)), nowF = ctx.currentTime * sr;
    if (nowF < endF - 0.15 * sr) return;
    let idx = SONG.idx + 1;
    if (idx >= SONG.steps.length) {
      if (!SONG.loop) { const T = endF / sr; LP.layers.forEach(l => { if (l.src) { try { l.src.stop(T); } catch (e) {} } }); SONG.playing = false; SONG.endT = setTimeout(() => { stopAll(); drawSong(true); }, Math.max(0, (T - ctx.currentTime) * 1000)); drawSong(true); return; }
      idx = 0;
    }
    SONG.idx = idx; SONG.stepT0 = endF; SONG.tkI = 0;
    const nst = SONG.steps[idx], nx = nst.s;
    // une ligne de séquence classique rejoue toutes ses pistes ; une prise part de son premier état
    if (nst.take) { SONG.tkI = 1; const e0 = nst.take.ev[0]; (SQ.list[nx] || []).forEach((l, q) => { l.muted = !!e0.mask[q]; if (nx === SQ.cur) l.gain.gain.setTargetAtTime(l.muted ? 0 : l.vol, endF / sr, 0.004); }); }
    else if (SONG.steps[SONG.idx - 1 < 0 ? SONG.steps.length - 1 : SONG.idx - 1] && SONG.steps[SONG.idx - 1 < 0 ? SONG.steps.length - 1 : SONG.idx - 1].take) (SQ.list[nx] || []).forEach(l => { l.muted = false; if (nx === SQ.cur) l.gain.gain.setTargetAtTime(l.vol, endF / sr, 0.004); });
    if (nx !== SQ.cur) SQ.sw = { i: nx, bF: endF };
    drawSong(true);
  }
  // Interface SONG
  let songKey = "";
  function drawSong(force) {
    const list = $("songList");
    const prog = SONG.playing && LP.t0F !== null ? (() => { const st = SONG.steps[SONG.idx], C = cycF(LP.layers); const el = Math.max(0, ctx.currentTime * sr - SONG.stepT0); if (st.take) return { rep: 1, f: Math.min(1, el / st.take.len) }; return { rep: Math.min(st.r, Math.floor(el / C) + 1), f: (el % C) / C }; })() : null;
    const key = JSON.stringify([SONG.steps, SONG.playing, SONG.idx, SONG.loop, prog && prog.rep, SQ.list.map(x => x.length)]);
    if (force || key !== songKey) {
      songKey = key;
      list.innerHTML = "";
      if (!SONG.steps.length) list.innerHTML = '<p class="songempty">Aucune partie. Touchez + PARTIE.</p>';
      SONG.steps.forEach((st, i) => {
        const row = document.createElement("div"); row.className = "songrow" + (SONG.playing && i === SONG.idx ? " on" : "");
        const bars = n => { const L = SQ.list[n]; if (!L.length || !LP.Lf) return "vide"; return Math.round(cycF(L) / LP.Lf * LP.beats / 4 * 10) / 10 + " m"; };
        if (st.take) {
          const n = st.take.ev.length - 1, seqs = [...new Set(st.take.ev.map(e => SEQ_N[e.seq]))].join("→");
          row.classList.add("take");
          row.innerHTML = `<span class="sn">${i + 1}</span><span class="tk"><b>PRISE ${st.take.n}</b> · ${fmtLen(st.take.len)} · séquence ${seqs} · ${n} geste${n > 1 ? "s" : ""}</span>
            <button type="button" data-a="u" aria-label="Monter">▲</button><button type="button" data-a="go" aria-label="Lancer depuis cette partie">▶</button><button type="button" data-a="x" aria-label="Supprimer">✕</button><i class="bar"></i>`;
        } else
        row.innerHTML = `<span class="sn">${i + 1}</span><select aria-label="Séquence de la partie ${i + 1}">${[...SEQ_N].map((c, n) => `<option value="${n}"${n === st.s ? " selected" : ""}>${c} · ${bars(n)}</option>`).join("")}</select>
          <button type="button" data-a="m" aria-label="Moins de répétitions">−</button><span class="rp">×${st.r}${SONG.playing && i === SONG.idx && prog ? `<small>${prog.rep}/${st.r}</small>` : ""}</span><button type="button" data-a="p" aria-label="Plus de répétitions">+</button>
          <button type="button" data-a="u" aria-label="Monter">▲</button><button type="button" data-a="go" aria-label="Lancer depuis cette partie">▶</button><button type="button" data-a="x" aria-label="Supprimer">✕</button><i class="bar"></i>`;
        if (!st.take) row.querySelector("select").addEventListener("change", e => songEdit("séquence de la partie", () => { st.s = +e.target.value; }));
        row.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
          const a = b.dataset.a;
          if (a === "m") songEdit("répétitions", () => { st.r = Math.max(1, st.r - 1); });
          if (a === "p") songEdit("répétitions", () => { st.r = Math.min(64, st.r + 1); });
          if (a === "u" && i > 0) songEdit("ordre des parties", () => { SONG.steps.splice(i - 1, 0, SONG.steps.splice(i, 1)[0]); if (SONG.playing && SONG.idx === i) SONG.idx--; });
          if (a === "x") songEdit("supprimer une partie", () => { SONG.steps.splice(i, 1); if (SONG.idx >= SONG.steps.length) SONG.idx = 0; });
          if (a === "go") { songPlay(); if (SONG.playing && i) { const s2 = SONG.steps[i]; SONG.idx = i; if (s2.take) s2.take.ev[0].mask.forEach((m, q) => { const l = SQ.list[s2.s][q]; if (l) l.muted = !!m; }); switchNow(s2.s); playAll(); SONG.stepT0 = LP.t0F; SONG.tkI = s2.take ? 1 : 0; drawSong(true); } }
        }));
        list.appendChild(row);
      });
      $("songPlay").textContent = SONG.playing ? "■ STOP" : "▶ MORCEAU";
      $("songPlay").classList.toggle("on", SONG.playing);
      $("songLoop").textContent = "BOUCLER : " + (SONG.loop ? "OUI" : "NON");
      $("songLoop").classList.toggle("on", SONG.loop);
      const tot = SONG.steps.reduce((a, st) => a + (LP.Lf ? stepDur(st) / sr : 0), 0);
      $("songInfo").textContent = LP.Lf ? `${SONG.steps.length} partie(s) · ${Math.floor(tot / 60)} min ${String(Math.round(tot % 60)).padStart(2, "0")} s · ${curBpm().toFixed(1).replace(/\.0$/, "")} BPM` : "tempo défini par la première boucle du LOOPER";
    }
    const on = list.querySelector(".songrow.on .bar"); if (on && prog) on.style.width = (prog.f * 100) + "%";
  }
  function songEdit(label, fn) {
    const before = JSON.stringify(SONG.steps); fn(); const after = JSON.stringify(SONG.steps);
    pushHist(label, () => { SONG.steps = JSON.parse(before); drawSong(true); }, () => { SONG.steps = JSON.parse(after); drawSong(true); });
    drawSong(true);
  }
  $("songPlay").addEventListener("click", () => SONG.playing ? (songStop(), stopAll()) : songPlay());
  $("songLoop").addEventListener("click", () => { SONG.loop = !SONG.loop; drawSong(true); });
  $("songAdd").addEventListener("click", () => songEdit("ajouter une partie", () => { const last = SONG.steps[SONG.steps.length - 1]; SONG.steps.push({ s: last ? Math.min(7, last.s + 1) : SQ.cur, r: 2 }); }));
  // Boutons du sélecteur de séquences (LOOPER)
  {
    let drag = null;
    for (let i = 0; i < 8; i++) {
      const b = document.createElement("button"); b.type = "button"; b.className = "pat"; b.id = "sq" + i; b.textContent = SEQ_N[i]; b.dataset.i = i;
      b.addEventListener("pointerdown", e => { drag = { from: i, x: e.clientX, y: e.clientY }; });
      b.addEventListener("pointerup", e => {
        const el = document.elementFromPoint(e.clientX, e.clientY), to = el && el.dataset && el.dataset.i !== undefined ? +el.dataset.i : -1;
        if (drag && to >= 0 && to !== drag.from) copySeq(drag.from, to); else if (drag && drag.from === i) selectSeq(i);
        drag = null;
      });
      $("seqSel").appendChild(b);
    }
    document.addEventListener("pointerup", e => {
      if (!drag) return; const el = document.elementFromPoint(e.clientX, e.clientY), to = el && el.dataset && el.dataset.i !== undefined ? +el.dataset.i : -1;
      if (to >= 0 && to !== drag.from) copySeq(drag.from, to); drag = null;
    });
    const m = document.createElement("button"); m.type = "button"; m.className = "pat metro"; m.id = "metroBtn"; m.textContent = "MÉTRO";
    m.addEventListener("click", () => { SQ.metro = !SQ.metro; SQ.metroF = 0; drawSeqSel(); lcd("lcdPad", "MÉTRONOME", SQ.metro ? "activé" : "désactivé"); });
    $("seqSel").appendChild(m);
    drawSeqSel();
  }

