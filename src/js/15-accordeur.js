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
    if (Math.sqrt(rms / yinBuf.length) < 0.0015) return null;
    const W = 1024, maxT = Math.min(1000, Math.floor(sr / 60)), d = new Float32Array(maxT);
    for (let t = 1; t < maxT; t++) { let sum = 0; for (let i = 0; i < W; i++) { const x = yinBuf[i] - yinBuf[i + t]; sum += x * x; } d[t] = sum; }
    let run = 0, tau = -1;
    for (let t = 1; t < maxT; t++) { run += d[t]; const cm = d[t] * t / (run || 1); d[t] = cm; }
    for (let t = Math.floor(sr / 1100); t < maxT - 1; t++) { if (d[t] < 0.15) { while (t + 1 < maxT && d[t + 1] < d[t]) t++; tau = t; break; } }
    if (tau < 0) return null;
    const a = d[tau - 1], b = d[tau], c = d[tau + 1] ?? b;
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    return sr / (tau + (isFinite(shift) ? shift : 0));
  }
  // lecture stable : on suit la note qui sonne (même quand elle retombe), médiane des dernières mesures, aiguille lissée,
  // et la dernière lecture reste affichée (grisée) 2 s après que la corde s'est tue
  const TUN = { hist: [], cents: null, note: null, seen: 0 };
  const STRINGS = { 40: "corde 6 · grave", 45: "corde 5", 50: "corde 4", 55: "corde 3", 59: "corde 2", 64: "corde 1 · aigu" };
  function drawTuner() {
    if (!tuning || !gn || !G.on) return;
    const now = performance.now(); if (now - tunLast < 40) return; tunLast = now;
    const f = detectPitch(), tun = $("tuner");
    if (f && f >= 40 && f <= 1200) {
      const m = 69 + 12 * Math.log2(f / 440);
      if (TUN.hist.length && Math.abs(m - TUN.hist[TUN.hist.length - 1]) > 0.7) TUN.hist = []; // autre corde : on repart
      TUN.hist.push(m); if (TUN.hist.length > 7) TUN.hist.shift();
      const med = TUN.hist.slice().sort((x, y) => x - y)[TUN.hist.length >> 1], n = Math.round(med), c = (med - n) * 100;
      if (TUN.note !== n || TUN.cents === null) TUN.cents = c; else TUN.cents += (c - TUN.cents) * 0.35;
      TUN.note = n; TUN.seen = now;
    } else if (now - TUN.seen > 2000) {
      TUN.note = null; TUN.cents = null; TUN.hist = []; tun.classList.remove("hold");
      $("tunNote").textContent = "—"; $("tunCents").textContent = ""; $("tunNeedle").style.left = "50%"; $("tunNeedle").style.background = "";
      $("tunDir").textContent = "jouez une corde et laissez-la sonner"; $("tunDir").style.color = ""; return;
    }
    if (TUN.note === null) return;
    tun.classList.toggle("hold", now - TUN.seen > 250);
    const n = TUN.note, cents = Math.round(TUN.cents), pc = ((n % 12) + 12) % 12, ok = Math.abs(cents) <= 3;
    $("tunNote").innerHTML = NOTE_FR[pc] + "<small>" + (STRINGS[n] || NOTE_EN[pc] + (Math.floor(n / 12) - 1)) + "</small>";
    $("tunCents").textContent = (cents > 0 ? "+" : "") + cents;
    const col = ok ? "#7dffa6" : Math.abs(cents) <= 12 ? "#e0b02a" : "#ff6b61";
    $("tunNote").style.color = col; $("tunNeedle").style.background = col;
    $("tunNeedle").style.left = (50 + Math.max(-48, Math.min(48, cents))) + "%";
    $("tunDir").style.color = col; $("tunCents").style.color = col;
    $("tunDir").textContent = ok ? "✓ JUSTE" : cents < 0 ? "♭ TROP BAS · tendez la corde" : "♯ TROP HAUT · détendez la corde";
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

