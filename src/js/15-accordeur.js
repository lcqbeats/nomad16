  // ---------- Accordeur ----------
  let tunLast = 0;
  const NOTE_FR = ["DO", "DO#", "RÉ", "RÉ#", "MI", "FA", "FA#", "SOL", "SOL#", "LA", "LA#", "SI"];
  const NOTE_EN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  $("tunBtn").addEventListener("click", () => {
    tuning = !tuning;
    $("tuner").hidden = !tuning;
    $("tunBtn").classList.toggle("on", tuning);
    if (tuning && !G.on) startInput();
    applyGuitar();
  });
  const yinBuf = new Float32Array(2048);
  function detectPitch() {
    gn.analyser.getFloatTimeDomainData(yinBuf);
    let rms = 0; for (let i = 0; i < yinBuf.length; i++) rms += yinBuf[i] * yinBuf[i];
    if (Math.sqrt(rms / yinBuf.length) < 0.008) return null;
    const W = 1024, maxT = Math.min(1000, Math.floor(sr / 60)), d = new Float32Array(maxT);
    for (let t = 1; t < maxT; t++) { let sum = 0; for (let i = 0; i < W; i++) { const x = yinBuf[i] - yinBuf[i + t]; sum += x * x; } d[t] = sum; }
    let run = 0, tau = -1;
    for (let t = 1; t < maxT; t++) { run += d[t]; const cm = d[t] * t / (run || 1); d[t] = cm; }
    for (let t = Math.floor(sr / 1100); t < maxT - 1; t++) { if (d[t] < 0.12) { while (t + 1 < maxT && d[t + 1] < d[t]) t++; tau = t; break; } }
    if (tau < 0) return null;
    const a = d[tau - 1], b = d[tau], c = d[tau + 1] ?? b;
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    return sr / (tau + (isFinite(shift) ? shift : 0));
  }
  function drawTuner() {
    if (!tuning || !gn || !G.on) return;
    const now = performance.now(); if (now - tunLast < 60) return; tunLast = now;
    const f = detectPitch();
    if (!f || f < 40 || f > 1200) { $("tunNote").textContent = "—"; $("tunCents").textContent = ""; $("tunNeedle").style.left = "50%"; return; }
    const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m), cents = Math.round((m - n) * 100);
    const pc = ((n % 12) + 12) % 12;
    $("tunNote").textContent = NOTE_EN[pc];
    $("tunCents").textContent = (cents > 0 ? "+" : "") + cents + "¢";
    $("tunNote").title = NOTE_FR[pc];
    $("tunNeedle").style.left = (50 + cents) + "%";
    $("tunNote").style.color = Math.abs(cents) <= 3 ? "#7dffa6" : Math.abs(cents) <= 12 ? "#e0b02a" : "#ff6b61";
  }
  $("devSel").addEventListener("change", e => startInput(e.target.value));
  const meterBuf = new Float32Array(512);
  function drawMeter() {
    if (!gn || !G.on) { $("meter").style.width = "0"; return; }
    gn.analyser.getFloatTimeDomainData(meterBuf);
    let pk = 0; for (let i = 0; i < meterBuf.length; i++) pk = Math.max(pk, Math.abs(meterBuf[i]));
    const db = 20 * Math.log10(pk + 1e-6);
    $("meter").style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + "%";
  }

