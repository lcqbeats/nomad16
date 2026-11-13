  // ---------- LOOPER : enregistrer le jeu des muets / solos, puis en faire une ligne de SONG ou un WAV ----------
  // Pendant l'enregistrement, chaque coupure / solo est noté ; à l'arrêt, tout est calé sur les tours de boucle
  // (un changement compte pour le tour le plus proche). → SONG crée une séquence par état et la ligne du morceau ;
  // → WAV rend tout de suite le morceau joué.
  const PERF = { rec: false, startF: 0, ev: [], seq: 0, layers: null, C: 0, take: null, t: null };
  const perfMask = () => LP.layers.map(l => !!l.muted);
  const perfNow = () => ctx.currentTime * sr - compF();
  function perfMark() { if (!PERF.rec) return; const m = perfMask(), last = PERF.ev[PERF.ev.length - 1]; if (last && last.mask.join() === m.join()) return; PERF.ev.push({ F: perfNow(), mask: m }); }
  function perfToggle() {
    if (!ctx) return;
    if (PERF.rec) { perfStop(); return; }
    if (!LP.playing || !LP.layers.length || LP.t0F === null) { lcd("lcdLoop", "JEU", "lance d'abord tes boucles (PLAY)"); return; }
    const C = cycF(LP.layers), now = perfNow();
    PERF.C = C; PERF.startF = LP.t0F + Math.round((now - LP.t0F) / C) * C; PERF.seq = SQ.cur; PERF.layers = LP.layers.slice();
    PERF.ev = [{ F: PERF.startF, mask: perfMask() }]; PERF.rec = true;
    PERF.t = setInterval(drawPerf, 250); drawPerf();
    lcd("lcdLoop", "JEU", "enregistrement du jeu : coupe, rétablis, solo… puis ■ pour finir");
  }
  function perfStop() {
    PERF.rec = false; clearInterval(PERF.t);
    if (SQ.cur !== PERF.seq || LP.layers.length !== PERF.layers.length || LP.layers.some((l, i) => l !== PERF.layers[i])) { PERF.take = null; drawPerf(); lcd("lcdLoop", "JEU", "pistes changées pendant l'enregistrement : jeu abandonné"); return; }
    const C = PERF.C, n = Math.max(1, Math.min(64, Math.round((perfNow() - PERF.startF) / C)));
    const masks = [];
    for (let c = 0; c < n; c++) { let m = PERF.ev[0].mask; PERF.ev.forEach(e => { if (Math.round((e.F - PERF.startF) / C) <= c) m = e.mask; }); masks.push(m); }
    PERF.take = { masks, C, layers: PERF.layers.slice(), seq: PERF.seq };
    const states = new Set(masks.map(m => m.join())).size;
    drawPerf();
    lcd("lcdLoop", "JEU", `${n} tours enregistrés · ${states} état(s) · → SONG ou → WAV`);
  }
  function drawPerf() {
    const b = $("perfRec"); if (!b) return;
    b.classList.toggle("on", PERF.rec);
    b.textContent = PERF.rec ? `■ ARRÊTER · ${Math.max(0, Math.round((perfNow() - PERF.startF) / PERF.C))} tours` : "● ENREGISTRER LE JEU";
    $("perfSong").disabled = $("perfWav").disabled = !PERF.take;
    $("perfInfo").textContent = PERF.take ? `jeu : ${PERF.take.masks.length} tours, ${new Set(PERF.take.masks.map(m => m.join())).size} état(s) des pistes` : "Enregistre tes coupures et solos pendant que les boucles tournent, puis envoie-les dans SONG ou en WAV.";
  }
  // → SONG : une séquence (copie légère des pistes, mêmes sons) par état, et la ligne du morceau dans l'ordre joué
  function perfToSong() {
    const tk = PERF.take; if (!tk) return;
    const keys = [...new Set(tk.masks.map(m => m.join()))];
    const free = SQ.list.map((x, i) => i).filter(i => !SQ.list[i].length && i !== SQ.cur);
    if (keys.length > free.length) { lcd("lcdPad", "JEU", `il faut ${keys.length} séquences libres, il y en a ${free.length} : efface-en ou simplifie le jeu`); return; }
    const slot = {}, made = [];
    keys.forEach((k, j) => {
      const m = k.split(",").map(x => x === "true"), i = free[j];
      const arr = tk.layers.map((l, q) => { const gain = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 256; gain.gain.value = m[q] ? 0 : l.vol; gain.connect(loopBus); return { buf: l.buf, k: l.k, m: l.m, gain, an, vol: l.vol, muted: m[q], src: null, notes: l.notes }; });
      slot[k] = i; made.push([i, arr]);
    });
    const steps = []; tk.masks.forEach(m => { const s = slot[m.join()], last = steps[steps.length - 1]; if (last && last.s === s) last.r++; else steps.push({ s, r: 1 }); });
    const oldSteps = JSON.parse(JSON.stringify(SONG.steps));
    const put = on => { made.forEach(([i, arr]) => { const T = SQ.list[i]; T.length = 0; if (on) arr.forEach(l => T.push(l)); }); SONG.steps = on ? JSON.parse(JSON.stringify(steps)) : JSON.parse(JSON.stringify(oldSteps)); drawSong(true); drawSeqSel(); };
    put(true);
    pushHist("jeu → SONG", () => put(false), () => put(true));
    lcd("lcdPad", "JEU", `ligne SONG créée : ${steps.map(s => SEQ_N[s.s] + "×" + s.r).join(" ")} (séquences ${made.map(x => SEQ_N[x[0]]).join(", ")})`);
  }
  // → WAV : le jeu rendu tel quel, avec de courts fondus aux changements, puis le mastering choisi dans SONG
  async function perfToWav() {
    const tk = PERF.take; if (!tk) return;
    const st = loopStems(tk.layers, false); if (!st) return;
    const C = st.L, n = tk.masks.length, N = C * n;
    if (N > sr * 60 * 12) { lcd("lcdPad", "JEU", "trop long (12 min max)"); return; }
    const out = [new Float32Array(N), new Float32Array(N)], F = Math.round(0.004 * sr), lb = loopBus.gain.value;
    tk.layers.forEach((l, q) => {
      for (let c = 0; c < n; c++) {
        if (tk.masks[c][q]) continue;
        const fin = c > 0 && tk.masks[c - 1][q], fout = c < n - 1 && tk.masks[c + 1][q];
        for (let ch = 0; ch < 2; ch++) { const s = st.stems[q][ch], o = out[ch]; for (let j = 0; j < C; j++) { let g = lb; if (fin && j < F) g *= j / F; if (fout && j > C - F) g *= (C - j) / F; o[c * C + j] += s[j] * g; } }
      }
    });
    normalize(out);
    const m = await masterMix(out);
    deliver(wavBlob(m, sr), `nomad16-jeu-${Math.round(curBpm())}bpm${MASTER.char !== "none" ? "-master-" + MASTER.char : ""}-${stamp()}.wav`);
  }
  $("perfRec").addEventListener("click", perfToggle);
  $("perfSong").addEventListener("click", perfToSong);
  $("perfWav").addEventListener("click", perfToWav);
  drawPerf();
