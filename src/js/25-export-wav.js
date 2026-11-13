  // ---------- Export WAV ----------
  function wavBlob(chs, rate) {
    const n = chs[0].length, nc = chs.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * nc * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * nc * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const x = chs[c][i]; v.setInt16(o, x < 0 ? Math.max(-1, x) * 0x8000 : Math.min(1, x) * 0x7fff, true); o += 2; }
    return new Blob([buf], { type: "audio/wav" });
  }
  async function deliver(blob, name, type = "audio/wav") {
    const file = new File([blob], name, { type });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); lcd("lcdPad", "EXPORT", name + " partagé"); return; } } catch (e) { if (e.name === "AbortError") return; }
    try { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); lcd("lcdPad", "EXPORT", name + " téléchargé"); }
    catch (e) { lcd("lcdPad", "EXPORT", "impossible ici : ouvrez la page dans Safari ou Chrome"); }
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  $("expLoop").addEventListener("click", async () => {
    if (!allLayers().length) { lcd("lcdPad", "EXPORT", "aucune boucle, rien à exporter"); return; }
    const out = await masterMix(loopStems(allLayers()).mix);   // ce qu'on entend : les 3 banks, pistes coupées comprises
    deliver(wavBlob(out, sr), `nomad16-boucles-${Math.round(curBpm())}bpm${MASTER.char !== "none" ? "-master-" + MASTER.char : ""}-${stamp()}.wav`);
  });
  let sess = null;
  $("expSess").addEventListener("click", () => {
    if (!ctx) return;
    if (sess) {
      const { node, chunks } = sess; sess = null; try { mixOut.disconnect(node); } catch (e) {} node.disconnect();
      $("expSess").textContent = "● SESSION"; $("expSess").classList.remove("on");
      const n = chunks.reduce((s2, c) => s2 + c[0].length, 0), L = new Float32Array(n), R = new Float32Array(n); let o = 0;
      chunks.forEach(c => { L.set(c[0], o); R.set(c[1], o); o += c[0].length; });
      masterMix([L, R]).then(out => deliver(wavBlob(out, sr), `nomad16-session${MASTER.char !== "none" ? "-master-" + MASTER.char : ""}-${stamp()}.wav`));
      return;
    }
    if (!hasWorklet) { lcd("lcdPad", "EXPORT", "enregistrement non disponible ici"); return; }
    const node = new AudioWorkletNode(ctx, "nomad-cap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
    const chunks = [], max = sr * 600;
    node.port.onmessage = e => { if (chunks.length * 1024 < max) chunks.push([e.data.l, e.data.r]); };
    const silent = ctx.createGain(); silent.gain.value = 0; node.connect(silent); silent.connect(ctx.destination);
    mixOut.connect(node);
    sess = { node, chunks };
    $("expSess").textContent = "■ FIN SESSION"; $("expSess").classList.add("on");
    lcd("lcdPad", "SESSION", "enregistrement de tout ce qui sort (10 min max)");
  });

