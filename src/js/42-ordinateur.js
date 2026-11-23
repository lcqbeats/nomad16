  // ---------- ORDINATEUR : mise en page paysage façon MPC 1000 sur grand écran avec souris ; touches F1 à F9 = onglets ----------
  const DESK_Q = window.matchMedia ? window.matchMedia("(min-width: 1000px) and (hover: hover) and (pointer: fine)") : null;
  // téléphone tenu en paysage : même mise en page que sur ordinateur, réduite à la largeur de l'écran
  const LAND_Q = window.matchMedia ? window.matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 560px)") : null;
  const FIT_W = 1000;
  let deskMode = store.get("layout", "auto");
  function fitDesk() {
    const m = document.querySelector(".machine"); if (!m) return;
    const fit = document.documentElement.classList.contains("deskfit");
    if (!fit) { m.style.transform = m.style.width = m.style.marginRight = m.style.marginBottom = ""; return; }
    const cs = getComputedStyle(document.body), W = window.innerWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const k = Math.min(1, W / FIT_W), H = m.offsetHeight;
    m.style.width = FIT_W + "px"; m.style.transform = `scale(${k})`;
    m.style.marginRight = -(FIT_W * (1 - k)) + "px"; m.style.marginBottom = -(H * (1 - k)) + "px";
    // pads aussi grands que possible : toute la largeur de la colonne, et les 4 rangées tiennent dans la hauteur de l'écran
    const pads = $("pads");
    if (pads && pads.offsetParent) {
      const top = (pads.getBoundingClientRect().top - m.getBoundingClientRect().top) / k, avail = window.innerHeight / k - top - 14;
      document.documentElement.style.setProperty("--padH", Math.max(70, Math.floor((avail - 3 * 8) / 4)) + "px");
    }
  }
  function applyDesk() {
    const land = deskMode === "auto" && LAND_Q && LAND_Q.matches;
    const on = deskMode === "desk" || (deskMode === "auto" && DESK_Q && DESK_Q.matches) || land;
    document.documentElement.classList.toggle("desk", on);
    document.documentElement.classList.toggle("deskfit", !!land);
    fitDesk();
    const b = $("layoutBtn"); if (b) b.textContent = "AFFICHAGE : " + { auto: "AUTOMATIQUE", phone: "TÉLÉPHONE", desk: "ORDINATEUR" }[deskMode];
    if (typeof drawSpPads === "function" && tab === "sp") drawSpPads();
    if (typeof placeScrDisk === "function") placeScrDisk();
  }
  // grille 3×3 : jouer (PADS LOOPER SONS), matière (DIGGING SCRATCH GUITARE), finition (FX SP SONG), même ordre que sur téléphone
  TABS.forEach((t, i) => { const el = $("tab-" + t); if (el) el.dataset.f = i + 1; });
  [DESK_Q, LAND_Q].forEach(q => { if (q) { try { q.addEventListener("change", applyDesk); } catch (e) { q.addListener && q.addListener(applyDesk); } } });
  window.addEventListener("resize", () => requestAnimationFrame(fitDesk));
  if (window.ResizeObserver) new ResizeObserver(() => { if (document.documentElement.classList.contains("deskfit")) requestAnimationFrame(fitDesk); }).observe(document.querySelector(".machine"));
  $("layoutBtn").addEventListener("click", () => { deskMode = { auto: "desk", desk: "phone", phone: "auto" }[deskMode]; store.set("layout", deskMode); applyDesk(); });
  // rangée du haut d'un clavier AZERTY (Mac) sans Maj : & é " ' ( § è ! ç = onglets 1 à 9 ; F1 à F9 marchent aussi
  const AZ_TABS = ["&", "é", "\"", "'", "(", "§", "è", "!", "ç"];
  window.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;
    const m = /^F([1-9])$/.exec(e.key), a = AZ_TABS.indexOf(e.key);
    if (!m && a < 0) return;
    const t = TABS[m ? +m[1] - 1 : a]; if (!t) return;
    e.preventDefault(); setTab(t); lcd("lcdPad", "ONGLET", $("tab-" + t).textContent);
  });
  applyDesk();
