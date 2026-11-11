  // ---------- TÉMOIN REC SUR LE MPK (expérimental) : horloge MIDI envoyée seulement pendant l'enregistrement ----------
  // Le MPK mini mk1 ne permet pas d'allumer ses voyants. Si son arpégiateur est réglé sur horloge externe (éditeur Akai),
  // son voyant TAP TEMPO clignote au rythme de l'horloge reçue : il clignote donc seulement quand NOMAD enregistre.
  const TAPLED = { on: store.get("tapLed", false), pads: store.get("padLed", false), rec: false, prec: false, next: 0, outs: [] };
  // Pads 8 et 16 allumés pendant le REC : NOMAD renvoie leur note (canal 10) et leur CC (preset 3) au MPK.
  // Le MPK mini mk1 n'est pas documenté pour ça : à essayer avec le bouton ESSAYER.
  function padLeds(on) {
    [[BASE_NOTE + 7, 27], [BASE_NOTE + 15, 35]].forEach(([n, cc]) => {
      midiOutSend(on ? [0x99, n, 127] : [0x89, n, 0]);
      midiOutSend(on ? [0x90, n, 127] : [0x80, n, 0]);
      midiOutSend([0xB0, cc, on ? 127 : 0]); midiOutSend([0xB9, cc, on ? 127 : 0]);
    });
  }
  function isRecording() {
    const p = LP.pending, nowF = ctx ? ctx.currentTime * sr : 0;
    if (p && p.type === "first" && p.phase === "rec") return true;
    if (p && p.type === "layer" && nowF - (p.comp || 0) >= p.sF) return true;
    if (SCR.rec && nowF >= SCR.rec.sF) return true;
    return $("spRec").classList.contains("on");
  }
  function midiOutSend(bytes) { TAPLED.outs.forEach(o => { try { o.send(bytes); } catch (e) {} }); }
  function tapLedTick() {
    if (!ctx || !TAPLED.outs.length) return;
    const rec = isRecording(), now = performance.now();
    if (TAPLED.pads && rec !== TAPLED.prec) { TAPLED.prec = rec; padLeds(rec); }
    if (!TAPLED.on) return;
    if (rec !== TAPLED.rec) { TAPLED.rec = rec; midiOutSend([rec ? 0xFA : 0xFC]); TAPLED.next = now; }
    if (!rec) return;
    const step = 60000 / curBpm() / 24;
    let n = 0; while (TAPLED.next <= now && n < 4) { midiOutSend([0xF8]); TAPLED.next += step; n++; }
    if (TAPLED.next < now) TAPLED.next = now + step;
  }
  setInterval(tapLedTick, 5);
  function drawTapLed() { $("tapLedBtn").textContent = "TÉMOIN REC SUR TAP TEMPO : " + (TAPLED.on ? "OUI" : "NON"); $("tapLedBtn").classList.toggle("on", TAPLED.on); }
  $("tapLedBtn").addEventListener("click", () => { TAPLED.on = !TAPLED.on; store.set("tapLed", TAPLED.on); if (!TAPLED.on && TAPLED.rec) { midiOutSend([0xFC]); TAPLED.rec = false; } drawTapLed(); });
  drawTapLed();
  function drawPadLed() { $("padLedBtn").textContent = "TÉMOIN REC SUR LES PADS 8 ET 16 : " + (TAPLED.pads ? "OUI" : "NON"); $("padLedBtn").classList.toggle("on", TAPLED.pads); }
  $("padLedBtn").addEventListener("click", () => { TAPLED.pads = !TAPLED.pads; store.set("padLed", TAPLED.pads); if (!TAPLED.pads && TAPLED.prec) { padLeds(false); TAPLED.prec = false; } drawPadLed(); });
  $("padLedTest").addEventListener("click", () => {
    if (!TAPLED.outs.length) { lcd("lcdPad", "MPK", "pas de sortie MIDI : seulement dans l'app iPhone, Akai branché"); return; }
    padLeds(true); lcd("lcdPad", "MPK", "pads 8 et 16 allumés ? (3 secondes)"); setTimeout(() => padLeds(false), 3000);
  });
  drawPadLed();

  // ---------- PRÉSENTATION (facultative, depuis l'écran d'accueil) ----------
  const TOUR = [
    ["NOMAD se joue au MPK", "L'écran sert à trouver ses marques ; le jeu se fait à l'Akai MPK mini, les yeux libres. Tout ce que font les pads, les potards et les boutons CC / PROG CHANGE est rangé dans RÉGLAGES → AIDE-MÉMOIRE AKAI."],
    ["Les pads", "Les 16 pads jouent le kit (banque A : 1 à 8, banque B : 9 à 16). PROG CHANGE puis un pad charge un autre kit. Dans PADS, les potards règlent le pad choisi : filtre, écho, saleté, attaque, hauteur, durée, panoramique, niveau."],
    ["Enregistrer en boucle", "La pédale Sustain fait REC : la première boucle part au premier son et se ferme au second appui, ce qui fixe le tempo. Chaque REC suivant ajoute une piste (6 par séquence). Huit séquences, A à H ; l'onglet SONG les enchaîne en morceau."],
    ["Trouver des sons", "DIGGING : un bac de disques libres de droits, à découper en chops. SCRATCH : une platine, au doigt ou aux pads. SONS : claviers et accords au clavier de l'Akai. GUITARE : un ampli et ses effets, via le micro ou une interface."],
    ["Transformer", "FX : des motifs rythmiques et des textures, joués aux pads. SP : la couleur du sampler de poche (vinyle, cassette, lo-fi) et le rééchantillonnage sur un pad. MIX : les volumes de chaque partie."],
    ["Garder, et finir sur MPC", "La session s'enregistre toute seule et se reprend depuis l'accueil, même sans réseau. Dans RÉGLAGES, une sauvegarde complète va dans l'app Fichiers. EXPORT MULTIPISTE + MPC (LOOPER) prépare pour la MPC les sons, les pistes, un programme et les notes jouées (.mid)."]
  ];
  let tourI = 0;
  function drawTour() {
    const [t, d] = TOUR[tourI];
    $("tourTitle").textContent = t; $("tourText").textContent = d;
    $("tourDots").innerHTML = TOUR.map((_, i) => `<i class="${i === tourI ? "on" : ""}"></i>`).join("");
    $("tourPrev").disabled = tourI === 0;
    $("tourNext").textContent = tourI === TOUR.length - 1 ? "TERMINER" : "SUIVANT";
  }
  $("tourBtn").addEventListener("click", () => { tourI = 0; drawTour(); $("tour").hidden = false; });
  $("tourPrev").addEventListener("click", () => { if (tourI > 0) { tourI--; drawTour(); } });
  $("tourNext").addEventListener("click", () => { if (tourI < TOUR.length - 1) { tourI++; drawTour(); } else $("tour").hidden = true; });
  $("tourClose").addEventListener("click", () => { $("tour").hidden = true; });
