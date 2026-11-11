  // ---------- LOOPER → KIT : chaque piste de la séquence sur un pad, le mix, et le mix de chaque séquence ----------
  async function loopToKit() {
    if (!ctx || !LP.layers.length) { lcd("lcdPad", "→ KIT", "séquence vide"); return; }
    const mk = chs => { const b = ctx.createBuffer(2, chs[0].length, sr); b.getChannelData(0).set(chs[0]); b.getChannelData(1).set(chs[1]); return b; };
    const st = loopStems(LP.layers), nb = new Array(16).fill(null), nn = new Array(16).fill("—");
    st.stems.forEach((c, i) => { nb[i] = mk(c); nn[i] = `Piste ${i + 1} ${SEQ_N[SQ.cur]}`; });
    nb[7] = mk(st.mix); nn[7] = `Mix ${SEQ_N[SQ.cur]}`;
    SQ.list.forEach((x, q) => { if (x.length) { nb[8 + q] = mk(loopStems(x).mix); nn[8 + q] = `Séquence ${SEQ_N[q]}`; } });
    const d = new Date(), hh = String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
    const name = `LOOPER ${SEQ_N[SQ.cur]} · ${Math.round(curBpm())} BPM · ${hh}`, id = "user-" + Date.now().toString(36);
    const params = newParams(); params.forEach(p => { p.oneshot = true; });
    await DB.put("kits", { id, name, names: nn, gains: new Array(16).fill(1), params, chokeAll: false, bufs: nb.map(packBuf), created: Date.now() });
    await refreshUserKits(); await loadKit(id);
    lcd("lcdPad", "→ KIT", `kit « ${name} » créé`);
  }

