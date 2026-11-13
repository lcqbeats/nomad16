  // ---------- Export multipiste + programme MPC (.xpm) ----------
  // Dossier zippé : Kit (16 WAV + programme de batterie .xpm), Pistes (une par piste du looper + mix + .xpm), MIDI (patterns du séquenceur)
  const MPC_NOTES = [37, 36, 42, 82, 40, 38, 46, 44, 48, 47, 45, 43, 49, 55, 51, 53, 54, 69, 81, 80, 65, 66, 76, 77, 56, 62, 63, 64, 73, 74, 71, 39,
    52, 57, 58, 59, 60, 61, 67, 68, 70, 72, 75, 78, 79, 35, 41, 50, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98,
    19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
    115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const ascii = (t, n = 24) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "_").slice(0, n) || "Son";
  const f6 = x => (+x).toFixed(6);
  function wav24(chs, rate) {
    const n = chs[0].length, nc = chs.length, bytes = n * nc * 3, buf = new ArrayBuffer(44 + bytes), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + bytes, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * nc * 3, true); v.setUint16(32, nc * 3, true); v.setUint16(34, 24, true); w(36, "data"); v.setUint32(40, bytes, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { let x = Math.round(Math.max(-1, Math.min(1, chs[c][i])) * 8388607); if (x < 0) x += 16777216; v.setUint8(o, x & 255); v.setUint8(o + 1, (x >> 8) & 255); v.setUint8(o + 2, (x >> 16) & 255); o += 3; }
    return new Uint8Array(buf);
  }
  const chans = b => Array.from({ length: Math.min(2, b.numberOfChannels) }, (_, c) => b.getChannelData(c));
  // Rend le son d'un pad tel qu'on l'entend (début/fin, reverse, attaque, decay, filtre, saleté, calage tempo) ; tune, pan, niveau et mute restent réglables sur la MPC
  async function renderPad(i) {
    const base = buffers[i]; if (!base) return null;
    const pp = padParams[i], ts = pp.fitBeats && pp.fitMode ? stretched(i, true) : null;
    let buf = pp.rev ? reversed(base) : base, dur = buf.duration;
    let s0 = pp.start * dur, s1 = Math.max(s0 + 0.005, pp.end * dur);
    if (pp.rev) { const a = dur - s1, b = dur - s0; s0 = a; s1 = b; }
    if (ts) { buf = ts; s0 = 0; s1 = ts.duration; }
    const rate = ts ? 1 : (pp.fit || 1), len = (s1 - s0) / rate;
    const end = (!pp.loop && pp.decay < 0.99) ? Math.min(len, 0.03 + Math.pow(pp.decay, 2) * len) : len;
    const oc = new OfflineAudioContext(Math.min(2, buf.numberOfChannels), Math.max(1, Math.ceil(end * sr)), sr);
    const src = oc.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = oc.createGain(); src.connect(g); let head = g;
    if (Math.abs(pp.tone - 0.5) > 0.03) { const f = oc.createBiquadFilter(); if (pp.tone < 0.5) { f.type = "lowpass"; f.frequency.value = 150 * Math.pow(18000 / 150, pp.tone / 0.5); } else { f.type = "highpass"; f.frequency.value = 20 * Math.pow(5000 / 20, (pp.tone - 0.5) / 0.5); } head.connect(f); head = f; }
    head = eqChain(oc, pp, head);
    if (pp.dirt > 0.02) { const ws = oc.createWaveShaper(); ws.curve = driveCurve(pp.dirt); const mk = oc.createGain(); mk.gain.value = 1 - pp.dirt * 0.35; head.connect(ws); ws.connect(mk); head = mk; }
    head.connect(oc.destination);
    const att = pp.att * pp.att * 1.5;
    if (att > 0.002) { g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, att); }
    if (end < len) { g.gain.setValueAtTime(1, Math.max(att, end * 0.6)); g.gain.linearRampToValueAtTime(0, end); }
    src.start(0, s0, s1 - s0);
    return oc.startRendering();
  }
  function xpmInstrument(n, o) {
    const layer = (k, name, frames) => `          <Layer number="${k}">
            <Active>True</Active>
            <Volume>1.000000</Volume>
            <Pan>0.500000</Pan>
            <Pitch>0.000000</Pitch>
            <TuneCoarse>0</TuneCoarse>
            <TuneFine>0</TuneFine>
            <VelStart>0</VelStart>
            <VelEnd>127</VelEnd>
            <SampleStart>0</SampleStart>
            <SampleEnd>0</SampleEnd>
            <Loop>False</Loop>
            <LoopStart>0</LoopStart>
            <LoopEnd>0</LoopEnd>
            <LoopCrossfadeLength>0</LoopCrossfadeLength>
            <LoopTune>0</LoopTune>
            <Mute>False</Mute>
            <RootNote>0</RootNote>
            <KeyTrack>False</KeyTrack>
            <SampleName>${name}</SampleName>
            <SampleFile></SampleFile>
            <SliceIndex>129</SliceIndex>
            <Direction>0</Direction>
            <Offset>0</Offset>
            <SliceStart>0</SliceStart>
            <SliceEnd>${frames}</SliceEnd>
            <SliceLoopStart>0</SliceLoopStart>
            <SliceLoop>${k === 1 && o.loop ? 1 : 0}</SliceLoop>
            <SliceLoopCrossFadeLength>0</SliceLoopCrossFadeLength>
          </Layer>
`;
    return `      <Instrument number="${n}">
        <CueBusEnable>False</CueBusEnable>
        <AudioRoute>
          <AudioRoute>0</AudioRoute>
          <AudioRouteSubIndex>0</AudioRouteSubIndex>
          <AudioRouteChannelBitmap>3</AudioRouteChannelBitmap>
          <InsertsEnabled>True</InsertsEnabled>
        </AudioRoute>
        <Send1>0.000000</Send1>
        <Send2>0.000000</Send2>
        <Send3>0.000000</Send3>
        <Send4>0.000000</Send4>
        <Volume>${f6(o.vol)}</Volume>
        <Mute>False</Mute>
        <Solo>False</Solo>
        <Pan>${f6(o.pan)}</Pan>
        <AutomationFilter>1</AutomationFilter>
        <TuneCoarse>${o.coarse}</TuneCoarse>
        <TuneFine>${o.fine}</TuneFine>
        <Mono>True</Mono>
        <Polyphony>1</Polyphony>
        <FilterKeytrack>0.000000</FilterKeytrack>
        <LowNote>0</LowNote>
        <HighNote>127</HighNote>
        <IgnoreBaseNote>False</IgnoreBaseNote>
        <ZonePlay>1</ZonePlay>
        <MuteGroup>${o.mute}</MuteGroup>
        <MuteTarget1>0</MuteTarget1>
        <MuteTarget2>0</MuteTarget2>
        <MuteTarget3>0</MuteTarget3>
        <MuteTarget4>0</MuteTarget4>
        <SimultTarget1>0</SimultTarget1>
        <SimultTarget2>0</SimultTarget2>
        <SimultTarget3>0</SimultTarget3>
        <SimultTarget4>0</SimultTarget4>
        <LfoPitch>0.000000</LfoPitch>
        <LfoCutoff>0.000000</LfoCutoff>
        <LfoVolume>0.000000</LfoVolume>
        <LfoPan>0.000000</LfoPan>
        <OneShot>${o.oneshot ? "True" : "False"}</OneShot>
        <FilterType>2</FilterType>
        <Cutoff>1.000000</Cutoff>
        <Resonance>0.000000</Resonance>
        <FilterEnvAmt>0.000000</FilterEnvAmt>
        <AfterTouchToFilter>0.000000</AfterTouchToFilter>
        <VelocityToStart>0.000000</VelocityToStart>
        <VelocityToFilterAttack>0.000000</VelocityToFilterAttack>
        <VelocityToFilter>0.000000</VelocityToFilter>
        <VelocityToFilterEnvelope>0.000000</VelocityToFilterEnvelope>
        <FilterAttack>0.000000</FilterAttack>
        <FilterDecay>0.047244</FilterDecay>
        <FilterSustain>1.000000</FilterSustain>
        <FilterRelease>0.000000</FilterRelease>
        <FilterHold>0.000000</FilterHold>
        <FilterDecayType>True</FilterDecayType>
        <FilterADEnvelope>True</FilterADEnvelope>
        <VolumeHold>0.000000</VolumeHold>
        <VolumeDecayType>True</VolumeDecayType>
        <VolumeADEnvelope>True</VolumeADEnvelope>
        <VolumeAttack>0.000000</VolumeAttack>
        <VolumeDecay>0.047244</VolumeDecay>
        <VolumeSustain>1.000000</VolumeSustain>
        <VolumeRelease>${f6(o.release)}</VolumeRelease>
        <VelocityToPitch>0.000000</VelocityToPitch>
        <VelocityToVolumeAttack>0.000000</VelocityToVolumeAttack>
        <VelocitySensitivity>1.000000</VelocitySensitivity>
        <VelocityToPan>0.000000</VelocityToPan>
        <LFO>
          <Type>Sine</Type>
          <Rate>0.500000</Rate>
          <Sync>0</Sync>
          <Reset>False</Reset>
        </LFO>
        <WarpTempo>120.000000</WarpTempo>
        <BpmLock>True</BpmLock>
        <WarpEnable>False</WarpEnable>
        <StretchPercentage>100</StretchPercentage>
        <Layers>
${layer(1, o.name || "", o.frames || 0)}${layer(2, "", 0)}${layer(3, "", 0)}${layer(4, "", 0)}        </Layers>
      </Instrument>
`;
  }
  function makeXpm(name, pads) {
    const json = { ProgramPads: { Universal: { value0: false }, Type: { value0: 1 }, universalPad: 32512, pads: {}, UnusedPads: { value0: 1 } } };
    for (let i = 0; i < 128; i++) json.ProgramPads.pads["value" + i] = pads[i] ? pads[i].color : 0;
    const blob = JSON.stringify(json, null, 4).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    let x = `<?xml version="1.0" encoding="UTF-8"?>

<MPCVObject>
  <Version>
    <File_Version>2.1</File_Version>
    <Application>MPC-V</Application>
    <Application_Version>2.9.1.2</Application_Version>
    <Platform>Linux</Platform>
  </Version>
  <Program type="Drum">
    <ProgramName>${name}</ProgramName>
    <ProgramPads>${blob}</ProgramPads>
    <CueBusEnable>False</CueBusEnable>
    <AudioRoute>
      <AudioRoute>2</AudioRoute>
      <AudioRouteSubIndex>0</AudioRouteSubIndex>
      <AudioRouteChannelBitmap>3</AudioRouteChannelBitmap>
      <InsertsEnabled>True</InsertsEnabled>
    </AudioRoute>
    <Send1>0.000000</Send1>
    <Send2>0.000000</Send2>
    <Send3>0.000000</Send3>
    <Send4>0.000000</Send4>
    <Volume>0.710000</Volume>
    <Mute>False</Mute>
    <Solo>False</Solo>
    <Pan>0.500000</Pan>
    <AutomationFilter>1</AutomationFilter>
    <Pitch>0.000000</Pitch>
    <TuneCoarse>0</TuneCoarse>
    <TuneFine>0</TuneFine>
    <Mono>False</Mono>
    <Program_Polyphony>16</Program_Polyphony>
    <PortamentoTime>0.000000</PortamentoTime>
    <PortamentoLegato>False</PortamentoLegato>
    <PortamentoQuantized>False</PortamentoQuantized>
    <Program.Xfader.Route>0</Program.Xfader.Route>
    <Instruments>
`;
    const last = pads.reduce((m, p, i) => p ? i : m, 0);
    for (let i = 0; i <= last; i++) x += xpmInstrument(i, pads[i] || { vol: 0.707946, pan: 0.5, coarse: 0, fine: 0, mute: 0, oneshot: true, release: 0 });
    x += "    </Instruments>\n    <PadNoteMap>\n";
    for (let i = 0; i < 128; i++) x += `      <PadNote number="${i + 1}">\n        <Note>${MPC_NOTES[i]}</Note>\n      </PadNote>\n`;
    return x + "    </PadNoteMap>\n  </Program>\n</MPCVObject>\n";
  }
  // ZIP sans compression (lisible par l'app Fichiers : touchez le .zip pour obtenir le dossier)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function makeZip(files) {
    const parts = [], cen = []; let off = 0;
    const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    files.forEach(f => {
      const name = new TextEncoder().encode(f.name), data = typeof f.data === "string" ? new TextEncoder().encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(new Uint8Array(h.buffer), name, data); cen.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    });
    const cs = cen.reduce((s2, x) => s2 + x.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: "application/zip" });
  }
  function loopStems(layers = LP.layers, norm = true) {
    if (!layers.length) return null;
    const L = cycF(layers), mix = [new Float32Array(L), new Float32Array(L)];
    const stems = layers.map(l => {
      const out = [new Float32Array(L), new Float32Array(L)], LkL = l.k * LP.Lf, off = l.m * LP.Lf, pg = panGains(l), hk = l.hp ? Math.exp(-2 * Math.PI * 120 / sr) : 0;
      for (let c = 0; c < 2; c++) { const s2 = l.buf.getChannelData(Math.min(c, l.buf.numberOfChannels - 1)), g = l.vol * pg[c]; let px = 0, py = 0; for (let p = 0; p < L; p++) { let x = (s2[(((p - off) % LkL) + LkL) % LkL] || 0); if (hk) { const y = hk * (py + x - px); px = x; py = y; x = y; } x *= g; out[c][p] = x; if (!l.muted) mix[c][p] += x * loopBus.gain.value; } }
      return out;
    });
    if (norm) normalize(mix);
    return { stems, mix, L };
  }
  // panoramique d'une piste en gains gauche / droite (loi de balance, comme la table)
  function panGains(l) { const p = l.pan || 0; return [p > 0 ? 1 - p : 1, p < 0 ? 1 + p : 1]; }
  function normalize(chs) { let pk = 0; chs.forEach(c => { for (let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i])); }); if (pk > 0.98) chs.forEach(c => { for (let i = 0; i < c.length; i++) c[i] *= 0.95 / pk; }); }
  // Le morceau complet (onglet SONG) en un seul fichier
  function songMix() {
    if (!SONG.steps.length || !LP.Lf) return null;
    const mixes = SQ.list.map(x => x.length ? loopStems(x, false) : null);
    const lenOf = st => mixes[st.s] ? mixes[st.s].L : LP.Lf;
    const N = SONG.steps.reduce((a, st) => a + (st.take ? st.take.len : st.r * lenOf(st)), 0);
    if (N > sr * 60 * 12) return null;
    const out = [new Float32Array(N), new Float32Array(N)]; let o = 0;
    SONG.steps.forEach(st => {
      if (st.take) { const r = renderTake(st.take, false); out[0].set(r.mix[0], o); out[1].set(r.mix[1], o); o += st.take.len; return; }
      // une ligne de séquence joue toutes ses pistes
      const m = SQ.list[st.s].length ? loopStems(SQ.list[st.s].map(l => ({ ...l, muted: false })), false) : null, L = lenOf(st);
      for (let r = 0; r < st.r; r++) { if (m) { out[0].set(m.mix[0], o); out[1].set(m.mix[1], o); } o += L; }
    });
    normalize(out);
    return out;
  }
  // Fichier MIDI (format 1) : une piste par couche du looper. Pads → canal 10, notes des pads de la MPC (A01 = pad 1) ;
  // clavier → canal 1. 96 ticks par noire, tempo de la boucle.
  function makeMidi(name, bpm, L, layers) {
    const PPQ = 96, tick = f => Math.round(f / sr * bpm / 60 * PPQ);
    const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
    const txt = (type, s) => { const d = [...new TextEncoder().encode(s)]; return [0xff, type, ...vlq(d.length), ...d]; };
    const chunk = (id, data) => [...new TextEncoder().encode(id), (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255, ...data];
    const us = Math.round(60000000 / bpm), endT = tick(L);
    const head = [0, ...txt(3, name), 0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8, ...vlq(endT), 0xff, 0x2f, 0];
    const tracks = [chunk("MTrk", head)];
    layers.forEach((l, i) => {
      const ns = spreadNotes(l, L); if (!ns.length) return;
      const ev = [];
      ns.forEach(nt => {
        const ch = nt.kind === "pad" ? 9 : 0, note = nt.kind === "pad" ? MPC_NOTES[nt.n] : Math.max(0, Math.min(127, nt.n));
        const t0 = tick(nt.at), t1 = Math.min(endT, Math.max(t0 + 1, tick(nt.at + nt.dur)));
        ev.push([t0, 1, [0x90 | ch, note, nt.v]], [t1, 0, [0x80 | ch, note, 0]]);
      });
      ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const data = [0, ...txt(3, `Piste ${i + 1}`)]; let last = 0;
      ev.forEach(([t, , m]) => { data.push(...vlq(t - last), ...m); last = t; });
      data.push(...vlq(Math.max(0, endT - last)), 0xff, 0x2f, 0);
      tracks.push(chunk("MTrk", data));
    });
    if (tracks.length === 1) return null;
    const hdr = chunk("MThd", [0, 1, 0, tracks.length, 0, PPQ]);
    return new Uint8Array([...hdr, ...tracks.flat()]);
  }
  const PAD_COLORS = i => i < 8 ? 0xD92B2F : 0x1D9C74, STEM_COLORS = [0xD92B2F, 0x1D9C74, 0xF2B705, 0x4C8DD9, 0xC86BD9, 0xE8E2D4];
  async function exportMpc() {
    if (!ctx) return;
    const btn = $("expMpc"); btn.disabled = true; btn.textContent = "PRÉPARATION…";
    try {
      const kitMeta = kitIndex.find(k => k.id === kitCur), kitN = ascii(kitMeta ? kitMeta.name : "Kit", 20), bpm = Math.round(curBpm());
      const root = `NOMAD16_${kitN}_${stamp()}`, files = [];
      // 1. Kit : 16 sons + programme de batterie
      const kitDir = `${root}/Kit_${kitN}/`, pads = [];
      for (let i = 0; i < 16; i++) {
        const b = await renderPad(i); if (!b) continue;
        const pp = padParams[i], nm = `N16_${String(i + 1).padStart(2, "0")}_${ascii(names[i], 16)}`;
        files.push({ name: kitDir + nm + ".wav", data: wav24(chans(b), sr) });
        pads[i] = { name: nm, frames: b.length, vol: Math.min(1, 0.707946 * pp.level * (gains[i] ?? 1)), pan: 0.5 + pp.pan / 2, coarse: pp.tune, fine: 0,
          mute: kitChoke ? 1 : (pp.choke || ((i === 2 || i === 3) && !padParams[2].choke && !padParams[3].choke ? 7 : 0)), oneshot: pp.oneshot && !pp.loop, loop: pp.loop, release: pp.oneshot ? 0 : Math.min(1, pp.rel), color: PAD_COLORS(i) };
      }
      files.push({ name: kitDir + `NOMAD16_${kitN}.xpm`, data: makeXpm(`NOMAD16 ${kitN}`, pads) });
      // 2. Chaque bank : une piste par couche + mix + programme (piste n sur le pad A0n, mix sur A07)
      const seqDone = []; let midiDone = false;
      for (let q = 0; q < SQ.list.length; q++) {
        const st = loopStems(SQ.list[q]); if (!st) continue;
        btn.textContent = "BANK " + SEQ_N[q] + "…"; await new Promise(r => setTimeout(r, 0));
        const bars = Math.round(st.L / LP.Lf * LP.beats / 4 * 10) / 10, tag = `Bank${SEQ_N[q]}_${bpm}bpm`, dir = `${root}/Bank_${SEQ_N[q]}_${bars}mes_${bpm}bpm/`, sp = [];
        st.stems.forEach((ch, i) => { const nm = `N16_${tag}_Piste${i + 1}`; files.push({ name: dir + nm + ".wav", data: wav24(ch, sr) }); sp[i] = { name: nm, frames: st.L, vol: 0.707946, pan: 0.5, coarse: 0, fine: 0, mute: 0, oneshot: true, release: 0, color: STEM_COLORS[i] }; });
        files.push({ name: dir + `N16_${tag}_Mix.wav`, data: wav24(st.mix, sr) });
        sp[6] = { name: `N16_${tag}_Mix`, frames: st.L, vol: 0.707946, pan: 0.5, coarse: 0, fine: 0, mute: 0, oneshot: true, release: 0, color: 0xFFFFFF };
        files.push({ name: dir + `NOMAD16_${tag}.xpm`, data: makeXpm(`NOMAD16 ${tag}`, sp) });
        const mid = makeMidi(`NOMAD16 ${tag}`, curBpm(), st.L, SQ.list[q]);
        if (mid) { files.push({ name: dir + `NOMAD16_${tag}_notes.mid`, data: mid }); midiDone = true; }
        seqDone.push(`${SEQ_N[q]} (${bars} mes., ${st.stems.length} piste(s))`);
      }
      // 3. Le morceau (onglet SONG)
      let songTxt = "";
      if (seqDone.length) {
        btn.textContent = "MORCEAU…"; await new Promise(r => setTimeout(r, 0));
        const sm = songMix();
        if (sm) { files.push({ name: `${root}/NOMAD16_Morceau_${bpm}bpm.wav`, data: wav24(sm, sr) }); songTxt = `NOMAD16_Morceau_${bpm}bpm.wav : le morceau complet, dans l'ordre de l'onglet SONG :\r\n` + SONG.steps.map((st, i) => st.take ? `  ${i + 1}. PRISE ${st.take.n} (${fmtLen(st.take.len)}) : pistes séparées dans Prise_${st.take.n}` : `  ${i + 1}. séquence ${SEQ_N[st.s]} x${st.r}`).join("\r\n") + "\r\n"; }
        // prises : chaque piste rendue avec ses coupures, sur toute la durée de la prise
        for (const st of SONG.steps.filter(x => x.take)) {
          btn.textContent = "PRISE " + st.take.n + "…"; await new Promise(r => setTimeout(r, 0));
          const r = renderTake(st.take, true);
          Object.entries(r.stems).forEach(([nm, chs]) => files.push({ name: `${root}/Prise_${st.take.n}/NOMAD16_Prise${st.take.n}_${nm}.wav`, data: wav24(chs, sr) }));
          normalize(r.mix); files.push({ name: `${root}/Prise_${st.take.n}/NOMAD16_Prise${st.take.n}_mix.wav`, data: wav24(r.mix, sr) });
        }
      }
      files.push({ name: `${root}/LISEZMOI.txt`, data: `NOMAD-16 - export du ${new Date().toLocaleString("fr-FR")}\r\nTempo : ${bpm} BPM\r\n\r\nKit_${kitN} : les 16 sons (WAV 24 bits, 44,1/48 kHz) et le programme de batterie NOMAD16_${kitN}.xpm.\r\n  Pad 1 de l'Akai = pad A01 de la MPC. Tune, pan, niveau et groupes de mute sont repris dans le programme.\r\n  Filtre, saleté, attaque, decay, reverse et découpe sont déjà appliqués aux WAV. L'écho n'est pas inclus.\r\n` + (seqDone.length ? `Sequence_X : pour chaque séquence du looper (${seqDone.join(", ")}), une piste WAV par couche, toutes de la même longueur et calées au début, plus le mix.\r\n  Le programme .xpm de chaque dossier met les pistes sur les pads A01 à A06 et le mix sur A07.\r\n` : "") + (midiDone ? `  _notes.mid : les notes jouées pendant l'enregistrement de chaque piste (une piste MIDI par couche). Pads sur le canal 10, avec les notes des pads de la MPC (pad 1 = A01) : à jouer avec le programme du kit. Clavier sur le canal 1.\r\n` : "") + songTxt + `\r\nSur la MPC : copiez le dossier sur une carte SD ou une clé USB, ouvrez le .xpm depuis le navigateur de la MPC.\r\nGardez chaque .xpm dans le même dossier que ses WAV.\r\n` });
      const zip = makeZip(files);
      btn.textContent = "EXPORT MULTIPISTE + MPC";
      await deliver(zip, root + ".zip", "application/zip");
    } catch (e) { lcd("lcdPad", "EXPORT", "échec : " + e.message); }
    btn.disabled = false; btn.textContent = "EXPORT MULTIPISTE + MPC";
  }
  $("expMpc").addEventListener("click", exportMpc);
  $("songWav").addEventListener("click", async () => {
    const m = songMix();
    if (!m) { lcd("lcdPad", "SONG", LP.Lf ? "morceau vide ou trop long (12 min max)" : "enregistrez d'abord une boucle"); return; }
    const out = await masterMix(m);
    deliver(wavBlob(out, sr), `nomad16-morceau-${Math.round(curBpm())}bpm${MASTER.char !== "none" ? "-master-" + MASTER.char : ""}-${stamp()}.wav`);
  });
  $("loopKit").addEventListener("click", loopToKit);
  $("projImport").addEventListener("click", () => $("projFile").click());
  $("projFile").addEventListener("change", e => { const f = e.target.files[0]; if (f) importProjectFile(f); e.target.value = ""; });

