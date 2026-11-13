  // ---------- SONG : enchaînement des séquences ----------
  const SONG = { steps: [], playing: false, idx: 0, loop: false, stepT0: 0, endT: null, tkI: 0, sel: 0, prints: new Map(), keep: [], player: null, gate: null, print: null };
  // Prises imprimées : une ligne peut porter un son figé (take.pid → SONG.prints), joué à la place des boucles.
  // Les pistes passent par une « porte » (SONG.gate) qu'on ferme pendant une ligne imprimée ; le son imprimé, lui,
  // entre dans le bus des boucles, donc les effets FX / SP ciblés sur SONG le recolorent (impression par-dessus).
  function layGate() { if (!SONG.gate) { SONG.gate = ctx.createGain(); SONG.gate.connect(loopBus); } return SONG.gate; }
  // même porte pour la piste envoyée seule dans FX ou dans SP (P1 à P6), qui ne passe pas par le bus des boucles
  const GATES = {};
  function gateOf(k) { if (!GATES[k]) { GATES[k] = ctx.createGain(); GATES[k].connect(k === "fx" ? fxSolo : sp.lay); } return GATES[k]; }
  const allGates = () => [layGate(), ...Object.values(GATES)];
  function songStepAudio(st, F) {
    const T = Math.max(F / sr, ctx.currentTime), buf = st && st.take && st.take.pid && SONG.prints.get(st.take.pid);
    if (SONG.player) { try { SONG.player.stop(T); } catch (e) {} SONG.player = null; }
    allGates().forEach(g => g.gain.setTargetAtTime(buf ? 0 : 1, T, 0.003));
    if (!buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(loopBus); s.start(T); SONG.player = s;
  }
  function songAudioOff() { if (SONG.player) { try { SONG.player.stop(); } catch (e) {} SONG.player = null; } if (SONG.gate) allGates().forEach(g => { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setTargetAtTime(1, ctx.currentTime, 0.003); }); }
  const SEQ_N = "ABCDEFGH";
  // durée d'une ligne : une prise a sa longueur (les anciennes lignes « séquence × n » sont converties en prises)
  const stepDur = st => st.take ? st.take.len : st.r * cycF(SQ.list[st.s] || []);
  // prise : un événement = l'état muet / audible des pistes d'UNE bank, à l'instant F (les autres banks ne bougent pas)
  function takeApply(e, F) {
    const ls = SQ.list[e.seq] || [], T = Math.max(F / sr, ctx.currentTime);
    ls.forEach((l, q) => { const m = !!e.mask[q]; l.muted = m; l.gain.gain.cancelScheduledValues(T); l.gain.gain.setTargetAtTime(m ? 0 : l.vol, T, 0.004); });
    if (e.seq === SQ.cur) LP.solo = null;
    drawBanks();
  }
  // état de départ d'une prise (événements à t = 0) ; renvoie l'indice du premier geste
  function takeInit(tk, F) { let n = 0; while (n < tk.ev.length && tk.ev[n].t <= 0) takeApply(tk.ev[n++], F); return n; }
  function takeTick() {
    const st = SONG.steps[SONG.idx]; if (!st || !st.take) return;
    const ev = st.take.ev, nowF = ctx.currentTime * sr;
    while (SONG.tkI < ev.length && SONG.stepT0 + ev[SONG.tkI].t <= nowF + 0.14 * sr) { const e = ev[SONG.tkI++]; takeApply(e, SONG.stepT0 + e.t); }
  }
  // Anciennes lignes (séquence A à H × répétitions) et anciennes prises (qui changeaient de séquence) → prises sur les banks.
  // map : ancienne séquence → bank. Une séquence qu'on quitte devient muette, celle qu'on rejoint reprend son état.
  function songMigrate(steps, map) {
    const full = () => Array(6).fill(true), init = (b0, mask) => SQ.list.map((x, b) => ({ t: 0, seq: b, mask: b === b0 ? mask : full() }));
    const out = [];
    steps.forEach(st => {
      if (!st.take) {
        const b = map[st.s]; if (b === undefined || !SQ.list[b].length) return;
        out.push({ s: b, r: 1, take: { n: 0, label: `PARTIE ${SEQ_N[b]} ×${st.r}`, len: st.r * cycF(SQ.list[b]), ev: init(b, SQ.list[b].map(() => false)) } });
        return;
      }
      const e0 = st.take.ev; let cur = map[e0[0].seq]; if (cur === undefined) return;
      const ev = init(cur, e0[0].mask);
      e0.slice(1).forEach(e => { const b = map[e.seq]; if (b === undefined) return; if (b !== cur) { ev.push({ t: e.t, seq: cur, mask: full() }); cur = b; } ev.push({ t: e.t, seq: b, mask: e.mask }); });
      out.push({ s: map[st.s] ?? 0, r: 1, take: { ...st.take, ev } });
    });
    return out;
  }
  function songNormalize() { if (SONG.steps.some(st => !st.take)) SONG.steps = songMigrate(SONG.steps, { 0: 0, 1: 1, 2: 2 }); }
  function songPlay(from = 0) {
    if (!ctx) return;
    if (LP.t0F === null) { lcd("lcdPad", "SONG", "enregistrez d'abord une boucle au LOOPER"); return; }
    songNormalize();
    if (!SONG.steps.length) { lcd("lcdPad", "SONG", "aucune prise : ● ARMER UNE PRISE au LOOPER"); drawSong(true); return; }
    if (SONG.playing) songStop();
    SONG.idx = Math.min(from, SONG.steps.length - 1); SONG.endT = null;
    SONG.tkI = takeInit(SONG.steps[SONG.idx].take, ctx.currentTime * sr);
    playAll();
    SONG.stepT0 = LP.t0F; SONG.playing = true; SONG.sel = SONG.idx; songStepAudio(SONG.steps[SONG.idx], SONG.stepT0); drawSong(true);
  }
  function songStop() { if (SONG.print) songPrintEnd(SONG.print.pct > 0.98); songAudioOff(); if (!SONG.playing) return; SONG.playing = false; clearTimeout(SONG.endT); SONG.endT = null; SQ.next = -1; SQ.sw = null; drawSong(true); drawSeqSel(); }
  function songTick() {
    if (!SONG.playing || !LP.playing || LP.t0F === null) return;
    takeTick();
    const st = SONG.steps[SONG.idx]; if (!st) { songStop(); return; }
    const endF = SONG.stepT0 + stepDur(st), nowF = ctx.currentTime * sr;
    if (nowF < endF - 0.15 * sr) return;
    let idx = SONG.idx + 1;
    if (idx >= SONG.steps.length || SONG.print) {   // pendant une impression, le morceau s'arrête au bout de la ligne
      if (!SONG.loop || SONG.print) { const T = endF / sr; allLayers().forEach(l => { if (l.src) { try { l.src.stop(T); } catch (e) {} } }); SONG.playing = false; allGates().forEach(g => g.gain.setTargetAtTime(1, T + 0.01, 0.003)); SONG.endT = setTimeout(() => { if (!SONG.playing) stopAll(); drawSong(true); }, Math.max(0, (T - ctx.currentTime) * 1000 + 60)); drawSong(true); return; }
      idx = 0;
    }
    SONG.idx = idx; SONG.stepT0 = endF;
    const nst = SONG.steps[idx];
    SONG.tkI = nst.take ? takeInit(nst.take, endF) : 0;
    songStepAudio(nst, endF);
    drawSong(true);
  }
  // Interface SONG
  let songKey = "";
  function drawSong(force) {
    const list = $("songList");
    const prog = SONG.playing && LP.t0F !== null ? (() => { const st = SONG.steps[SONG.idx], C = cycAll(); const el = Math.max(0, ctx.currentTime * sr - SONG.stepT0); if (st.take) return { rep: 1, f: Math.min(1, el / st.take.len) }; return { rep: Math.min(st.r, Math.floor(el / C) + 1), f: (el % C) / C }; })() : null;
    const key = JSON.stringify([SONG.steps, SONG.playing, SONG.idx, SONG.loop, prog && prog.rep, SQ.list.map(x => x.length), !!SONG.print, SONG.sel, SONG.prints.size]);
    if (force || key !== songKey) {
      songKey = key;
      try { drawSpTargets(); drawFxPrint(); } catch (e) {}   // boutons SONG / IMPRIMER de FX et SP
      list.innerHTML = "";
      if (!SONG.steps.length) list.innerHTML = '<p class="songempty">Aucune partie. Au LOOPER : ● ARMER UNE PRISE, PLAY, joue tes muets et tes solos, STOP.</p>';
      SONG.steps.forEach((st, i) => {
        const row = document.createElement("div"); row.className = "songrow" + (SONG.playing && i === SONG.idx ? " on" : "");
        const bars = n => { const L = SQ.list[n]; if (!L.length || !LP.Lf) return "vide"; return Math.round(cycF(L) / LP.Lf * LP.beats / 4 * 10) / 10 + " m"; };
        if (st.take) {
          const ev = st.take.ev, n = ev.filter(e => e.t > 0).length, bk = [...new Set(ev.filter(e => (SQ.list[e.seq] || []).some((l, q) => !e.mask[q])).map(e => e.seq))].sort().map(b => SEQ_N[b]).join("+") || "—";
          row.classList.add("take");
          const pr = !!(st.take.pid && SONG.prints.has(st.take.pid)), now = SONG.print && SONG.print.i === i;
          row.classList.toggle("printed", pr); row.classList.toggle("sel", i === SONG.sel);
          row.innerHTML = `<span class="sn">${i + 1}</span><span class="tk"><b>${st.take.label || "PRISE " + st.take.n}</b>${pr ? ' <em class="prt">IMPRIMÉE</em>' : ""} · ${fmtLen(st.take.len)} · bank ${bk} · ${n} geste${n > 1 ? "s" : ""}</span>
            <button type="button" data-a="pr" class="prbtn${now ? " on" : ""}" aria-label="Imprimer les effets sur cette ligne">${now ? "■" : "●"}</button><button type="button" data-a="u" aria-label="Monter">▲</button><button type="button" data-a="go" aria-label="Lancer depuis cette partie">▶</button><button type="button" data-a="x" aria-label="Supprimer">✕</button><i class="bar"></i>`;
        } else
        row.innerHTML = `<span class="sn">${i + 1}</span><select aria-label="Séquence de la partie ${i + 1}">${[...SEQ_N].map((c, n) => `<option value="${n}"${n === st.s ? " selected" : ""}>${c} · ${bars(n)}</option>`).join("")}</select>
          <button type="button" data-a="m" aria-label="Moins de répétitions">−</button><span class="rp">×${st.r}${SONG.playing && i === SONG.idx && prog ? `<small>${prog.rep}/${st.r}</small>` : ""}</span><button type="button" data-a="p" aria-label="Plus de répétitions">+</button>
          <button type="button" data-a="u" aria-label="Monter">▲</button><button type="button" data-a="go" aria-label="Lancer depuis cette partie">▶</button><button type="button" data-a="x" aria-label="Supprimer">✕</button><i class="bar"></i>`;
        if (st.take) row.querySelector(".tk").addEventListener("click", () => { SONG.sel = i; drawSong(true); if (typeof drawFxPrint === "function") { drawFxPrint(); drawSpTargets(); } });
        if (!st.take) row.querySelector("select").addEventListener("change", e => songEdit("séquence de la partie", () => { st.s = +e.target.value; }));
        row.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
          const a = b.dataset.a;
          if (a === "m") songEdit("répétitions", () => { st.r = Math.max(1, st.r - 1); });
          if (a === "p") songEdit("répétitions", () => { st.r = Math.min(64, st.r + 1); });
          if (a === "u" && i > 0) songEdit("ordre des parties", () => { SONG.steps.splice(i - 1, 0, SONG.steps.splice(i, 1)[0]); if (SONG.playing && SONG.idx === i) SONG.idx--; });
          if (a === "x") songEdit("supprimer une partie", () => { SONG.steps.splice(i, 1); if (SONG.idx >= SONG.steps.length) SONG.idx = 0; });
          if (a === "go") songPlay(i);
          if (a === "pr") { if (SONG.print) songPrintEnd(false); else songPrint(i); }
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
  // Boutons du sélecteur de banks (LOOPER) : A, B, C ; glisser une bank sur une autre la copie
  {
    let drag = null;
    const at = e => { const el = document.elementFromPoint(e.clientX, e.clientY), b = el && el.closest && el.closest("[data-bank]"); return b && b.closest("#seqSel") ? +b.dataset.bank : -1; };
    for (let i = 0; i < NB; i++) {
      const b = document.createElement("button"); b.type = "button"; b.className = "pat bank"; b.id = "sq" + i; b.dataset.bank = i; b.innerHTML = `BANK ${SEQ_N[i]}<small></small>`;
      b.setAttribute("aria-label", "Bank " + SEQ_N[i]);
      b.addEventListener("pointerdown", () => { drag = { from: i }; });
      b.addEventListener("pointerup", e => { const to = at(e); if (drag && to >= 0 && to !== drag.from) copySeq(drag.from, to); else if (drag && drag.from === i) selectSeq(i); drag = null; });
      $("seqSel").appendChild(b);
    }
    document.querySelectorAll(".tbanks [data-bank]").forEach(b => b.addEventListener("click", () => selectSeq(+b.dataset.bank)));
    document.addEventListener("pointerup", e => { if (!drag) return; const to = at(e); if (to >= 0 && to !== drag.from) copySeq(drag.from, to); drag = null; });
    const m = document.createElement("button"); m.type = "button"; m.className = "pat metro"; m.id = "metroBtn"; m.textContent = "MÉTRO";
    m.addEventListener("click", () => { SQ.metro = !SQ.metro; SQ.metroF = 0; drawSeqSel(); lcd("lcdPad", "MÉTRONOME", SQ.metro ? "activé" : "désactivé"); });
    $("seqSel").appendChild(m);
    drawSeqSel();
  }

