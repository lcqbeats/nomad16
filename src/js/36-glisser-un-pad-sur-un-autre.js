  // ---------- Glisser un pad sur un autre ----------
  let pm = null;
  function openPadMenu(a, b) { pm = { a, b }; $("padMenuT").firstChild.textContent = `PAD ${a + 1} → PAD ${b + 1} `; $("padMenu").hidden = false; }
  $("padMenuClose").addEventListener("click", () => { $("padMenu").hidden = true; });
  $("pmCopy").addEventListener("click", () => { const { a, b } = pm; kitEdit(`copier pad ${a + 1} → ${b + 1}`, () => { buffers[b] = buffers[a]; names[b] = names[a]; gains[b] = gains[a]; padParams[b] = { ...padParams[a] }; }); $("padMenu").hidden = true; });
  $("pmSwap").addEventListener("click", () => { const { a, b } = pm; kitEdit(`échanger pads ${a + 1} et ${b + 1}`, () => { [buffers[a], buffers[b]] = [buffers[b], buffers[a]]; [names[a], names[b]] = [names[b], names[a]]; [gains[a], gains[b]] = [gains[b], gains[a]]; [padParams[a], padParams[b]] = [padParams[b], padParams[a]]; }); $("padMenu").hidden = true; });
  $("pmMerge").addEventListener("click", () => {
    const { a, b } = pm, A = buffers[a], B = buffers[b];
    if (!A || !B) { $("padMenu").hidden = true; return; }
    kitEdit(`fusionner pads ${a + 1} + ${b + 1}`, () => {
      const len = Math.max(A.length, B.length), ch = Math.max(A.numberOfChannels, B.numberOfChannels), o = ctx.createBuffer(ch, len, sr);
      let pk = 0;
      for (let c = 0; c < ch; c++) { const d = o.getChannelData(c); [[A, gains[a] * padParams[a].level], [B, gains[b] * padParams[b].level]].forEach(([X, g]) => { const s = X.getChannelData(Math.min(c, X.numberOfChannels - 1)); for (let k = 0; k < s.length; k++) d[k] += s[k] * g; }); for (let k = 0; k < len; k++) pk = Math.max(pk, Math.abs(d[k])); }
      if (pk > 0.98) for (let c = 0; c < ch; c++) { const d = o.getChannelData(c); for (let k = 0; k < len; k++) d[k] *= 0.95 / pk; }
      buffers[b] = o; names[b] = ((names[b] || "") + "+" + (names[a] || "")).slice(0, 14); gains[b] = 1; padParams[b] = { ...PDEF };
    });
    $("padMenu").hidden = true;
  });

