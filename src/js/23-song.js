  // ---------- SONG : enchaînement des séquences ----------
  const SONG = { steps: [{ s: 0, r: 2 }], playing: false, idx: 0, loop: false, stepT0: 0, endT: null };
  const SEQ_N = "ABCDEFGH";
  function songPlay() {
    if (!ctx) return;
    if (LP.t0F === null) { lcd("lcdPad", "SONG", "enregistrez d'abord une boucle au LOOPER"); return; }
    if (!SONG.steps.length) return;
    SONG.idx = 0; SONG.endT = null;
    switchNow(SONG.steps[0].s);
    playAll();
    SONG.stepT0 = LP.t0F; SONG.playing = true; drawSong(true);
  }
  function songStop() { if (!SONG.playing) return; SONG.playing = false; clearTimeout(SONG.endT); SONG.endT = null; SQ.next = -1; SQ.sw = null; drawSong(true); drawSeqSel(); }
  function songTick() {
    if (!SONG.playing || !LP.playing || SQ.sw || LP.t0F === null) return;
    const st = SONG.steps[SONG.idx]; if (!st) { songStop(); return; }
    const endF = SONG.stepT0 + st.r * cycF(LP.layers), nowF = ctx.currentTime * sr;
    if (nowF < endF - 0.15 * sr) return;
    let idx = SONG.idx + 1;
    if (idx >= SONG.steps.length) {
      if (!SONG.loop) { const T = endF / sr; LP.layers.forEach(l => { if (l.src) { try { l.src.stop(T); } catch (e) {} } }); SONG.playing = false; SONG.endT = setTimeout(() => { stopAll(); drawSong(true); }, Math.max(0, (T - ctx.currentTime) * 1000)); drawSong(true); return; }
      idx = 0;
    }
    SONG.idx = idx; SONG.stepT0 = endF;
    const nx = SONG.steps[idx].s;
    if (nx !== SQ.cur) SQ.sw = { i: nx, bF: endF };
    drawSong(true);
  }
  // Interface SONG
  let songKey = "";
  function drawSong(force) {
    const list = $("songList");
    const prog = SONG.playing && LP.t0F !== null ? (() => { const st = SONG.steps[SONG.idx], C = cycF(LP.layers); const el = Math.max(0, ctx.currentTime * sr - SONG.stepT0); return { rep: Math.min(st.r, Math.floor(el / C) + 1), f: (el % C) / C }; })() : null;
    const key = JSON.stringify([SONG.steps, SONG.playing, SONG.idx, SONG.loop, prog && prog.rep, SQ.list.map(x => x.length)]);
    if (force || key !== songKey) {
      songKey = key;
      list.innerHTML = "";
      if (!SONG.steps.length) list.innerHTML = '<p class="songempty">Aucune partie. Touchez + PARTIE.</p>';
      SONG.steps.forEach((st, i) => {
        const row = document.createElement("div"); row.className = "songrow" + (SONG.playing && i === SONG.idx ? " on" : "");
        const bars = n => { const L = SQ.list[n]; if (!L.length || !LP.Lf) return "vide"; return Math.round(cycF(L) / LP.Lf * LP.beats / 4 * 10) / 10 + " m"; };
        row.innerHTML = `<span class="sn">${i + 1}</span><select aria-label="Séquence de la partie ${i + 1}">${[...SEQ_N].map((c, n) => `<option value="${n}"${n === st.s ? " selected" : ""}>${c} · ${bars(n)}</option>`).join("")}</select>
          <button type="button" data-a="m" aria-label="Moins de répétitions">−</button><span class="rp">×${st.r}${SONG.playing && i === SONG.idx && prog ? `<small>${prog.rep}/${st.r}</small>` : ""}</span><button type="button" data-a="p" aria-label="Plus de répétitions">+</button>
          <button type="button" data-a="u" aria-label="Monter">▲</button><button type="button" data-a="go" aria-label="Lancer depuis cette partie">▶</button><button type="button" data-a="x" aria-label="Supprimer">✕</button><i class="bar"></i>`;
        row.querySelector("select").addEventListener("change", e => songEdit("séquence de la partie", () => { st.s = +e.target.value; }));
        row.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
          const a = b.dataset.a;
          if (a === "m") songEdit("répétitions", () => { st.r = Math.max(1, st.r - 1); });
          if (a === "p") songEdit("répétitions", () => { st.r = Math.min(64, st.r + 1); });
          if (a === "u" && i > 0) songEdit("ordre des parties", () => { SONG.steps.splice(i - 1, 0, SONG.steps.splice(i, 1)[0]); if (SONG.playing && SONG.idx === i) SONG.idx--; });
          if (a === "x") songEdit("supprimer une partie", () => { SONG.steps.splice(i, 1); if (SONG.idx >= SONG.steps.length) SONG.idx = 0; });
          if (a === "go") { songPlay(); if (SONG.playing && i) { SONG.idx = i; switchNow(SONG.steps[i].s); playAll(); SONG.stepT0 = LP.t0F; drawSong(true); } }
        }));
        list.appendChild(row);
      });
      $("songPlay").textContent = SONG.playing ? "■ STOP" : "▶ MORCEAU";
      $("songPlay").classList.toggle("on", SONG.playing);
      $("songLoop").textContent = "BOUCLER : " + (SONG.loop ? "OUI" : "NON");
      $("songLoop").classList.toggle("on", SONG.loop);
      const tot = SONG.steps.reduce((a, st) => a + (LP.Lf ? st.r * cycF(SQ.list[st.s]) / sr : 0), 0);
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

