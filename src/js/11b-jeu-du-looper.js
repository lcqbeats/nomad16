  // ---------- LOOPER : PRISES. On arme, PLAY lance la prise (ou tout de suite si ça tourne déjà), STOP la termine.
  // La prise retient les gestes (coupures, solos, sur les 3 banks) à l'instant près, sans aucun son :
  // elle devient UNE ligne de SONG, rejouée sur les boucles telles qu'elles sont (une boucle retouchée plus tard en profite).
  const PERF = { armed: false, rec: false, startF: 0, ev: [], t: null, n: store.get("takeN", 0), last: null };
  const perfMask = seq => (SQ.list[seq] || []).map(l => !!l.muted);
  const perfNow = () => ctx.currentTime * sr - compF();
  function perfMark(seq, F) {
    if (!PERF.rec) return;
    const s = seq === undefined ? SQ.cur : seq, m = perfMask(s), last = PERF.ev.filter(e => e.seq === s).pop();
    if (last && last.mask.join() === m.join()) return;
    PERF.ev.push({ t: Math.max(0, Math.round((F === undefined ? perfNow() : F) - PERF.startF)), seq: s, mask: m });
  }
  function perfBegin(startF) {
    PERF.armed = false; PERF.rec = true; PERF.startF = startF;
    PERF.ev = SQ.list.map((x, b) => ({ t: 0, seq: b, mask: perfMask(b) }));   // état de départ des 3 banks
    clearInterval(PERF.t); PERF.t = setInterval(drawPerf, 250); drawPerf();
    lcd("lcdLoop", "PRISE", "enregistrement : coupe, rétablis, solo, sur toutes les banks… STOP pour finir");
  }
  function perfArm() {
    if (!ctx) return;
    if (PERF.rec) { perfEnd(); return; }
    if (PERF.armed) { PERF.armed = false; drawPerf(); lcd("lcdLoop", "PRISE", "prise désarmée"); return; }
    if (LP.t0F === null) { lcd("lcdLoop", "PRISE", "enregistre d'abord une boucle"); return; }
    if (LP.playing) {   // ça tourne déjà : la prise part tout de suite, depuis le début du tour en cours
      const C = cycAll(), now = perfNow();
      perfBegin(LP.t0F + Math.floor((now - LP.t0F) / C) * C);
    } else { PERF.armed = true; drawPerf(); lcd("lcdLoop", "PRISE", "armée · choisis tes pistes de départ, puis PLAY"); }
  }
  // appelé par le looper : la lecture démarre / s'arrête
  function perfOnPlay() { if (PERF.armed && LP.t0F !== null) perfBegin(LP.t0F); }
  function perfOnStop() { if (PERF.rec) perfEnd(); }
  function perfEnd() {
    PERF.rec = false; clearInterval(PERF.t);
    const C = cycAll() || LP.Lf, endRaw = perfNow();
    const endF = LP.t0F + Math.max(1, Math.round((endRaw - LP.t0F) / C)) * C;   // fin calée sur le tour le plus proche
    const len = Math.max(C, Math.round(endF - PERF.startF));
    const ev = PERF.ev.filter(e => e.t < len);
    PERF.n++; store.set("takeN", PERF.n);
    const step = { s: SQ.cur, r: 1, take: { n: PERF.n, len, ev } };
    PERF.last = step;
    songEdit("prise " + PERF.n + " → SONG", () => { SONG.steps.push(JSON.parse(JSON.stringify(step))); });
    drawPerf();
    lcd("lcdLoop", "PRISE", `PRISE ${PERF.n} · ${fmtLen(len)} ajoutée dans SONG (ligne ${SONG.steps.length})`);
  }
  const fmtLen = f => { const s = Math.round(f / sr); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function drawPerf() {
    const b = $("perfRec"); if (!b) return;
    b.classList.toggle("on", PERF.rec); b.classList.toggle("armed", PERF.armed);
    b.textContent = PERF.rec ? `■ FIN DE PRISE · ${fmtLen(Math.max(0, perfNow() - PERF.startF))}` : PERF.armed ? "PRISE ARMÉE · PLAY POUR LANCER" : "● ARMER UNE PRISE";
    $("perfWav").disabled = !PERF.last;
    $("perfInfo").textContent = PERF.last ? `dernière prise : PRISE ${PERF.last.take.n} · ${fmtLen(PERF.last.take.len)} · ligne ajoutée dans SONG` : "Arme, choisis tes pistes de départ, PLAY : tout ce que tu coupes, rétablis ou mets en solo est enregistré. STOP termine : la prise devient une ligne de SONG.";
  }
  // rendu d'une prise : chaque piste suit ses coupures, avec de courts fondus ; renvoie le mix et les pistes séparées
  function renderTake(tk, wantStems) {
    const N = tk.len, mix = [new Float32Array(N), new Float32Array(N)], stems = {}, lb = loopBus.gain.value, a = 1 - Math.exp(-1 / (0.004 * sr));
    // chaque bank suit ses propres événements ; une bank sans événement garde son état actuel
    const segOf = sq => { const evb = tk.ev.filter(e => e.seq === sq), cur = { t: 0, mask: perfMask(sq) }, list = evb.length && evb[0].t <= 0 ? evb : [cur, ...evb];
      return list.map((e, i) => ({ mask: e.mask, t: i ? e.t : 0, end: i + 1 < list.length ? list[i + 1].t : N })); };
    SQ.list.forEach((ls, sq) => { const segs = segOf(sq); ls.forEach((l, q) => {
      const name = SEQ_N[sq] + "_piste" + (q + 1), out = wantStems ? [new Float32Array(N), new Float32Array(N)] : null, LkL = l.k * LP.Lf, off = l.m * LP.Lf, pg = panGains(l), hk = l.hp ? Math.exp(-2 * Math.PI * 120 / sr) : 0, hs = [[0, 0], [0, 0]];
      let g = 0;
      segs.forEach(sg => {
        const tgt = !(sg.mask[q] || false) ? l.vol * lb : 0;
        for (let t = sg.t; t < sg.end; t++) {
          g += (tgt - g) * a; if (g < 1e-5 && tgt === 0) { g = 0; continue; }
          const p = ((((t - off) % LkL) + LkL) % LkL);
          for (let c = 0; c < 2; c++) { let x = l.buf.getChannelData(Math.min(c, l.buf.numberOfChannels - 1))[p] || 0; if (hk) { const y = hk * (hs[c][1] + x - hs[c][0]); hs[c][0] = x; hs[c][1] = y; x = y; } const v = x * g * pg[c]; mix[c][t] += v; if (out) out[c][t] = v; }
        }
      });
      if (out && segs.some(sg => !sg.mask[q])) stems[name] = out;
    }); });
    return { mix, stems };
  }
  async function perfToWav() {
    const st = PERF.last; if (!st || !LP.Lf) return;
    if (st.take.len > sr * 60 * 12) { lcd("lcdPad", "PRISE", "trop long (12 min max)"); return; }
    const r = renderTake(st.take, false); normalize(r.mix);
    const m = await masterMix(r.mix);
    deliver(wavBlob(m, sr), `nomad16-prise${st.take.n}-${Math.round(curBpm())}bpm${MASTER.char !== "none" ? "-master-" + MASTER.char : ""}-${stamp()}.wav`);
  }
  $("perfRec").addEventListener("click", perfArm);
  $("perfWav").addEventListener("click", perfToWav);
  drawPerf();
